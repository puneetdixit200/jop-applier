use careercaveman_lib::{
    commands::sidecar::run_application_review_decision_and_persist_with_command,
    db::{
        models::{Application, UpsertApplication, UpsertJob},
        queries::{list_application_events, upsert_application, upsert_job},
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;

mod common;

#[test]
fn persists_approved_sidecar_review_decisions_into_sqlite() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let application = review_pending_application(&connection);
    let command = common::application_review_sidecar(json!({
        "status": "submitted",
        "confirmationId": "CONF-42"
    }));

    let updated = run_application_review_decision_and_persist_with_command(
        &command,
        &connection,
        &application,
        "approve",
        "2026-05-28T12:30:00Z",
    )
    .expect("run and persist review decision")
    .expect("application exists");

    assert_eq!(updated.status, "submitted");
    assert_eq!(updated.confirmation_id.as_deref(), Some("CONF-42"));
    assert_eq!(
        updated.submitted_at.as_deref(),
        Some("2026-05-28T12:30:00Z")
    );
    assert_eq!(updated.error_message, None);

    let events =
        list_application_events(&connection, &application.id).expect("list application events");
    assert_eq!(events[0].old_value.as_deref(), Some("review_pending"));
    assert_eq!(events[0].new_value.as_deref(), Some("submitted"));
}

fn review_pending_application(connection: &Connection) -> Application {
    let job = upsert_job(
        connection,
        UpsertJob {
            source_id: Some("linkedin-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/1".to_string(),
            title: "Frontend Engineer Intern".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: Some(900_000),
            salary_max: Some(1_400_000),
            salary_currency: "INR".to_string(),
            job_type: Some("internship".to_string()),
            experience_level: Some("intern".to_string()),
            description: Some("React and TypeScript internship".to_string()),
            requirements: vec!["React".to_string(), "TypeScript".to_string()],
            raw_html: None,
            match_score: Some(94),
            match_confidence: Some(0.93),
            match_reasoning: Some("Strong match".to_string()),
            matched_skills: vec!["React".to_string()],
            missing_skills: Vec::new(),
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
            status: "review_pending".to_string(),
            mode: "semi_auto".to_string(),
            resume_path: Some("/docs/resume.pdf".to_string()),
            cover_letter_path: Some("/docs/cover-letter.pdf".to_string()),
            last_follow_up: None,
            follow_up_count: 0,
            next_follow_up: None,
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: Some("https://ats.example/review".to_string()),
            confirmation_id: None,
            error_message: Some("Manual review required".to_string()),
            notes: None,
            tags: vec!["priority".to_string()],
        },
    )
    .expect("save application")
}
