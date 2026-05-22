use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{queries::list_notifications, schema::initialize_schema},
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn persists_in_app_notifications_returned_by_sidecar_workflows() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"workflow.run"'*'"workflowId":"application-processing"'*) printf '{"id":"workflow-application-processing","ok":true,"result":{"scanned":1,"queued":1,"processed":0,"failed":1,"submitted":0,"reviewPending":0,"notifications":[{"type":"application.failed","title":"Application failed","body":"Northstar Labs application failed: captcha challenge","priority":"high","channel":"in_app","createdAt":"2026-05-28T12:45:00.000Z","metadata":{"applicationId":"app-1","jobId":"job-1","companyName":"Northstar Labs","status":"failed","reason":"captcha challenge"}},{"type":"application.failed","title":"Application failed","body":"Northstar Labs application failed: captcha challenge","priority":"high","channel":"os","createdAt":"2026-05-28T12:45:00.000Z","metadata":{"applicationId":"app-1"}}]}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let result = run_sidecar_workflow_and_persist_jobs_with_command(
        &command,
        &connection,
        "application-processing",
    )
    .expect("run application processing workflow");

    assert_eq!(result["failed"], json!(1));
    assert_eq!(result["notifications"].as_array().map(Vec::len), Some(2));

    let notifications = list_notifications(&connection).expect("list notifications");
    assert_eq!(notifications.len(), 1);
    assert_eq!(notifications[0].notification_type, "application.failed");
    assert_eq!(notifications[0].title, "Application failed");
    assert_eq!(
        notifications[0].body,
        "Northstar Labs application failed: captcha challenge"
    );
    assert_eq!(notifications[0].priority, "high");
    assert_eq!(notifications[0].channel, "in_app");
    assert_eq!(notifications[0].read_at, None);
    assert_eq!(notifications[0].metadata["applicationId"], json!("app-1"));
    assert_eq!(
        notifications[0].metadata["reason"],
        json!("captcha challenge")
    );
}

fn shell_sidecar(script: &str) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), script.to_string()],
    }
}
