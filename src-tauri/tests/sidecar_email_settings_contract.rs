use careercaveman_lib::{
    commands::sidecar::{
        run_due_scheduled_tasks_with_command, run_sidecar_workflow_and_persist_jobs_with_command,
    },
    db::{
        models::{
            SettingValue, UpsertApplication, UpsertCompany, UpsertContact, UpsertJob,
            UpsertScheduledTask, UpsertSetting,
        },
        queries::{
            list_applications, list_communications, save_company, save_contact,
            save_scheduled_task, upsert_application, upsert_job, upsert_setting,
        },
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::{fs, path::Path, sync::Mutex};

mod common;

static SECURE_STORE_TEST_LOCK: Mutex<()> = Mutex::new(());

fn gmail_oauth_account() -> serde_json::Value {
    json!({
        "provider": "gmail",
        "authType": "oauth2",
        "fromName": "Asha Rao",
        "fromEmail": "asha@gmail.example",
        "smtpHost": "smtp.gmail.com",
        "smtpPort": 465,
        "smtpSecure": true,
        "smtpUser": "asha@gmail.example",
        "imapHost": "imap.gmail.com",
        "imapPort": 993,
        "imapSecure": true,
        "imapUser": "asha@gmail.example",
        "oauthClientId": "google-client-id",
        "oauthClientSecret": "google-client-secret",
        "oauthRefreshToken": "google-refresh-token",
        "signature": "Asha"
    })
}

#[test]
fn sends_email_account_settings_to_email_check_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.account".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(gmail_oauth_account()),
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
        gmail_oauth_account()
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
fn resolves_keyring_email_secret_references_for_sidecar_workflows() {
    let _guard = SECURE_STORE_TEST_LOCK
        .lock()
        .expect("lock secure store test");
    keyring_core::set_default_store(keyring_core::mock::Store::new().expect("mock keyring store"));
    careercaveman_lib::secure_store::save_secret(
        "email.account.oauthClientSecret",
        "google-client-secret",
    )
    .expect("save OAuth client secret");
    careercaveman_lib::secure_store::save_secret(
        "email.account.oauthRefreshToken",
        "google-refresh-token",
    )
    .expect("save OAuth refresh token");

    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.account".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(json!({
                "provider": "gmail",
                "authType": "oauth2",
                "fromName": "Asha Rao",
                "fromEmail": "asha@gmail.example",
                "smtpHost": "smtp.gmail.com",
                "smtpPort": 465,
                "smtpSecure": true,
                "smtpUser": "asha@gmail.example",
                "imapHost": "imap.gmail.com",
                "imapPort": 993,
                "imapSecure": true,
                "imapUser": "asha@gmail.example",
                "oauthClientId": "google-client-id",
                "oauthClientSecret": {
                    "secretRef": "email.account.oauthClientSecret",
                    "service": "careercaveman",
                    "uri": "keyring://careercaveman/email.account.oauthClientSecret"
                },
                "oauthRefreshToken": {
                    "secretRef": "email.account.oauthRefreshToken",
                    "service": "careercaveman",
                    "uri": "keyring://careercaveman/email.account.oauthRefreshToken"
                },
                "signature": "Asha"
            })),
        },
    )
    .expect("save email account setting");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-email-secret-ref-request-{}.json",
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
        request["params"]["emailCheck"]["account"]["oauthClientSecret"],
        json!("google-client-secret")
    );
    assert_eq!(
        request["params"]["emailCheck"]["account"]["oauthRefreshToken"],
        json!("google-refresh-token")
    );

    keyring_core::unset_default_store();
}

#[test]
fn sends_email_match_context_to_email_check_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (application_id, job_id, company_id, contact_id) =
        create_application_contact_context(&connection);
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
            value: SettingValue::Object(gmail_oauth_account()),
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
        gmail_oauth_account()
    );
}

#[test]
fn sends_email_account_and_follow_up_context_to_follow_up_sidecar_and_persists_result() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "email.account".to_string(),
            category: Some("email".to_string()),
            value: SettingValue::Object(gmail_oauth_account()),
        },
    )
    .expect("save email account setting");
    let (application_id, job_id, _company_id, contact_id) =
        create_application_contact_context(&connection);
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Follow-up Check".to_string(),
            task_type: "follow_up".to_string(),
            cron_expression: Some("0 9 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-28T09:00:00.000Z".to_string()),
            config: json!({
                "cadence": { "kind": "daily", "hour": 9, "minute": 0 }
            }),
        },
    )
    .expect("save follow-up task");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-follow-up-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar_with_result(
        &request_path,
        json!({
            "id": "workflow-follow-up-check",
            "ok": true,
            "result": {
                "scanned": 1,
                "due": 1,
                "sent": 1,
                "failed": 0,
                "ghosted": 0,
                "followUps": [{
                    "applicationId": application_id,
                    "jobId": job_id,
                    "companyName": "Northstar Labs",
                    "contactId": contact_id,
                    "contactName": "Mira Recruiter",
                    "contactEmail": "mira@northstar.example",
                    "communicationId": null,
                    "emailId": "smtp-follow-up-1",
                    "subject": "Following up on Frontend Engineer Intern at Northstar Labs",
                    "body": "Hi Mira Recruiter,\n\nI wanted to follow up on my application for the Frontend Engineer Intern role at Northstar Labs.\n\nThank you.",
                    "sentAt": "2026-05-28T09:00:00.000Z",
                    "status": "follow_up_sent",
                    "followUpCount": 1,
                    "nextFollowUp": "2026-06-04T09:00:00.000Z"
                }]
            }
        }),
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-28T09:00:00.000Z")
            .expect("run configured scheduled follow-up workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["followUp"]["account"],
        gmail_oauth_account()
    );
    assert_eq!(
        request["params"]["followUp"]["applications"][0],
        json!({
            "id": application_id,
            "jobId": job_id,
            "jobTitle": "Frontend Engineer Intern",
            "companyName": "Northstar Labs",
            "status": "submitted",
            "submittedAt": null,
            "nextFollowUp": null,
            "lastFollowUp": null,
            "followUpCount": 0,
            "responseDate": null,
            "responseType": null,
            "contactId": contact_id,
            "contactName": "Mira Recruiter",
            "contactEmail": "mira@northstar.example"
        })
    );
    assert_eq!(result.scanned, 1);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);

    let applications = list_applications(&connection).expect("list applications");
    let updated = applications
        .iter()
        .find(|application| application.id == application_id)
        .expect("updated application");
    assert_eq!(updated.status, "follow_up_sent");
    assert_eq!(updated.follow_up_count, 1);
    assert_eq!(
        updated.next_follow_up.as_deref(),
        Some("2026-06-04T09:00:00.000Z")
    );

    let communications =
        list_communications(&connection, &application_id).expect("list communications");
    assert_eq!(communications.len(), 1);
    assert_eq!(communications[0].communication_type, "follow_up");
    assert_eq!(
        communications[0].email_id.as_deref(),
        Some("smtp-follow-up-1")
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
    capture_request_sidecar_with_result(
        request_path,
        json!({
            "id": "workflow-email-check",
            "ok": true,
            "result": {
                "scanned": 0,
                "matched": 0,
                "recorded": 0,
                "failed": 0,
                "skipped": 0,
                "responses": []
            }
        }),
    )
}

fn capture_request_sidecar_with_result(
    request_path: &Path,
    response: serde_json::Value,
) -> SidecarCommand {
    common::capture_request_sidecar_with_response(request_path, response)
}
