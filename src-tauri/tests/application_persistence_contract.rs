use cluelyy_lib::db::{
    models::{UpsertApplication, UpsertJob},
    queries::{list_application_events, list_applications, upsert_application, upsert_job},
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn queues_updates_and_lists_applications_with_job_context() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let job = upsert_job(
        &connection,
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

    let queued = upsert_application(
        &connection,
        UpsertApplication {
            job_id: job.id.clone(),
            status: "queued".to_string(),
            mode: "semi-auto".to_string(),
            resume_path: None,
            cover_letter_path: None,
            last_follow_up: None,
            follow_up_count: 0,
            next_follow_up: Some("2026-05-24 09:00:00".to_string()),
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: None,
            confirmation_id: None,
            error_message: None,
            notes: Some("Needs manual review".to_string()),
            tags: vec!["priority".to_string()],
        },
    )
    .expect("queue application");

    let updated = upsert_application(
        &connection,
        UpsertApplication {
            job_id: job.id.clone(),
            status: "preparing".to_string(),
            mode: "semi-auto".to_string(),
            resume_path: Some("/tmp/resume.pdf".to_string()),
            cover_letter_path: Some("/tmp/cover-letter.pdf".to_string()),
            last_follow_up: Some("2026-05-24 09:00:00".to_string()),
            follow_up_count: 1,
            next_follow_up: Some("2026-05-31 09:00:00".to_string()),
            response_date: Some("2026-05-25 14:30:00".to_string()),
            response_type: Some("positive".to_string()),
            response_notes: Some("Recruiter asked for interview availability".to_string()),
            submission_url: None,
            confirmation_id: None,
            error_message: None,
            notes: Some("Resume draft ready".to_string()),
            tags: vec!["priority".to_string(), "resume".to_string()],
        },
    )
    .expect("update application");

    let applications = list_applications(&connection).expect("list applications");

    assert_eq!(queued.id, updated.id);
    assert_eq!(applications.len(), 1);
    assert_eq!(applications[0].job_id, job.id);
    assert_eq!(applications[0].job_title, "Frontend Engineer Intern");
    assert_eq!(applications[0].company_name, "Northstar Labs");
    assert_eq!(applications[0].status, "preparing");
    assert_eq!(
        applications[0].resume_path.as_deref(),
        Some("/tmp/resume.pdf")
    );
    assert_eq!(applications[0].retry_count, 0);
    assert_eq!(applications[0].max_retries, 3);
    assert_eq!(
        applications[0].last_follow_up.as_deref(),
        Some("2026-05-24 09:00:00")
    );
    assert_eq!(applications[0].follow_up_count, 1);
    assert_eq!(
        applications[0].next_follow_up.as_deref(),
        Some("2026-05-31 09:00:00")
    );
    assert_eq!(
        applications[0].response_date.as_deref(),
        Some("2026-05-25 14:30:00")
    );
    assert_eq!(applications[0].response_type.as_deref(), Some("positive"));
    assert_eq!(
        applications[0].response_notes.as_deref(),
        Some("Recruiter asked for interview availability")
    );
    assert_eq!(applications[0].tags, vec!["priority", "resume"]);

    let events =
        list_application_events(&connection, &updated.id).expect("list application events");

    assert_eq!(events.len(), 2);
    assert_eq!(events[0].event_type, "status_change");
    assert_eq!(events[0].old_value.as_deref(), Some("queued"));
    assert_eq!(events[0].new_value.as_deref(), Some("preparing"));
    assert_eq!(
        events[0].description.as_deref(),
        Some("Application status changed from queued to preparing")
    );
    assert_eq!(events[1].event_type, "status_change");
    assert_eq!(events[1].old_value, None);
    assert_eq!(events[1].new_value.as_deref(), Some("queued"));
}
