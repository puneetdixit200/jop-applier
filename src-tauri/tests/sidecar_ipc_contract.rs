use cluelyy_lib::sidecar::{
    run_application_review_decision_with_command, run_sidecar_workflow_with_command,
    sidecar_status_with_command,
};
use serde_json::json;

mod common;

#[test]
fn reads_runtime_status_from_sidecar_stdio() {
    let command = common::runtime_status_sidecar(json!({
        "status": "ready",
        "workflows": ["application-processing", "job-discovery"],
        "provider": {
            "provider": "offline",
            "model": "test-model",
            "local": true
        }
    }));

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
    let command = common::workflow_sidecar(
        "job-discovery",
        json!({ "queries": 1, "discovered": 2, "stored": 2 }),
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
    let command = common::application_review_sidecar(json!({
        "status": "submitted",
        "confirmationId": "CONF-42"
    }));

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
    let command = common::error_sidecar("Unknown workflow: missing");

    let error = run_sidecar_workflow_with_command(&command, "missing")
        .expect_err("sidecar error response should fail");

    assert_eq!(error.to_string(), "Unknown workflow: missing");
}
