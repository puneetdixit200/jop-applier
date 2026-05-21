use crate::sidecar::{self, SidecarRuntimeStatus};
use serde_json::Value;

#[tauri::command]
pub fn sidecar_status_command() -> Result<SidecarRuntimeStatus, String> {
    sidecar::sidecar_status().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_sidecar_workflow_command(workflow_id: String) -> Result<Value, String> {
    sidecar::run_sidecar_workflow(&workflow_id).map_err(|error| error.to_string())
}
