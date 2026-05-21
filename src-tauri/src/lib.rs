use rusqlite::Connection;
use std::sync::Mutex;
use tauri::Manager;

pub mod commands;
pub mod db;

pub struct AppState {
    pub connection: Mutex<Connection>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|error| format!("create app data dir: {error}"))?;
            let database_path = data_dir.join("careercaveman.db");
            let connection = Connection::open(database_path)
                .map_err(|error| format!("open application database: {error}"))?;
            db::schema::initialize_schema(&connection)
                .map_err(|error| format!("initialize database schema: {error}"))?;
            app.manage(AppState {
                connection: Mutex::new(connection),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db::schema_version_command,
            commands::db::get_user_profile_command,
            commands::db::save_user_profile_command,
            commands::db::get_setting_command,
            commands::db::save_setting_command,
            commands::db::list_companies_command,
            commands::db::save_company_command,
            commands::db::list_jobs_command,
            commands::db::save_job_command,
            commands::db::list_applications_command,
            commands::db::save_application_command,
            commands::db::list_application_events_command,
            commands::db::list_documents_command,
            commands::db::save_document_command,
            commands::db::list_contacts_command,
            commands::db::save_contact_command,
            commands::db::list_communications_command,
            commands::db::save_communication_command,
            commands::db::list_scheduled_tasks_command,
            commands::db::save_scheduled_task_command,
            commands::db::get_ai_cache_entry_command,
            commands::db::save_ai_cache_entry_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
