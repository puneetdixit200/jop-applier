#![allow(dead_code)]

use cluelyy_lib::sidecar::SidecarCommand;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};

pub fn runtime_status_sidecar(result: Value) -> SidecarCommand {
    expected_response_sidecar(
        Some("runtime.status"),
        None,
        json!({ "ok": true, "result": result }),
    )
}

pub fn application_review_sidecar(result: Value) -> SidecarCommand {
    expected_response_sidecar(
        Some("application.reviewDecision"),
        None,
        json!({ "ok": true, "result": result }),
    )
}

pub fn workflow_sidecar(workflow_id: &str, result: Value) -> SidecarCommand {
    expected_response_sidecar(
        Some("workflow.run"),
        Some(workflow_id),
        json!({ "ok": true, "result": result }),
    )
}

pub fn error_sidecar(message: &str) -> SidecarCommand {
    expected_response_sidecar(
        None,
        None,
        json!({ "ok": false, "error": { "message": message } }),
    )
}

pub fn failing_sidecar(status: i32) -> SidecarCommand {
    node_sidecar(format!(
        r#"
const readline = require('node:readline');
const rl = readline.createInterface({{ input: process.stdin, terminal: false }});
rl.once('line', () => process.exit({status}));
"#
    ))
}

pub fn capture_request_sidecar_with_response(
    request_path: &Path,
    response: Value,
) -> SidecarCommand {
    let request_path =
        serde_json::to_string(&request_path.to_string_lossy()).expect("serialize request path");
    let response = serde_json::to_string(&response).expect("serialize sidecar response");

    node_sidecar(format!(
        r#"
const fs = require('node:fs');
const readline = require('node:readline');
const requestPath = {request_path};
const response = {response};
const rl = readline.createInterface({{ input: process.stdin, terminal: false }});
rl.once('line', (line) => {{
  fs.writeFileSync(requestPath, line);
  process.stdout.write(JSON.stringify(response) + '\n');
}});
"#
    ))
}

fn expected_response_sidecar(
    expected_method: Option<&str>,
    expected_workflow_id: Option<&str>,
    response: Value,
) -> SidecarCommand {
    let expected_method = expected_method
        .map(serde_json::to_string)
        .transpose()
        .expect("serialize expected method")
        .unwrap_or_else(|| "null".to_string());
    let expected_workflow_id = expected_workflow_id
        .map(serde_json::to_string)
        .transpose()
        .expect("serialize expected workflow id")
        .unwrap_or_else(|| "null".to_string());
    let response = serde_json::to_string(&response).expect("serialize sidecar response");

    node_sidecar(format!(
        r#"
const readline = require('node:readline');
const expectedMethod = {expected_method};
const expectedWorkflowId = {expected_workflow_id};
const response = {response};
const rl = readline.createInterface({{ input: process.stdin, terminal: false }});
rl.once('line', (line) => {{
  let request;
  try {{
    request = JSON.parse(line);
  }} catch (_error) {{
    process.stdout.write(JSON.stringify({{ ok: false, error: {{ message: 'invalid request json' }} }}) + '\n');
    return;
  }}

  if (expectedMethod !== null && request.method !== expectedMethod) {{
    process.stdout.write(JSON.stringify({{ ok: false, error: {{ message: 'unexpected request' }} }}) + '\n');
    return;
  }}

  if (
    expectedWorkflowId !== null &&
    (!request.params || request.params.workflowId !== expectedWorkflowId)
  ) {{
    process.stdout.write(JSON.stringify({{ ok: false, error: {{ message: 'unexpected request' }} }}) + '\n');
    return;
  }}

  process.stdout.write(JSON.stringify(response) + '\n');
}});
"#
    ))
}

fn node_sidecar(script: String) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("node"),
        args: vec!["-e".to_string(), script],
    }
}
