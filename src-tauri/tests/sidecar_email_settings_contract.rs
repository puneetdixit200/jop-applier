use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{SettingValue, UpsertSetting},
        queries::upsert_setting,
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
