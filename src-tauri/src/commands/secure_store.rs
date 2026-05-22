use crate::secure_store::{self, SecureSecretRef};

#[tauri::command]
pub fn save_secret_command(key: String, secret: String) -> Result<SecureSecretRef, String> {
    secure_store::save_secret(&key, &secret).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_secret_command(key: String) -> Result<Option<String>, String> {
    secure_store::get_secret(&key).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_secret_command(key: String) -> Result<bool, String> {
    secure_store::delete_secret(&key).map_err(|error| error.to_string())
}
