use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{
            SettingValue, UpsertApplication, UpsertCompany, UpsertContact, UpsertJob,
            UpsertSetting,
        },
        queries::{save_company, save_contact, upsert_application, upsert_job, upsert_setting},
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
fn sends_email_account_settings_to_email_check_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.account".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(json!({
                "provider": "gmail",
                "fromName": "Asha Rao",
                "fromEmail": "asha@gmail.example",
                "smtpHost": "smtp.gmail.com",
                "smtpPort": 465,
                "smtpSecure": true,
                "smtpUser": "asha@gmail.example",
                "smtpPass": "app-password",
                "imapHost": "imap.gmail.com",
                "imapPort": 993,
                "imapSecure": true,
                "imapUser": "asha@gmail.example",
                "imapPass": "app-password",
                "signature": "Asha"
            })),
        },
    )
    .expect("save email account setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.check".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(json!({
                "mailbox": "Replies",
                "markSeen": true,
                "maxResponses": 25
            })),
        },
    )
    .expect("save email check setting");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-email-check-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar(&request_path);

    run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "email-check")
        .expect("run configured email check workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["emailCheck"]["account"],
        json!({
            "provider": "gmail",
            "fromName": "Asha Rao",
            "fromEmail": "asha@gmail.example",
            "smtpHost": "smtp.gmail.com",
            "smtpPort": 465,
            "smtpSecure": true,
            "smtpUser": "asha@gmail.example",
            "smtpPass": "app-password",
            "imapHost": "imap.gmail.com",
            "imapPort": 993,
            "imapSecure": true,
            "imapUser": "asha@gmail.example",
            "imapPass": "app-password",
            "signature": "Asha"
        })
    );
    assert_eq!(
        request["params"]["emailCheck"]["fetch"],
        json!({
            "mailbox": "Replies",
            "markSeen": true,
            "limit": 25
        })
    );
}

#[test]
fn sends_email_match_context_to_email_check_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (application_id, job_id, company_id, contact_id) = create_application_contact_context(&connection);
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-email-match-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar(&request_path);

    run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "email-check")
        .expect("run configured email check workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["emailCheck"]["matchContext"]["applications"],
        json!([{
            "id": application_id,
            "jobId": job_id,
            "companyName": "Northstar Labs",
            "status": "submitted"
        }])
    );
    assert_eq!(
        request["params"]["emailCheck"]["matchContext"]["contacts"],
        json!([{
            "id": contact_id,
            "name": "Mira Recruiter",
            "email": "mira@northstar.example",
            "companyId": company_id,
            "companyName": "Northstar Labs"
        }])
    );
}

#[test]
fn sends_email_account_settings_to_cold_email_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.account".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(json!({
                "provider": "gmail",
                "fromName": "Asha Rao",
                "fromEmail": "asha@gmail.example",
                "smtpHost": "smtp.gmail.com",
                "smtpPort": 465,
                "smtpSecure": true,
                "smtpUser": "asha@gmail.example",
                "smtpPass": "app-password",
                "imapHost": "imap.gmail.com",
                "imapPort": 993,
                "imapSecure": true,
                "imapUser": "asha@gmail.example",
                "imapPass": "app-password",
                "signature": "Asha"
            })),
        },
    )
    .expect("save email account setting");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-cold-email-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar(&request_path);

    run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "cold-email")
        .expect("run configured cold email workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["coldEmail"]["account"],
        json!({
            "provider": "gmail",
            "fromName": "Asha Rao",
            "fromEmail": "asha@gmail.example",
            "smtpHost": "smtp.gmail.com",
            "smtpPort": 465,
            "smtpSecure": true,
            "smtpUser": "asha@gmail.example",
            "smtpPass": "app-password",
            "imapHost": "imap.gmail.com",
            "imapPort": 993,
            "imapSecure": true,
            "imapUser": "asha@gmail.example",
            "imapPass": "app-password",
            "signature": "Asha"
        })
    );
}

fn create_application_contact_context(connection: &Connection) -> (String, String, String, String) {
    let company = save_company(
        connection,
        UpsertCompany {
            name: "Northstar Labs".to_string(),
            domain: Some("northstar.example".to_string()),
            careers_url: None,
            industry: Some("Developer tools".to_string()),
            size: None,
            linkedin_url: None,
            glassdoor_url: None,
            notes: None,
            is_blacklisted: false,
            is_whitelisted: false,
        },
    )
    .expect("save company");
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
            mode: "semi_auto".to_string(),
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
            company_id: Some(company.id.clone()),
            name: "Mira Recruiter".to_string(),
            email: Some("mira@northstar.example".to_string()),
            phone: None,
            linkedin_url: None,
            role: Some("recruiter".to_string()),
            notes: None,
        },
    )
    .expect("save contact");

    (application.id, job.id, company.id, contact.id)
}

fn capture_request_sidecar(request_path: &Path) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec![
            "-c".to_string(),
            format!(
                r#"read line
printf '%s' "$line" > '{}'
printf '{{"id":"workflow-email-check","ok":true,"result":{{"scanned":0,"matched":0,"recorded":0,"failed":0,"skipped":0,"responses":[]}}}}\n'"#,
                request_path.display()
            ),
        ],
    }
}
