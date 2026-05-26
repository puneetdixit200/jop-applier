use keyring_core::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::sync::Arc;
use thiserror::Error;

const SERVICE_NAME: &str = "cluelyy";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SecureSecretRef {
    pub service: String,
    pub key: String,
    pub uri: String,
}

#[derive(Debug, Error)]
pub enum SecureStoreError {
    #[error("secret key cannot be empty")]
    EmptyKey,
    #[error("secret key can only contain letters, numbers, dot, dash, underscore, or colon")]
    InvalidKey,
    #[error("secret value cannot be empty")]
    EmptySecret,
    #[error("secure store unavailable: {0}")]
    StoreUnavailable(String),
    #[error("secure store operation failed: {0}")]
    Operation(String),
}

pub type SecureStoreResult<T> = Result<T, SecureStoreError>;

pub fn save_secret(key: &str, secret: &str) -> SecureStoreResult<SecureSecretRef> {
    let key = validate_key(key)?;
    if secret.is_empty() {
        return Err(SecureStoreError::EmptySecret);
    }

    entry_for_key(key)?.set_password(secret).map_err(map_keyring_error)?;
    Ok(secret_ref(key))
}

pub fn get_secret(key: &str) -> SecureStoreResult<Option<String>> {
    let key = validate_key(key)?;
    match entry_for_key(key)?.get_password() {
        Ok(secret) => Ok(Some(secret)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(map_keyring_error(error)),
    }
}

pub fn delete_secret(key: &str) -> SecureStoreResult<bool> {
    let key = validate_key(key)?;
    match entry_for_key(key)?.delete_credential() {
        Ok(()) => Ok(true),
        Err(KeyringError::NoEntry) => Ok(false),
        Err(error) => Err(map_keyring_error(error)),
    }
}

pub fn secret_ref_value(reference: &SecureSecretRef) -> Value {
    json!({
        "secretRef": reference.key,
        "service": reference.service,
        "uri": reference.uri,
    })
}

pub fn secret_ref_key(value: &Value) -> Option<&str> {
    let Value::Object(object) = value else {
        return None;
    };

    secret_ref_key_from_object(object)
}

pub fn secret_ref_key_from_object(object: &Map<String, Value>) -> Option<&str> {
    object
        .get("service")
        .and_then(Value::as_str)
        .filter(|service| *service == SERVICE_NAME)?;

    object.get("secretRef").and_then(Value::as_str)
}

pub fn initialize_default_store() -> SecureStoreResult<()> {
    if keyring_core::get_default_store().is_some() {
        return Ok(());
    }

    keyring_core::set_default_store(native_store()?);
    Ok(())
}

fn entry_for_key(key: &str) -> SecureStoreResult<Entry> {
    initialize_default_store()?;
    Entry::new(SERVICE_NAME, key).map_err(map_keyring_error)
}

fn secret_ref(key: &str) -> SecureSecretRef {
    SecureSecretRef {
        service: SERVICE_NAME.to_string(),
        key: key.to_string(),
        uri: format!("keyring://{SERVICE_NAME}/{key}"),
    }
}

fn validate_key(key: &str) -> SecureStoreResult<&str> {
    let key = key.trim();
    if key.is_empty() {
        return Err(SecureStoreError::EmptyKey);
    }
    if !key
        .chars()
        .all(|character| character.is_ascii_alphanumeric() || ".-_:".contains(character))
    {
        return Err(SecureStoreError::InvalidKey);
    }
    if key.contains(' ') {
        return Err(SecureStoreError::InvalidKey);
    }

    Ok(key)
}

fn map_keyring_error(error: KeyringError) -> SecureStoreError {
    match error {
        KeyringError::NoDefaultStore => SecureStoreError::StoreUnavailable(error.to_string()),
        _ => SecureStoreError::Operation(error.to_string()),
    }
}

#[cfg(target_os = "macos")]
fn native_store() -> SecureStoreResult<Arc<keyring_core::CredentialStore>> {
    let store: Arc<keyring_core::CredentialStore> =
        apple_native_keyring_store::keychain::Store::new()
            .map_err(|error| SecureStoreError::StoreUnavailable(error.to_string()))?;
    Ok(store)
}

#[cfg(target_os = "windows")]
fn native_store() -> SecureStoreResult<Arc<keyring_core::CredentialStore>> {
    let store: Arc<keyring_core::CredentialStore> = windows_native_keyring_store::Store::new()
        .map_err(|error| SecureStoreError::StoreUnavailable(error.to_string()))?;
    Ok(store)
}

#[cfg(target_os = "linux")]
fn native_store() -> SecureStoreResult<Arc<keyring_core::CredentialStore>> {
    let store: Arc<keyring_core::CredentialStore> =
        dbus_secret_service_keyring_store::Store::new()
            .map_err(|error| SecureStoreError::StoreUnavailable(error.to_string()))?;
    Ok(store)
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn native_store() -> SecureStoreResult<Arc<keyring_core::CredentialStore>> {
    Err(SecureStoreError::StoreUnavailable(
        "no OS keychain adapter is configured for this platform".to_string(),
    ))
}
