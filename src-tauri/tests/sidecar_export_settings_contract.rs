use careercaveman_lib::{
    commands::sidecar::run_due_scheduled_tasks_with_command,
    db::{
        models::{
            ApplicationWorkflowStateUpdate, SettingValue, UpsertApplication, UpsertJob,
            UpsertScheduledTask, UpsertSetting,
        },
        queries::{
            get_setting, save_scheduled_task, update_application_workflow_state,
            upsert_application, upsert_job, upsert_setting,
        },
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[test]
fn scheduled_export_sync_sends_payload_settings_and_persists_runs() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let job = upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("linkedin-export-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/export-1".to_string(),
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
            resume_path: Some("/tmp/resume.pdf".to_string()),
            cover_letter_path: None,
            last_follow_up: Some("2026-05-26T09:00:00.000Z".to_string()),
            follow_up_count: 1,
            next_follow_up: Some("2026-06-02T09:00:00.000Z".to_string()),
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: Some("https://linkedin.example/applications/1".to_string()),
            confirmation_id: Some("CONF-1".to_string()),
            error_message: None,
            notes: Some("Submitted with tailored resume".to_string()),
            tags: vec!["frontend".to_string()],
        },
    )
    .expect("save application");
    update_application_workflow_state(
        &connection,
        &application.id,
        ApplicationWorkflowStateUpdate {
            submitted_at: Some(Some("2026-05-25T10:00:00.000Z".to_string())),
            ..Default::default()
        },
    )
    .expect("set submitted timestamp");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "analytics.latestSnapshot".to_string(),
            category: Some("analytics".to_string()),
            value: SettingValue::Object(json!({
                "generatedAt": "2026-05-29T00:00:00.000Z",
                "metrics": {
                    "totalApplications": 1,
                    "responseRate": 0,
                    "interviewRate": 0,
                    "offerRate": 0
                }
            })),
        },
    )
    .expect("save analytics snapshot setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "export.config".to_string(),
            category: Some("export".to_string()),
            value: SettingValue::Object(json!({
                "notionEnabled": true,
                "notionApiKey": "secret_notion",
                "notionDatabaseId": "notion-db-1",
                "googleSheetsEnabled": true,
                "googleSheetsId": "sheet-1",
                "googleSheetsAccessToken": "ya29-token",
                "googleSheetsRange": "Applications!A1"
            })),
        },
    )
    .expect("save export setting");
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Export Sync".to_string(),
            task_type: "export".to_string(),
            cron_expression: Some("0 */6 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-29T06:00:00.000Z".to_string()),
            config: json!({
                "cadence": { "kind": "interval", "minutes": 360 }
            }),
        },
    )
    .expect("save export task");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-export-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar_with_result(
        &request_path,
        json!({
            "id": "workflow-export-sync",
            "ok": true,
            "result": {
                "exporters": 2,
                "succeeded": 2,
                "failed": 0,
                "skipped": 0,
                "recordsWritten": 4,
                "runs": [
                    {
                        "exporterId": "notion",
                        "exporterName": "Notion",
                        "status": "completed",
                        "recordsWritten": 2,
                        "externalUrl": "https://notion.example/notion-db-1",
                        "syncedAt": "2026-05-29T06:00:00.000Z"
                    },
                    {
                        "exporterId": "google-sheets",
                        "exporterName": "Google Sheets",
                        "status": "completed",
                        "recordsWritten": 2,
                        "externalUrl": "https://docs.google.com/spreadsheets/d/sheet-1",
                        "syncedAt": "2026-05-29T06:00:00.000Z"
                    }
                ]
            }
        }),
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-29T06:00:00.000Z")
            .expect("run export scheduled task");

    assert_eq!(result.scanned, 1);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["exportSync"]["payload"]["applications"][0],
        json!({
            "id": application.id,
            "jobId": job.id,
            "jobTitle": "Frontend Engineer Intern",
            "companyName": "Northstar Labs",
            "status": "submitted",
            "mode": "semi_auto",
            "resumePath": "/tmp/resume.pdf",
            "coverLetterPath": null,
            "submittedAt": "2026-05-25T10:00:00.000Z",
            "submissionUrl": "https://linkedin.example/applications/1",
            "confirmationId": "CONF-1",
            "lastFollowUp": "2026-05-26T09:00:00.000Z",
            "nextFollowUp": "2026-06-02T09:00:00.000Z",
            "followUpCount": 1,
            "responseDate": null,
            "responseType": null,
            "tags": ["frontend"]
        })
    );
    assert_eq!(
        request["params"]["exportSync"]["payload"]["analytics"],
        json!({
            "generatedAt": "2026-05-29T00:00:00.000Z",
            "metrics": {
                "totalApplications": 1,
                "responseRate": 0,
                "interviewRate": 0,
                "offerRate": 0
            }
        })
    );
    assert_eq!(
        request["params"]["exportSync"]["notion"],
        json!({
            "enabled": true,
            "apiKey": "secret_notion",
            "databaseId": "notion-db-1"
        })
    );
    assert_eq!(
        request["params"]["exportSync"]["googleSheets"],
        json!({
            "enabled": true,
            "spreadsheetId": "sheet-1",
            "accessToken": "ya29-token",
            "range": "Applications!A1"
        })
    );

    let setting = get_setting(&connection, "export.latestRuns")
        .expect("read export runs setting")
        .expect("export runs setting exists");
    let runs = match setting.value {
        SettingValue::Array(runs) => runs,
        SettingValue::Object(serde_json::Value::Array(runs)) => runs,
        other => panic!("expected export run array, got {other:?}"),
    };
    assert_eq!(runs.len(), 2);
    assert_eq!(runs[0]["exporterId"], json!("notion"));
    assert_eq!(runs[1]["exporterId"], json!("google-sheets"));
}

fn capture_request_sidecar_with_result(
    request_path: &Path,
    response: serde_json::Value,
) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec![
            "-c".to_string(),
            format!(
                r#"read line
printf '%s' "$line" > '{}'
printf '%s\n' '{}'"#,
                request_path.display(),
                response
            ),
        ],
    }
}
