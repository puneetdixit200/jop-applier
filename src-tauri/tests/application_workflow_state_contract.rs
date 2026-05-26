use job_hunt_lib::db::{
    models::{ApplicationWorkflowStateUpdate, UpsertApplication, UpsertJob},
    queries::{
        list_application_events, list_applications, update_application_workflow_state,
        upsert_application, upsert_job,
    },
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn updates_application_workflow_state_by_application_id() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let application = queue_application(&connection);

    let resume_generated = update_application_workflow_state(
        &connection,
        &application.id,
        ApplicationWorkflowStateUpdate {
            status: Some("resume_generated".to_string()),
            resume_path: Some(Some("/tmp/app-1/resume-v2.pdf".to_string())),
            ..Default::default()
        },
    )
    .expect("persist resume state")
    .expect("application exists");

    assert_eq!(resume_generated.status, "resume_generated");
    assert_eq!(
        resume_generated.resume_path.as_deref(),
        Some("/tmp/app-1/resume-v2.pdf")
    );

    let failed = update_application_workflow_state(
        &connection,
        &application.id,
        ApplicationWorkflowStateUpdate {
            status: Some("failed".to_string()),
            retry_count: Some(1),
            error_message: Some(Some("captcha challenge".to_string())),
            ..Default::default()
        },
    )
    .expect("persist failed state")
    .expect("application exists");

    assert_eq!(failed.status, "failed");
    assert_eq!(failed.retry_count, 1);
    assert_eq!(failed.error_message.as_deref(), Some("captcha challenge"));

    let submitted = update_application_workflow_state(
        &connection,
        &application.id,
        ApplicationWorkflowStateUpdate {
            status: Some("submitted".to_string()),
            cover_letter_path: Some(Some("/tmp/app-1/cover-letter-v2.pdf".to_string())),
            submission_url: Some(Some("https://ats.example/app-1/review".to_string())),
            confirmation_id: Some(Some("confirmation-app-1".to_string())),
            submitted_at: Some(Some("2026-05-28T10:30:00.000Z".to_string())),
            error_message: Some(None),
            ..Default::default()
        },
    )
    .expect("persist submitted state")
    .expect("application exists");

    assert_eq!(submitted.status, "submitted");
    assert_eq!(
        submitted.resume_path.as_deref(),
        Some("/tmp/app-1/resume-v2.pdf")
    );
    assert_eq!(
        submitted.cover_letter_path.as_deref(),
        Some("/tmp/app-1/cover-letter-v2.pdf")
    );
    assert_eq!(
        submitted.submission_url.as_deref(),
        Some("https://ats.example/app-1/review")
    );
    assert_eq!(
        submitted.confirmation_id.as_deref(),
        Some("confirmation-app-1")
    );
    assert_eq!(
        submitted.submitted_at.as_deref(),
        Some("2026-05-28T10:30:00.000Z")
    );
    assert_eq!(submitted.error_message, None);

    let applications = list_applications(&connection).expect("list applications");
    assert_eq!(applications, vec![submitted]);

    let events =
        list_application_events(&connection, &application.id).expect("list application events");
    let status_changes: Vec<_> = events
        .iter()
        .map(|event| {
            (
                event.old_value.as_deref(),
                event.new_value.as_deref(),
                event.description.as_deref(),
            )
        })
        .collect();

    assert_eq!(
        status_changes,
        vec![
            (
                Some("failed"),
                Some("submitted"),
                Some("Application status changed from failed to submitted"),
            ),
            (
                Some("resume_generated"),
                Some("failed"),
                Some("Application status changed from resume_generated to failed"),
            ),
            (
                Some("queued"),
                Some("resume_generated"),
                Some("Application status changed from queued to resume_generated"),
            ),
            (
                None,
                Some("queued"),
                Some("Application status set to queued"),
            ),
        ]
    );
}

#[test]
fn returns_none_when_updating_missing_application_workflow_state() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let result = update_application_workflow_state(
        &connection,
        "missing-application",
        ApplicationWorkflowStateUpdate {
            status: Some("failed".to_string()),
            error_message: Some(Some("not found".to_string())),
            ..Default::default()
        },
    )
    .expect("missing application update is not an error");

    assert_eq!(result, None);
}

fn queue_application(connection: &Connection) -> job_hunt_lib::db::models::Application {
    let job = upsert_job(
        connection,
        UpsertJob {
            source_id: Some("linkedin-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/1".to_string(),
            title: "Desktop Automation Engineer".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: Some(900_000),
            salary_max: Some(1_400_000),
            salary_currency: "INR".to_string(),
            job_type: Some("fulltime".to_string()),
            experience_level: Some("entry".to_string()),
            description: Some("Build Tauri and Rust workflow automation.".to_string()),
            requirements: vec!["React".to_string(), "Rust".to_string(), "Tauri".to_string()],
            raw_html: None,
            match_score: Some(94),
            match_confidence: Some(0.93),
            match_reasoning: Some("Strong automation fit".to_string()),
            matched_skills: vec!["React".to_string(), "Rust".to_string()],
            missing_skills: vec!["Playwright".to_string()],
            ai_tags: vec!["good-fit".to_string()],
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("save job");

    upsert_application(
        connection,
        UpsertApplication {
            job_id: job.id,
            status: "queued".to_string(),
            mode: "semi-auto".to_string(),
            resume_path: None,
            cover_letter_path: None,
            last_follow_up: None,
            follow_up_count: 0,
            next_follow_up: None,
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: None,
            confirmation_id: None,
            error_message: None,
            notes: Some("Generate fresh documents".to_string()),
            tags: vec!["priority".to_string()],
        },
    )
    .expect("queue application")
}
