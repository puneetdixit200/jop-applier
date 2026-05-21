use careercaveman_lib::db::{
    models::{SettingValue, UpsertSetting, UpsertUserProfile},
    queries::{get_setting, get_user_profile, upsert_setting, upsert_user_profile},
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn stores_and_replaces_the_master_profile() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let saved = upsert_user_profile(
        &connection,
        UpsertUserProfile {
            full_name: "Deepak Kudi".to_string(),
            headline: "React and Rust engineer".to_string(),
            email: Some("deepak@example.com".to_string()),
            phone: None,
            location: Some("India".to_string()),
            portfolio_url: Some("https://example.com".to_string()),
            linkedin_url: Some("https://linkedin.com/in/deepak".to_string()),
            github_url: Some("https://github.com/deepak".to_string()),
            summary: Some("Builds local-first desktop tools.".to_string()),
            skills: vec!["React".to_string(), "TypeScript".to_string(), "Rust".to_string()],
            target_roles: vec!["Frontend Engineer".to_string(), "Desktop App Engineer".to_string()],
            preferences: json!({
                "remotePreference": "remote",
                "jobTypes": ["fulltime", "internship"]
            }),
        },
    )
    .expect("save profile");

    assert_eq!(saved.full_name, "Deepak Kudi");
    assert_eq!(saved.skills, vec!["React", "TypeScript", "Rust"]);
    assert_eq!(
        get_user_profile(&connection)
            .expect("read profile")
            .expect("profile exists")
            .target_roles,
        vec!["Frontend Engineer", "Desktop App Engineer"],
    );

    let replaced = upsert_user_profile(
        &connection,
        UpsertUserProfile {
            full_name: "Deepak Kudi".to_string(),
            headline: "AI product engineer".to_string(),
            email: Some("deepak@example.com".to_string()),
            phone: Some("+91-00000-00000".to_string()),
            location: Some("Remote".to_string()),
            portfolio_url: None,
            linkedin_url: None,
            github_url: None,
            summary: Some("Targets AI product internships.".to_string()),
            skills: vec!["Product".to_string(), "React".to_string()],
            target_roles: vec!["AI Product Intern".to_string()],
            preferences: json!({ "remotePreference": "any" }),
        },
    )
    .expect("replace profile");

    assert_eq!(saved.id, replaced.id);
    assert_eq!(
        get_user_profile(&connection)
            .expect("read replaced profile")
            .expect("profile exists")
            .headline,
        "AI product engineer",
    );
}

#[test]
fn stores_typed_settings_by_key_and_category() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    upsert_setting(
        &connection,
        UpsertSetting {
            key: "ai.provider".to_string(),
            category: Some("ai".to_string()),
            value: SettingValue::String("ollama".to_string()),
        },
    )
    .expect("save setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "application.maxDailyApplications".to_string(),
            category: Some("application".to_string()),
            value: SettingValue::Number(12.0),
        },
    )
    .expect("save numeric setting");

    assert_eq!(
        get_setting(&connection, "ai.provider")
            .expect("read setting")
            .expect("setting exists")
            .value,
        SettingValue::String("ollama".to_string()),
    );
    assert_eq!(
        get_setting(&connection, "application.maxDailyApplications")
            .expect("read numeric setting")
            .expect("setting exists")
            .value,
        SettingValue::Number(12.0),
    );
    assert!(get_setting(&connection, "missing").expect("read missing").is_none());
}

