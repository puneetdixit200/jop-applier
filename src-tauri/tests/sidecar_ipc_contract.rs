use careercaveman_lib::sidecar::{
    run_sidecar_workflow_with_command, sidecar_status_with_command, SidecarCommand,
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
