use rusqlite::Connection;
use std::{path::PathBuf, sync::Mutex};
use tauri::Manager;

pub mod commands;
pub mod db;
pub mod secure_store;
pub mod sidecar;
pub mod unsubscribe_server;

pub struct AppState {
    pub connection: Mutex<Connection>,
    pub database_path: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("resolve app data dir: {error}"))?;
            std::fs::create_dir_all(&data_dir)
                .map_err(|error| format!("create app data dir: {error}"))?;
            let database_path = data_dir.join("careercaveman.db");
            let connection = db::encryption::open_application_database(&database_path)
                .map_err(|error| format!("open application database: {error}"))?;
            app.manage(AppState {
                connection: Mutex::new(connection),
                database_path: database_path.clone(),
            });
            unsubscribe_server::start_unsubscribe_server(database_path);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db::schema_version_command,
            commands::db::get_user_profile_command,
            commands::db::save_user_profile_command,
            commands::db::get_setting_command,
            commands::db::save_setting_command,
            commands::db::get_database_encryption_status_command,
            commands::db::configure_database_encryption_command,
            commands::db::list_companies_command,
            commands::db::save_company_command,
            commands::db::list_jobs_command,
            commands::db::save_job_command,
            commands::db::list_applications_command,
            commands::db::save_application_command,
            commands::db::update_application_workflow_state_command,
            commands::db::list_application_events_command,
            commands::db::list_documents_command,
            commands::db::get_application_document_context_command,
            commands::db::save_document_command,
            commands::db::list_contacts_command,
            commands::db::save_contact_command,
            commands::db::list_funded_companies_command,
            commands::db::save_funded_company_command,
            commands::db::list_prospect_contacts_command,
            commands::db::save_prospect_contact_command,
            commands::db::save_outreach_campaign_command,
            commands::db::list_outreach_emails_command,
            commands::db::save_outreach_email_command,
            commands::db::update_outreach_email_review_command,
            commands::db::record_email_opt_out_command,
            commands::db::list_communications_command,
            commands::db::save_communication_command,
            commands::db::list_notifications_command,
            commands::db::save_notification_command,
            commands::db::mark_notification_read_command,
            commands::db::list_scheduled_tasks_command,
            commands::db::save_scheduled_task_command,
            commands::db::update_scheduled_task_run_command,
            commands::db::get_ai_cache_entry_command,
            commands::db::save_ai_cache_entry_command,
            commands::secure_store::save_secret_command,
            commands::secure_store::get_secret_command,
            commands::secure_store::delete_secret_command,
            commands::sidecar::sidecar_status_command,
            commands::sidecar::run_sidecar_workflow_command,
            commands::sidecar::run_application_review_decision_command,
            commands::sidecar::run_due_scheduled_tasks_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
