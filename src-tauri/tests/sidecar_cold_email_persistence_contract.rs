use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{UpsertApplication, UpsertContact, UpsertJob},
        queries::{
            list_application_events, list_communications, save_contact, upsert_application,
            upsert_job,
        },
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn persists_cold_email_workflow_outreach_into_application_history() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (application_id, job_id, contact_id) = create_application_context(&connection);
    let command = shell_sidecar(&format!(
        r#"read line
case "$line" in
  *'"method":"workflow.run"'*'"workflowId":"cold-email"'*) printf '{{"id":"workflow-cold-email","ok":true,"result":{{"scanned":1,"generated":1,"sent":1,"failed":0,"skipped":0,"coldEmails":[{{"applicationId":"{application_id}","jobId":"{job_id}","companyName":"Northstar Labs","contactId":"{contact_id}","contactName":"Mira","communicationId":"sidecar-comm-1","emailId":"smtp-message-1","subject":"Northstar Labs workflow automation intro","body":"Hi Mira,\\n\\nI build local-first workflow tools.","sentAt":"2026-05-28T10:00:00.000Z"}}]}}}}\n' ;;
  *) printf '{{"id":null,"ok":false,"error":{{"message":"unexpected request"}}}}\n' ;;
esac"#
    ));

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "cold-email")
            .expect("run cold email workflow");

    assert_eq!(result["storedColdEmails"], json!(1));

    let communications =
        list_communications(&connection, &application_id).expect("list communications");
    assert_eq!(communications.len(), 1);
    assert_eq!(communications[0].contact_id.as_deref(), Some(contact_id.as_str()));
    assert_eq!(communications[0].direction, "sent");
    assert_eq!(communications[0].communication_type, "cold_email");
    assert_eq!(
        communications[0].subject.as_deref(),
        Some("Northstar Labs workflow automation intro")
    );
    assert_eq!(
        communications[0].body.as_deref(),
        Some("Hi Mira,\n\nI build local-first workflow tools.")
    );
    assert_eq!(communications[0].email_id.as_deref(), Some("smtp-message-1"));
    assert_eq!(
        communications[0].sent_at.as_deref(),
        Some("2026-05-28T10:00:00.000Z")
    );

    let events = list_application_events(&connection, &application_id).expect("list events");
    assert_eq!(events[0].event_type, "email_sent");
    assert_eq!(
        events[0].description.as_deref(),
        Some("Sent cold_email communication: Northstar Labs workflow automation intro")
    );
    assert_eq!(events[0].metadata["communication_type"], json!("cold_email"));
    assert_eq!(events[0].metadata["contact_id"], json!(contact_id));
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
            tags: vec!["priority".to_string()],
        },
    )
    .expect("save application");

    let contact = save_contact(
        connection,
        UpsertContact {
            company_id: None,
            name: "Mira".to_string(),
            email: Some("mira@northstar.example".to_string()),
            phone: None,
            linkedin_url: None,
            role: Some("recruiter".to_string()),
            notes: None,
        },
    )
    .expect("save contact");

    (application.id, job.id, contact.id)
}

fn shell_sidecar(script: &str) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), script.to_string()],
    }
}
