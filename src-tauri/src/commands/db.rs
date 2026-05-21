use crate::{
    db::{
        models::{Job, Setting, UpsertJob, UpsertSetting, UpsertUserProfile, UserProfile},
        queries, schema,
    },
    AppState,
};
use tauri::State;

#[tauri::command]
pub fn schema_version_command(state: State<'_, AppState>) -> Result<i32, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    schema::schema_version(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_user_profile_command(state: State<'_, AppState>) -> Result<Option<UserProfile>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::get_user_profile(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_user_profile_command(
    state: State<'_, AppState>,
    profile: UpsertUserProfile,
) -> Result<UserProfile, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::upsert_user_profile(&connection, profile).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_setting_command(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<Setting>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::get_setting(&connection, &key).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_setting_command(
    state: State<'_, AppState>,
    setting: UpsertSetting,
) -> Result<Setting, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::upsert_setting(&connection, setting).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_jobs_command(state: State<'_, AppState>) -> Result<Vec<Job>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_jobs(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_job_command(state: State<'_, AppState>, job: UpsertJob) -> Result<Job, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::upsert_job(&connection, job).map_err(|error| error.to_string())
}
