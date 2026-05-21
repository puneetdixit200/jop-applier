use careercaveman_lib::db::{
    models::{UpsertApplication, UpsertCommunication, UpsertContact, UpsertJob},
    queries::{
        list_application_events, list_communications, save_communication, save_contact,
        upsert_application, upsert_job,
    },
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn stores_communications_and_records_sent_email_activity() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (application_id, contact_id) = create_application_and_contact(&connection);

    let outbound = save_communication(
        &connection,
        UpsertCommunication {
            application_id: Some(application_id.clone()),
            contact_id: Some(contact_id.clone()),
            direction: "sent".to_string(),
            communication_type: "follow_up".to_string(),
            subject: Some("Checking in".to_string()),
            body: Some("Following up on my application.".to_string()),
            email_id: Some("smtp-1".to_string()),
            sent_at: Some("2026-05-21T12:00:00Z".to_string()),
            read_at: None,
        },
    )
    .expect("save outbound communication");

    let inbound = save_communication(
        &connection,
        UpsertCommunication {
            application_id: Some(application_id.clone()),
            contact_id: Some(contact_id.clone()),
            direction: "received".to_string(),
            communication_type: "response".to_string(),
            subject: Some("Re: Checking in".to_string()),
            body: Some("Thanks for reaching out.".to_string()),
            email_id: Some("smtp-2".to_string()),
            sent_at: Some("2026-05-21T13:00:00Z".to_string()),
            read_at: Some("2026-05-21T13:05:00Z".to_string()),
        },
    )
    .expect("save inbound communication");

    let communications =
        list_communications(&connection, &application_id).expect("list communications");

    assert_eq!(communications.len(), 2);
    assert_eq!(communications[0].id, inbound.id);
    assert_eq!(communications[0].direction, "received");
    assert_eq!(communications[0].communication_type, "response");
    assert_eq!(
        communications[0].subject.as_deref(),
        Some("Re: Checking in")
    );
    assert_eq!(communications[0].email_id.as_deref(), Some("smtp-2"));
    assert_eq!(
        communications[0].read_at.as_deref(),
        Some("2026-05-21T13:05:00Z")
    );
    assert_eq!(communications[1].id, outbound.id);
    assert_eq!(communications[1].direction, "sent");
    assert_eq!(communications[1].communication_type, "follow_up");
    assert_eq!(
        communications[1].body.as_deref(),
        Some("Following up on my application.")
    );

    let events = list_application_events(&connection, &application_id).expect("list events");

    assert_eq!(events[0].event_type, "email_sent");
    assert_eq!(events[0].new_value.as_deref(), Some("Checking in"));
    assert_eq!(
        events[0].description.as_deref(),
        Some("Sent follow_up communication: Checking in")
    );
    assert_eq!(events[0].metadata["communication_id"], json!(outbound.id));
    assert_eq!(events[0].metadata["contact_id"], json!(contact_id));
    assert_eq!(events[0].metadata["direction"], json!("sent"));
    assert_eq!(events[0].metadata["communication_type"], json!("follow_up"));
    assert_eq!(events[0].metadata["email_id"], json!("smtp-1"));
}

fn create_application_and_contact(connection: &Connection) -> (String, String) {
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

    let application = upsert_application(
        connection,
        UpsertApplication {
            job_id: job.id,
            status: "preparing".to_string(),
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
            notes: None,
            tags: Vec::new(),
        },
    )
    .expect("save application");

    let contact = save_contact(
        connection,
        UpsertContact {
            company_id: None,
            name: "Priya Sharma".to_string(),
            email: Some("priya@example.com".to_string()),
            phone: None,
            linkedin_url: Some("https://linkedin.example/in/priya".to_string()),
            role: Some("recruiter".to_string()),
            notes: Some("Handles frontend internship hiring".to_string()),
        },
    )
    .expect("save contact");

    (application.id, contact.id)
}
