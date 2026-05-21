use crate::{
    db::{models::UpsertJob, queries},
    sidecar::{self, SidecarCommand, SidecarRuntimeStatus},
    AppState,
};
use rusqlite::Connection;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn sidecar_status_command() -> Result<SidecarRuntimeStatus, String> {
    sidecar::sidecar_status().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_sidecar_workflow_command(
    state: State<'_, AppState>,
    workflow_id: String,
) -> Result<Value, String> {
    if workflow_id != "job-discovery" {
        return sidecar::run_sidecar_workflow(&workflow_id).map_err(|error| error.to_string());
    }

    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    run_sidecar_workflow_and_persist_jobs_with_command(
        &sidecar::default_sidecar_command().map_err(|error| error.to_string())?,
        &connection,
        &workflow_id,
    )
}

pub fn run_sidecar_workflow_and_persist_jobs_with_command(
    command: &SidecarCommand,
    connection: &Connection,
    workflow_id: &str,
) -> Result<Value, String> {
    let mut result = sidecar::run_sidecar_workflow_with_command(command, workflow_id)
        .map_err(|error| error.to_string())?;

    if workflow_id == "job-discovery" {
        persist_discovered_jobs(connection, &mut result)?;
    }

    Ok(result)
}

fn persist_discovered_jobs(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(jobs_value) = result.get("jobs").cloned() else {
        return Ok(());
    };
    let jobs: Vec<UpsertJob> =
        serde_json::from_value(jobs_value).map_err(|error| error.to_string())?;
    let mut stored = 0;

    for job in jobs {
        queries::upsert_job(connection, job).map_err(|error| error.to_string())?;
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("stored".to_string(), json!(stored));
    }

    Ok(())
}
