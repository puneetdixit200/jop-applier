use crate::{
    db::{
        models::{
            Application, ApplicationEvent, Communication, Contact, Document, Job, Setting,
            UpsertApplication, UpsertCommunication, UpsertContact, UpsertDocument, UpsertJob,
            UpsertSetting, UpsertUserProfile, UserProfile,
        },
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

#[tauri::command]
pub fn list_applications_command(state: State<'_, AppState>) -> Result<Vec<Application>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_applications(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_application_command(
    state: State<'_, AppState>,
    application: UpsertApplication,
) -> Result<Application, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::upsert_application(&connection, application).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_application_events_command(
    state: State<'_, AppState>,
    application_id: String,
) -> Result<Vec<ApplicationEvent>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_application_events(&connection, &application_id)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_documents_command(
    state: State<'_, AppState>,
    application_id: String,
) -> Result<Vec<Document>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_documents(&connection, &application_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_document_command(
    state: State<'_, AppState>,
    document: UpsertDocument,
) -> Result<Document, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::save_document(&connection, document).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_contacts_command(state: State<'_, AppState>) -> Result<Vec<Contact>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_contacts(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_contact_command(
    state: State<'_, AppState>,
    contact: UpsertContact,
) -> Result<Contact, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::save_contact(&connection, contact).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_communications_command(
    state: State<'_, AppState>,
    application_id: String,
) -> Result<Vec<Communication>, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::list_communications(&connection, &application_id).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_communication_command(
    state: State<'_, AppState>,
    communication: UpsertCommunication,
) -> Result<Communication, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    queries::save_communication(&connection, communication).map_err(|error| error.to_string())
}
