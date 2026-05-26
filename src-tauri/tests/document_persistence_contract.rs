use job_hunt_lib::db::{
    models::{UpsertApplication, UpsertDocument, UpsertJob},
    queries::{
        list_application_events, list_documents, save_document, upsert_application, upsert_job,
    },
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn stores_generated_documents_and_records_activity() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let application_id = create_application(&connection);

    let resume = save_document(
        &connection,
        UpsertDocument {
            application_id: Some(application_id.clone()),
            document_type: "resume".to_string(),
            file_path: "/tmp/resume-v1.pdf".to_string(),
            file_name: "resume-v1.pdf".to_string(),
            version: 1,
            ai_model_used: Some("gpt-4.1".to_string()),
        },
    )
    .expect("save resume document");

    let cover_letter = save_document(
        &connection,
        UpsertDocument {
            application_id: Some(application_id.clone()),
            document_type: "cover_letter".to_string(),
            file_path: "/tmp/cover-letter-v1.pdf".to_string(),
            file_name: "cover-letter-v1.pdf".to_string(),
            version: 1,
            ai_model_used: Some("gpt-4.1".to_string()),
        },
    )
    .expect("save cover letter document");

    let documents = list_documents(&connection, &application_id).expect("list documents");

    assert_eq!(documents.len(), 2);
    assert_eq!(documents[0].id, cover_letter.id);
    assert_eq!(documents[0].document_type, "cover_letter");
    assert_eq!(documents[0].file_name, "cover-letter-v1.pdf");
    assert_eq!(documents[1].id, resume.id);
    assert_eq!(documents[1].document_type, "resume");
    assert_eq!(documents[1].version, 1);
    assert_eq!(documents[1].ai_model_used.as_deref(), Some("gpt-4.1"));

    let events = list_application_events(&connection, &application_id).expect("list events");

    assert_eq!(events[0].event_type, "document_generated");
    assert_eq!(events[0].new_value.as_deref(), Some("cover-letter-v1.pdf"));
    assert_eq!(
        events[0].description.as_deref(),
        Some("Generated cover_letter document cover-letter-v1.pdf")
    );
    assert_eq!(events[0].metadata["document_type"], json!("cover_letter"));
}

fn create_application(connection: &Connection) -> String {
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
    .expect("save application")
    .id
}
