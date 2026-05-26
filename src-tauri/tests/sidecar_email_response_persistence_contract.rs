use cluelyy_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{UpsertApplication, UpsertContact, UpsertJob},
        queries::{
            list_application_events, list_applications, list_communications, list_notifications,
            save_contact, upsert_application, upsert_job,
        },
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;

mod common;

#[test]
fn persists_email_check_responses_into_application_history_and_notifications() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (application_id, job_id, contact_id) = create_application_context(&connection);
    let command = common::workflow_sidecar(
        "email-check",
        json!({
            "scanned": 2,
            "matched": 1,
            "recorded": 1,
            "failed": 0,
            "skipped": 1,
            "responses": [
                {
                    "id": "imap-1",
                    "applicationId": application_id,
                    "jobId": job_id,
                    "companyName": "Northstar Labs",
                    "contactId": contact_id,
                    "from": "recruiter@northstar.example",
                    "subject": "Interview availability",
                    "body": "Can you share availability this week?",
                    "receivedAt": "2026-05-28T09:40:00.000Z",
                    "responseType": "interview"
                },
                {
                    "id": "imap-unmatched",
                    "applicationId": null,
                    "jobId": null,
                    "companyName": null,
                    "contactId": null,
                    "from": "unknown@example.com",
                    "subject": "Hello",
                    "body": null,
                    "receivedAt": "2026-05-28T09:41:00.000Z",
                    "responseType": "other"
                }
            ]
        }),
    );

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "email-check")
            .expect("run email check workflow");

    assert_eq!(result["storedEmailResponses"], json!(1));
    assert_eq!(result["storedNotifications"], json!(1));
    assert_eq!(result["notifications"].as_array().map(Vec::len), Some(2));
    assert_eq!(result["notifications"][0]["channel"], json!("os"));
    assert_eq!(result["notifications"][1]["channel"], json!("in_app"));

    let applications = list_applications(&connection).expect("list applications");
    assert_eq!(applications.len(), 1);
    assert_eq!(applications[0].id, application_id);
    assert_eq!(applications[0].status, "response_received");
    assert_eq!(
        applications[0].response_date.as_deref(),
        Some("2026-05-28T09:40:00.000Z")
    );
    assert_eq!(applications[0].response_type.as_deref(), Some("interview"));
    assert_eq!(
        applications[0].response_notes.as_deref(),
        Some("Interview availability")
    );

    let communications =
        list_communications(&connection, &application_id).expect("list communications");
    assert_eq!(communications.len(), 1);
    assert_eq!(
        communications[0].contact_id.as_deref(),
        Some(contact_id.as_str())
    );
    assert_eq!(communications[0].direction, "received");
    assert_eq!(communications[0].communication_type, "response");
    assert_eq!(
        communications[0].subject.as_deref(),
        Some("Interview availability")
    );
    assert_eq!(communications[0].email_id.as_deref(), Some("imap-1"));
    assert_eq!(
        communications[0].sent_at.as_deref(),
        Some("2026-05-28T09:40:00.000Z")
    );

    let events = list_application_events(&connection, &application_id).expect("list events");
    assert_eq!(events[0].event_type, "status_change");
    assert_eq!(events[0].new_value.as_deref(), Some("response_received"));

    let notifications = list_notifications(&connection).expect("list notifications");
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0].notification_type, "response.received");
    assert_eq!(notifications[0].title, "Response received");
    assert_eq!(
        notifications[0].body,
        "Northstar Labs replied: Interview availability"
    );
    assert_eq!(notifications[0].priority, "high");
    assert_eq!(notifications[0].channel, "in_app");
    assert_eq!(
        notifications[0].metadata["applicationId"],
        json!(application_id)
    );
    assert_eq!(
        notifications[0].metadata["communicationId"],
        json!(communications[0].id)
    );
    assert_eq!(
        notifications[0].metadata["responseType"],
        json!("interview")
    );
}

fn create_application_context(connection: &Connection) -> (String, String, String) {
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
            salary_min: None,
            salary_max: None,
            salary_currency: "INR".to_string(),
            job_type: Some("internship".to_string()),
            experience_level: Some("intern".to_string()),
            description: Some("React internship".to_string()),
            requirements: vec!["React".to_string()],
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
        connection,
        UpsertApplication {
            job_id: job.id.clone(),
            status: "submitted".to_string(),
            mode: "full_auto".to_string(),
            resume_path: Some("/tmp/northstar-resume.pdf".to_string()),
            cover_letter_path: Some("/tmp/northstar-cover.pdf".to_string()),
            last_follow_up: None,
            follow_up_count: 0,
            next_follow_up: Some("2026-05-29T09:00:00Z".to_string()),
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: Some("https://ats.example/northstar".to_string()),
            confirmation_id: Some("CONF-1".to_string()),
            error_message: None,
            notes: None,
            tags: vec!["priority".to_string()],
        },
    )
    .expect("save application");

    let contact = save_contact(
        connection,
        UpsertContact {
            company_id: None,
            name: "Priya Recruiter".to_string(),
            email: Some("recruiter@northstar.example".to_string()),
            phone: None,
            linkedin_url: None,
            role: Some("recruiter".to_string()),
            notes: None,
        },
    )
    .expect("save contact");

    (application.id, job.id, contact.id)
}
