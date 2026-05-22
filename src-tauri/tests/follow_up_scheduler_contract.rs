use careercaveman_lib::{
    commands::sidecar::run_due_scheduled_tasks_with_command,
    db::{
        models::{UpsertApplication, UpsertJob, UpsertScheduledTask},
        queries::{
            list_application_events, list_applications, list_communications, list_notifications,
            save_scheduled_task, upsert_application, upsert_job,
        },
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn scheduled_follow_up_check_sends_due_follow_ups_and_updates_tracker_state() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let first_follow_up = create_application(
        &connection,
        "first",
        "submitted",
        0,
        Some("2026-05-28T08:00:00Z"),
        None,
    );
    let final_follow_up = create_application(
        &connection,
        "final",
        "follow_up_sent",
        2,
        Some("2026-05-28T08:00:00Z"),
        None,
    );
    let responded = create_application(
        &connection,
        "responded",
        "submitted",
        0,
        Some("2026-05-28T08:00:00Z"),
        Some("2026-05-28T08:30:00Z"),
    );
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Follow-up Check".to_string(),
            task_type: "follow_up".to_string(),
            cron_expression: Some("0 9 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-28T09:00:00Z".to_string()),
            config: json!({
                "cadence": { "kind": "daily", "hour": 9, "minute": 0 }
            }),
        },
    )
    .expect("save follow-up task");
    let command = failing_sidecar();

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-28T09:00:00Z")
            .expect("run follow-up task");

    assert_eq!(result.scanned, 1);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);
    assert_eq!(result.notifications.len(), 4);
    assert_eq!(result.notifications[0]["channel"], json!("os"));
    assert_eq!(result.notifications[1]["channel"], json!("in_app"));

    let applications = list_applications(&connection).expect("list applications");
    let updated_first = applications
        .iter()
        .find(|application| application.id == first_follow_up)
        .expect("first application exists");
    assert_eq!(updated_first.status, "follow_up_sent");
    assert_eq!(updated_first.follow_up_count, 1);
    assert_eq!(
        updated_first.last_follow_up.as_deref(),
        Some("2026-05-28T09:00:00Z")
    );
    assert_eq!(
        updated_first.next_follow_up.as_deref(),
        Some("2026-06-04T09:00:00Z")
    );

    let updated_final = applications
        .iter()
        .find(|application| application.id == final_follow_up)
        .expect("final application exists");
    assert_eq!(updated_final.status, "ghosted");
    assert_eq!(updated_final.follow_up_count, 3);
    assert_eq!(
        updated_final.last_follow_up.as_deref(),
        Some("2026-05-28T09:00:00Z")
    );
    assert_eq!(updated_final.next_follow_up, None);

    let skipped_response = applications
        .iter()
        .find(|application| application.id == responded)
        .expect("responded application exists");
    assert_eq!(skipped_response.status, "submitted");
    assert_eq!(skipped_response.follow_up_count, 0);

    let first_communications =
        list_communications(&connection, &first_follow_up).expect("list first communications");
    assert_eq!(first_communications.len(), 1);
    assert_eq!(first_communications[0].direction, "sent");
    assert_eq!(first_communications[0].communication_type, "follow_up");
    assert_eq!(
        first_communications[0].subject.as_deref(),
        Some("Following up on Frontend Engineer first at Company first")
    );
    assert_eq!(
        first_communications[0].sent_at.as_deref(),
        Some("2026-05-28T09:00:00Z")
    );

    let first_events =
        list_application_events(&connection, &first_follow_up).expect("list first events");
    assert_eq!(first_events[0].event_type, "status_change");
    assert_eq!(first_events[0].new_value.as_deref(), Some("follow_up_sent"));
    assert_eq!(first_events[1].event_type, "email_sent");
    assert_eq!(
        first_events[1].metadata["communication_type"],
        json!("follow_up")
    );

    let notifications = list_notifications(&connection).expect("list notifications");
    assert_eq!(notifications.len(), 2);
    assert!(notifications
        .iter()
        .all(|notification| notification.notification_type == "follow_up.reminder"));
    assert!(notifications
        .iter()
        .all(|notification| notification.channel == "in_app"));
}

fn create_application(
    connection: &Connection,
    suffix: &str,
    status: &str,
    follow_up_count: i64,
    next_follow_up: Option<&str>,
    response_date: Option<&str>,
) -> String {
    let job = upsert_job(
        connection,
        UpsertJob {
            source_id: Some(format!("source-{suffix}")),
            platform: "linkedin".to_string(),
            url: format!("https://jobs.example/{suffix}"),
            title: format!("Frontend Engineer {suffix}"),
            company_name: format!("Company {suffix}"),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: None,
            salary_max: None,
            salary_currency: "INR".to_string(),
            job_type: None,
            experience_level: None,
            description: None,
            requirements: Vec::new(),
            raw_html: None,
            match_score: Some(88),
            match_confidence: Some(0.8),
            match_reasoning: None,
            matched_skills: Vec::new(),
            missing_skills: Vec::new(),
            ai_tags: Vec::new(),
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("save job");

    upsert_application(
        connection,
        UpsertApplication {
            job_id: job.id,
            status: status.to_string(),
            mode: "full_auto".to_string(),
            resume_path: Some(format!("/tmp/{suffix}-resume.pdf")),
            cover_letter_path: Some(format!("/tmp/{suffix}-cover.pdf")),
            last_follow_up: None,
            follow_up_count,
            next_follow_up: next_follow_up.map(str::to_string),
            response_date: response_date.map(str::to_string),
            response_type: response_date.map(|_| "positive".to_string()),
            response_notes: None,
            submission_url: Some(format!("https://ats.example/{suffix}")),
            confirmation_id: Some(format!("confirmation-{suffix}")),
            error_message: None,
            notes: None,
            tags: Vec::new(),
        },
    )
    .expect("save application")
    .id
}

fn failing_sidecar() -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), "exit 99".to_string()],
    }
}
