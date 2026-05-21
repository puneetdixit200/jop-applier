use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    io::Write,
    path::PathBuf,
    process::{Command, Stdio},
    string::FromUtf8Error,
};
use thiserror::Error;

#[derive(Clone, Debug, PartialEq)]
pub struct SidecarCommand {
    pub program: PathBuf,
    pub args: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SidecarProvider {
    pub provider: String,
    pub model: String,
    pub local: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SidecarRuntimeStatus {
    pub status: String,
    pub workflows: Vec<String>,
    pub provider: SidecarProvider,
}

#[derive(Debug, Error)]
pub enum SidecarError {
    #[error("resolve sidecar path: {0}")]
    ResolveSidecarPath(#[source] std::io::Error),
    #[error("spawn sidecar process: {0}")]
    Spawn(#[source] std::io::Error),
    #[error("write sidecar request: {0}")]
    WriteRequest(#[source] std::io::Error),
    #[error("wait for sidecar response: {0}")]
    Wait(#[source] std::io::Error),
    #[error("decode sidecar stdout: {0}")]
    DecodeStdout(#[from] FromUtf8Error),
    #[error("sidecar exited with status {status}: {stderr}")]
    ProcessFailed { status: String, stderr: String },
    #[error("sidecar did not return a response line")]
    MissingResponse,
    #[error("sidecar response must be valid JSON: {0}")]
    InvalidResponseJson(#[source] serde_json::Error),
    #[error("sidecar response missing result")]
    MissingResult,
    #[error("{0}")]
    SidecarResponse(String),
}

#[derive(Debug, Serialize)]
struct SidecarIpcRequest {
    id: String,
    method: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    params: Option<Value>,
}

#[derive(Debug, Deserialize)]
struct SidecarIpcResponse {
    ok: bool,
    result: Option<Value>,
    error: Option<SidecarIpcErrorPayload>,
}

#[derive(Debug, Deserialize)]
struct SidecarIpcErrorPayload {
    message: String,
}

pub fn default_sidecar_command() -> Result<SidecarCommand, SidecarError> {
    let sidecar_path = match std::env::var("CAREERCAVEMAN_SIDECAR_PATH") {
        Ok(path) => PathBuf::from(path),
        Err(_) => std::env::current_dir()
            .map_err(SidecarError::ResolveSidecarPath)?
            .join("dist-sidecar")
            .join("index.js"),
    };

    Ok(SidecarCommand {
        program: PathBuf::from("node"),
        args: vec![
            sidecar_path.to_string_lossy().into_owned(),
            "--stdio".to_string(),
        ],
    })
}

pub fn sidecar_status_with_command(
    command: &SidecarCommand,
) -> Result<SidecarRuntimeStatus, SidecarError> {
    let result = send_sidecar_ipc_request(
        command,
        SidecarIpcRequest {
            id: "runtime-status".to_string(),
            method: "runtime.status".to_string(),
            params: None,
        },
    )?;

    serde_json::from_value(result).map_err(SidecarError::InvalidResponseJson)
}

pub fn run_sidecar_workflow_with_command(
    command: &SidecarCommand,
    workflow_id: &str,
) -> Result<Value, SidecarError> {
    send_sidecar_ipc_request(
        command,
        SidecarIpcRequest {
            id: format!("workflow-{workflow_id}"),
            method: "workflow.run".to_string(),
            params: Some(json!({ "workflowId": workflow_id })),
        },
    )
}

pub fn sidecar_status() -> Result<SidecarRuntimeStatus, SidecarError> {
    sidecar_status_with_command(&default_sidecar_command()?)
}

pub fn run_sidecar_workflow(workflow_id: &str) -> Result<Value, SidecarError> {
    run_sidecar_workflow_with_command(&default_sidecar_command()?, workflow_id)
}

fn send_sidecar_ipc_request(
    command: &SidecarCommand,
    request: SidecarIpcRequest,
) -> Result<Value, SidecarError> {
    let mut child = Command::new(&command.program)
        .args(&command.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(SidecarError::Spawn)?;

    {
        let stdin = child.stdin.as_mut().ok_or(SidecarError::MissingResponse)?;
        let request_line =
            serde_json::to_string(&request).map_err(SidecarError::InvalidResponseJson)?;
        stdin
            .write_all(format!("{request_line}\n").as_bytes())
            .map_err(SidecarError::WriteRequest)?;
    }

    let output = child.wait_with_output().map_err(SidecarError::Wait)?;
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(SidecarError::ProcessFailed {
            status: output.status.to_string(),
            stderr,
        });
    }

    let stdout = String::from_utf8(output.stdout)?;
    let response_line = stdout
        .lines()
        .find(|line| !line.trim().is_empty())
        .ok_or(SidecarError::MissingResponse)?;
    let response: SidecarIpcResponse =
        serde_json::from_str(response_line).map_err(SidecarError::InvalidResponseJson)?;

    if !response.ok {
        return Err(SidecarError::SidecarResponse(
            response
                .error
                .map(|error| error.message)
                .unwrap_or_else(|| "sidecar request failed".to_string()),
        ));
    }

    response.result.ok_or(SidecarError::MissingResult)
}
