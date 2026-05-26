use cluelyy_lib::db::models::UpsertUserProfile;
use cluelyy_lib::db::{
    encryption::{
        database_file_is_encrypted, disable_database_encryption, enable_database_encryption,
        open_application_database, open_encrypted_database, DATABASE_KEY_ENV,
    },
    queries::{get_user_profile, upsert_user_profile},
    schema::{initialize_schema, schema_version},
};
use rusqlite::Connection;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn converts_existing_sqlite_database_to_sqlcipher_and_back() {
    let dir = temp_database_dir("encryption-roundtrip");
    let database_path = dir.join("cluelyy.db");
    let mut connection = Connection::open(&database_path).expect("open plaintext database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_user_profile(
        &connection,
        UpsertUserProfile {
            full_name: "Asha Rao".to_string(),
            headline: "Frontend engineer".to_string(),
            email: Some("asha@example.com".to_string()),
            phone: None,
            location: Some("Bengaluru".to_string()),
            portfolio_url: None,
            linkedin_url: None,
            github_url: None,
            summary: Some("Builds local-first products.".to_string()),
            skills: vec!["React".to_string(), "Rust".to_string()],
            target_roles: vec!["Desktop Engineer".to_string()],
            preferences: json!({ "remotePreference": "remote" }),
        },
    )
    .expect("save profile");

    assert!(!database_file_is_encrypted(&database_path).expect("read plaintext header"));

    enable_database_encryption(
        &mut connection,
        &database_path,
        "correct horse battery staple",
    )
    .expect("enable database encryption");

    assert!(database_file_is_encrypted(&database_path).expect("read encrypted header"));
    assert!(Connection::open(&database_path)
        .expect("open without key")
        .query_row("SELECT count(*) FROM sqlite_master", [], |row| row
            .get::<_, i64>(0))
        .is_err());

    let encrypted = open_encrypted_database(&database_path, "correct horse battery staple")
        .expect("open with key");
    assert_eq!(schema_version(&encrypted).expect("read schema version"), 4);
    assert_eq!(
        get_user_profile(&encrypted)
            .expect("read encrypted profile")
            .expect("profile")
            .full_name,
        "Asha Rao"
    );
    drop(encrypted);

    disable_database_encryption(&mut connection, &database_path).expect("disable encryption");

    assert!(!database_file_is_encrypted(&database_path).expect("read plaintext header"));
    let plaintext = Connection::open(&database_path).expect("open decrypted database");
    assert_eq!(
        get_user_profile(&plaintext)
            .expect("read decrypted profile")
            .expect("profile")
            .full_name,
        "Asha Rao"
    );
    drop(plaintext);
    drop(connection);

    fs::remove_dir_all(dir).expect("remove temp database dir");
}

#[test]
fn startup_opens_new_database_encrypted_when_key_is_configured() {
    let dir = temp_database_dir("encrypted-startup");
    let database_path = dir.join("cluelyy.db");
    std::env::set_var(DATABASE_KEY_ENV, "startup passphrase");

    let connection = open_application_database(&database_path).expect("open app database");
    assert_eq!(schema_version(&connection).expect("read schema version"), 4);
    drop(connection);

    assert!(database_file_is_encrypted(&database_path).expect("read encrypted header"));
    let reopened = open_application_database(&database_path).expect("reopen encrypted database");
    assert_eq!(schema_version(&reopened).expect("read schema version"), 4);
    drop(reopened);

    std::env::remove_var(DATABASE_KEY_ENV);
    fs::remove_dir_all(dir).expect("remove temp database dir");
}

fn temp_database_dir(label: &str) -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system time")
        .as_nanos();
    let dir = std::env::temp_dir().join(format!(
        "cluelyy-{label}-{}-{nanos}",
        std::process::id()
    ));
    fs::create_dir_all(&dir).expect("create temp database dir");
    dir
}
