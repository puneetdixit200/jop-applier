use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::{self, Read},
    path::{Path, PathBuf},
};
use thiserror::Error;

use crate::{db::schema, secure_store};

const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";

pub const DATABASE_KEY_ENV: &str = "CLUELYY_DATABASE_KEY";
pub const DATABASE_KEY_SECRET: &str = "database.encryptionKey";

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseEncryptionStatus {
    pub available: bool,
    pub enabled: bool,
    pub database_path: String,
    pub key_source: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct DatabaseKey {
    pub source: String,
    pub value: String,
}

#[derive(Debug, Error)]
pub enum DatabaseEncryptionError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Io(#[from] io::Error),
    #[error(transparent)]
    SecureStore(#[from] secure_store::SecureStoreError),
    #[error("database encryption key cannot be empty")]
    EmptyKey,
    #[error("database encryption key is required to open encrypted local data")]
    MissingKey,
    #[error("SQLCipher is not available in this build")]
    SqlcipherUnavailable,
    #[error("database file is not readable after encryption change: {0}")]
    ReopenFailed(String),
}

pub type DatabaseEncryptionResult<T> = Result<T, DatabaseEncryptionError>;

pub fn open_application_database(path: &Path) -> DatabaseEncryptionResult<Connection> {
    let key = configured_database_key()?;
    let file_is_encrypted = database_file_is_encrypted(path)?;
    if file_is_encrypted && key.is_none() {
        return Err(DatabaseEncryptionError::MissingKey);
    }

    let connection = match key {
        Some(key) if file_is_encrypted || !path.exists() => {
            open_encrypted_database(path, &key.value)?
        }
        _ => Connection::open(path)?,
    };

    schema::initialize_schema(&connection)?;
    Ok(connection)
}

pub fn database_encryption_status(
    connection: &Connection,
    database_path: &Path,
) -> DatabaseEncryptionResult<DatabaseEncryptionStatus> {
    let enabled = database_file_is_encrypted(database_path)?;
    let available = sqlcipher_available(connection);
    let key_source = configured_database_key()
        .ok()
        .flatten()
        .map(|key| key.source);

    Ok(DatabaseEncryptionStatus {
        available,
        enabled,
        database_path: database_path.to_string_lossy().to_string(),
        key_source,
    })
}

pub fn configured_database_key() -> DatabaseEncryptionResult<Option<DatabaseKey>> {
    if let Ok(value) = std::env::var(DATABASE_KEY_ENV) {
        let value = normalize_key(value)?;
        return Ok(Some(DatabaseKey {
            source: "environment".to_string(),
            value,
        }));
    }

    Ok(
        secure_store::get_secret(DATABASE_KEY_SECRET)?.map(|value| DatabaseKey {
            source: "keychain".to_string(),
            value,
        }),
    )
}

pub fn save_database_key(passphrase: &str) -> DatabaseEncryptionResult<()> {
    secure_store::save_secret(DATABASE_KEY_SECRET, &normalize_key(passphrase)?)?;
    Ok(())
}

pub fn delete_database_key() -> DatabaseEncryptionResult<()> {
    secure_store::delete_secret(DATABASE_KEY_SECRET)?;
    Ok(())
}

pub fn enable_database_encryption(
    connection: &mut Connection,
    database_path: &Path,
    passphrase: &str,
) -> DatabaseEncryptionResult<()> {
    let passphrase = normalize_key(passphrase)?;
    ensure_sqlcipher_available(connection)?;

    if database_file_is_encrypted(database_path)? {
        connection.pragma_update(None, "rekey", &passphrase)?;
        verify_database_readable(connection)?;
        return Ok(());
    }

    export_and_replace_database(connection, database_path, Some(&passphrase))
}

pub fn disable_database_encryption(
    connection: &mut Connection,
    database_path: &Path,
) -> DatabaseEncryptionResult<()> {
    if !database_file_is_encrypted(database_path)? {
        return Ok(());
    }

    ensure_sqlcipher_available(connection)?;
    export_and_replace_database(connection, database_path, None)
}

pub fn database_file_is_encrypted(path: &Path) -> DatabaseEncryptionResult<bool> {
    if !path.exists() {
        return Ok(false);
    }

    let mut file = fs::File::open(path)?;
    let mut header = [0_u8; 16];
    let bytes_read = file.read(&mut header)?;
    if bytes_read < SQLITE_HEADER.len() {
        return Ok(false);
    }

    Ok(&header != SQLITE_HEADER)
}

pub fn open_encrypted_database(
    path: &Path,
    passphrase: &str,
) -> DatabaseEncryptionResult<Connection> {
    let passphrase = normalize_key(passphrase)?;
    let connection = Connection::open(path)?;
    apply_database_key(&connection, &passphrase)?;
    verify_database_readable(&connection)?;
    Ok(connection)
}

fn export_and_replace_database(
    connection: &mut Connection,
    database_path: &Path,
    target_key: Option<&str>,
) -> DatabaseEncryptionResult<()> {
    let parent = database_path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(parent)?;
    let temp_path = sibling_path(database_path, "tmp");
    let backup_path = sibling_path(database_path, "bak");
    remove_file_if_exists(&temp_path)?;
    remove_file_if_exists(&backup_path)?;

    checkpoint(connection)?;
    export_database(connection, &temp_path, target_key)?;

    let replacement = Connection::open_in_memory()?;
    let current = std::mem::replace(connection, replacement);
    drop(current);

    if database_path.exists() {
        fs::rename(database_path, &backup_path)?;
    }
    fs::rename(&temp_path, database_path)?;

    match reopen_after_replace(database_path, target_key) {
        Ok(reopened) => {
            *connection = reopened;
            remove_file_if_exists(&backup_path)?;
            Ok(())
        }
        Err(error) => {
            let _ = remove_file_if_exists(database_path);
            if backup_path.exists() {
                let _ = fs::rename(&backup_path, database_path);
            }
            Err(DatabaseEncryptionError::ReopenFailed(error.to_string()))
        }
    }
}

fn reopen_after_replace(
    database_path: &Path,
    target_key: Option<&str>,
) -> DatabaseEncryptionResult<Connection> {
    let connection = match target_key {
        Some(passphrase) => open_encrypted_database(database_path, passphrase)?,
        None => Connection::open(database_path)?,
    };
    schema::initialize_schema(&connection)?;
    Ok(connection)
}

fn export_database(
    connection: &Connection,
    target_path: &Path,
    target_key: Option<&str>,
) -> DatabaseEncryptionResult<()> {
    let schema_version = schema::schema_version(connection)?;
    let target = quote_sql_literal(&target_path.to_string_lossy());
    let key = quote_sql_literal(target_key.unwrap_or(""));
    let database_alias = if target_key.is_some() {
        "encrypted"
    } else {
        "plaintext"
    };

    connection.execute_batch(&format!(
        "ATTACH DATABASE {target} AS {database_alias} KEY {key};
         SELECT sqlcipher_export('{database_alias}');
         PRAGMA {database_alias}.user_version = {schema_version};
         DETACH DATABASE {database_alias};"
    ))?;
    Ok(())
}

fn apply_database_key(connection: &Connection, passphrase: &str) -> DatabaseEncryptionResult<()> {
    ensure_sqlcipher_available(connection)?;
    connection.pragma_update(None, "key", passphrase)?;
    Ok(())
}

fn sqlcipher_available(connection: &Connection) -> bool {
    connection
        .query_row("PRAGMA cipher_version", [], |row| row.get::<_, String>(0))
        .map(|version| !version.trim().is_empty())
        .unwrap_or(false)
}

fn ensure_sqlcipher_available(connection: &Connection) -> DatabaseEncryptionResult<()> {
    if sqlcipher_available(connection) {
        Ok(())
    } else {
        Err(DatabaseEncryptionError::SqlcipherUnavailable)
    }
}

fn verify_database_readable(connection: &Connection) -> DatabaseEncryptionResult<()> {
    connection.query_row("SELECT count(*) FROM sqlite_master", [], |_| Ok(()))?;
    Ok(())
}

fn checkpoint(connection: &Connection) -> DatabaseEncryptionResult<()> {
    let _ = connection.execute_batch("PRAGMA wal_checkpoint(FULL);");
    Ok(())
}

fn normalize_key(passphrase: impl Into<String>) -> DatabaseEncryptionResult<String> {
    let passphrase = passphrase.into().trim().to_string();
    if passphrase.is_empty() {
        return Err(DatabaseEncryptionError::EmptyKey);
    }
    Ok(passphrase)
}

fn quote_sql_literal(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

fn sibling_path(path: &Path, suffix: &str) -> PathBuf {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("cluelyy.db");
    path.with_file_name(format!("{file_name}.{suffix}"))
}

fn remove_file_if_exists(path: &Path) -> io::Result<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}
