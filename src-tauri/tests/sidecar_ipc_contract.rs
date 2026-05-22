use careercaveman_lib::sidecar::{
    run_application_review_decision_with_command, run_sidecar_workflow_with_command,
    sidecar_status_with_command, SidecarCommand,
};
use serde_json::json;
use std::path::PathBuf;

#[test]
fn reads_runtime_status_from_sidecar_stdio() {
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"runtime.status"'*) printf '{"id":"runtime-status","ok":true,"result":{"status":"ready","workflows":["application-processing","job-discovery"],"provider":{"provider":"offline","model":"test-model","local":true}}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let status = sidecar_status_with_command(&command).expect("load sidecar status");

    assert_eq!(status.status, "ready");
    assert_eq!(
        status.workflows,
        vec!["application-processing", "job-discovery"]
    );
    assert_eq!(status.provider.provider, "offline");
    assert_eq!(status.provider.model, "test-model");
    assert!(status.provider.local);
}

#[test]
fn runs_workflow_through_sidecar_stdio() {
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"workflow.run"'*'"workflowId":"job-discovery"'*) printf '{"id":"workflow-job-discovery","ok":true,"result":{"queries":1,"discovered":2,"stored":2}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let result =
        run_sidecar_workflow_with_command(&command, "job-discovery").expect("run workflow");

    assert_eq!(
        result,
        json!({ "queries": 1, "discovered": 2, "stored": 2 })
    );
}

#[test]
fn runs_application_review_decision_through_sidecar_stdio() {
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"application.reviewDecision"'*) printf '{"id":"application-review-decision","ok":true,"result":{"status":"submitted","confirmationId":"CONF-42"}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let result = run_application_review_decision_with_command(
        &command,
        json!({
            "id": "app-1",
            "job_id": "job-1",
            "company_name": "Northstar Labs",
            "status": "review_pending",
            "mode": "semi_auto",
            "resume_path": "/docs/resume.pdf",
            "cover_letter_path": "/docs/cover.pdf",
            "retry_count": 0,
            "max_retries": 3
        }),
        "approve",
    )
    .expect("run application review decision");

    assert_eq!(
        result,
        json!({ "status": "submitted", "confirmationId": "CONF-42" })
    );
}

#[test]
fn reports_sidecar_error_response() {
    let command = shell_sidecar(
        r#"read line
printf '{"id":"workflow-missing","ok":false,"error":{"message":"Unknown workflow: missing"}}\n'"#,
    );

    let error = run_sidecar_workflow_with_command(&command, "missing")
        .expect_err("sidecar error response should fail");

    assert_eq!(error.to_string(), "Unknown workflow: missing");
}

fn shell_sidecar(script: &str) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), script.to_string()],
    }
}
