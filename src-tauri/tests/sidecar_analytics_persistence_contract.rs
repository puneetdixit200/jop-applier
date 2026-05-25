use careercaveman_lib::{
    commands::sidecar::run_due_scheduled_tasks_with_command,
    db::{
        models::{
            ApplicationWorkflowStateUpdate, SettingValue, UpsertApplication, UpsertJob,
            UpsertScheduledTask,
        },
        queries::{
            get_setting, save_scheduled_task, update_application_workflow_state,
            upsert_application, upsert_job,
        },
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;
use std::{fs, path::Path};

mod common;

#[test]
fn scheduled_analytics_refresh_sends_database_inputs_and_persists_snapshot() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let job = upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("linkedin-analytics-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/analytics-1".to_string(),
            title: "Frontend Engineer Intern".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: None,
            salary_max: None,
            salary_currency: "INR".to_string(),
            job_type: Some("internship".to_string()),
            experience_level: Some("intern".to_string()),
            description: Some("React internship".to_string()),
            requirements: vec!["React".to_string(), "TypeScript".to_string()],
            raw_html: None,
            match_score: Some(91),
            match_confidence: Some(0.86),
            match_reasoning: Some("Strong match".to_string()),
            matched_skills: vec!["React".to_string()],
            missing_skills: Vec::new(),
            ai_tags: vec!["frontend".to_string()],
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("save job");
    let application = upsert_application(
        &connection,
        UpsertApplication {
            job_id: job.id.clone(),
            status: "submitted".to_string(),
            mode: "semi_auto".to_string(),
            resume_path: None,
            cover_letter_path: None,
            last_follow_up: Some("2026-05-21T09:00:00.000Z".to_string()),
            follow_up_count: 1,
            next_follow_up: None,
            response_date: Some("2026-05-22T10:00:00.000Z".to_string()),
            response_type: Some("interview".to_string()),
            response_notes: Some("Interview invite".to_string()),
            submission_url: None,
            confirmation_id: None,
            error_message: None,
            notes: None,
            tags: Vec::new(),
        },
    )
    .expect("save application");
    update_application_workflow_state(
        &connection,
        &application.id,
        ApplicationWorkflowStateUpdate {
            submitted_at: Some(Some("2026-05-20T10:00:00.000Z".to_string())),
            ..Default::default()
        },
    )
    .expect("set submitted timestamp");
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Analytics Refresh".to_string(),
            task_type: "analytics".to_string(),
            cron_expression: Some("0 0 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-29T00:00:00.000Z".to_string()),
            config: json!({
                "cadence": { "kind": "daily", "hour": 0, "minute": 0 }
            }),
        },
    )
    .expect("save analytics task");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-analytics-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar_with_result(
        &request_path,
        json!({
            "id": "workflow-analytics-refresh",
            "ok": true,
            "result": {
                "applications": 1,
                "jobs": 1,
                "saved": true,
                "snapshot": {
                    "generatedAt": "2026-05-29T00:00:00.000Z",
                    "metrics": {
                        "totalApplications": 1,
                        "responseRate": 100,
                        "interviewRate": 100,
                        "offerRate": 0
                    }
                }
            }
        }),
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-29T00:00:00.000Z")
            .expect("run analytics scheduled task");

    assert_eq!(result.scanned, 1);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["analyticsRefresh"]["inputs"]["applications"][0],
        json!({
            "id": application.id,
            "companyName": "Northstar Labs",
            "platform": "linkedin",
            "status": "submitted",
            "appliedAt": "2026-05-20T10:00:00.000Z",
            "responseDate": "2026-05-22T10:00:00.000Z",
            "responseType": "interview",
            "followUpCount": 1,
            "resumeVersion": null
        })
    );
    assert_eq!(
        request["params"]["analyticsRefresh"]["inputs"]["jobs"][0],
        json!({
            "id": job.id,
            "platform": "linkedin",
            "companyName": "Northstar Labs",
            "matchScore": 91,
            "requiredSkills": ["React", "TypeScript"]
        })
    );

    let setting = get_setting(&connection, "analytics.latestSnapshot")
        .expect("read analytics snapshot setting")
        .expect("analytics snapshot setting exists");
    match setting.value {
        SettingValue::Object(snapshot) => {
            assert_eq!(snapshot["generatedAt"], json!("2026-05-29T00:00:00.000Z"));
            assert_eq!(snapshot["metrics"]["totalApplications"], json!(1));
            assert_eq!(snapshot["metrics"]["responseRate"], json!(100));
        }
        other => panic!("expected analytics snapshot object, got {other:?}"),
    }
}

fn capture_request_sidecar_with_result(
    request_path: &Path,
    response: serde_json::Value,
) -> careercaveman_lib::sidecar::SidecarCommand {
    common::capture_request_sidecar_with_response(request_path, response)
}
