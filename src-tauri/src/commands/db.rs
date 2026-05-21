use crate::{db::schema, AppState};
use tauri::State;

#[tauri::command]
pub fn schema_version_command(state: State<'_, AppState>) -> Result<i32, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    schema::schema_version(&connection).map_err(|error| error.to_string())
}

