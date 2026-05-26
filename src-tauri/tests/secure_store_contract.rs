use careercaveman_lib::{
    commands::db::protect_setting_secrets,
    db::models::{SettingValue, UpsertSetting},
    secure_store::{delete_secret, get_secret, save_secret},
};
use serde_json::json;
use std::sync::Mutex;

static SECURE_STORE_TEST_LOCK: Mutex<()> = Mutex::new(());

#[test]
fn stores_reads_updates_and_deletes_secrets_in_keyring() {
    let _guard = SECURE_STORE_TEST_LOCK
        .lock()
        .expect("lock secure store test");
    keyring_core::set_default_store(keyring_core::mock::Store::new().expect("mock keyring store"));

    let saved = save_secret("email.account.smtpPass", "app-password").expect("save secret");

    assert_eq!(saved.service, "careercaveman");
    assert_eq!(saved.key, "email.account.smtpPass");
    assert_eq!(saved.uri, "keyring://careercaveman/email.account.smtpPass");
    assert_eq!(
        get_secret("email.account.smtpPass").expect("read secret"),
        Some("app-password".to_string()),
    );

    save_secret("email.account.smtpPass", "updated-password").expect("update secret");
    assert_eq!(
        get_secret("email.account.smtpPass").expect("read updated secret"),
        Some("updated-password".to_string()),
    );
    assert!(delete_secret("email.account.smtpPass").expect("delete secret"));
    assert_eq!(
        get_secret("email.account.smtpPass").expect("read deleted secret"),
        None,
    );
    assert!(!delete_secret("email.account.smtpPass").expect("delete missing secret"));

    keyring_core::unset_default_store();
}

#[test]
fn rejects_invalid_secret_keys_and_empty_values() {
    let _guard = SECURE_STORE_TEST_LOCK
        .lock()
        .expect("lock secure store test");
    keyring_core::set_default_store(keyring_core::mock::Store::new().expect("mock keyring store"));

    assert!(save_secret("", "secret").is_err());
    assert!(save_secret("email/account", "secret").is_err());
    assert!(save_secret("email.account.smtpPass", "").is_err());

    keyring_core::unset_default_store();
}

#[test]
fn replaces_known_setting_secrets_with_keyring_references() {
    let _guard = SECURE_STORE_TEST_LOCK
        .lock()
        .expect("lock secure store test");
    keyring_core::set_default_store(keyring_core::mock::Store::new().expect("mock keyring store"));

    let protected = protect_setting_secrets(UpsertSetting {
        key: "email.account".to_string(),
        category: Some("email".to_string()),
        value: SettingValue::Object(json!({
            "fromEmail": "asha@gmail.example",
            "smtpPass": "smtp-secret",
            "imapPass": "imap-secret",
            "oauthClientSecret": "google-client-secret",
            "oauthRefreshToken": "google-refresh-token"
        })),
    })
    .expect("protect setting secrets");

    let SettingValue::Object(value) = protected.value else {
        panic!("expected object setting");
    };
    assert_eq!(
        value["smtpPass"],
        json!({
            "secretRef": "email.account.smtpPass",
            "service": "careercaveman",
            "uri": "keyring://careercaveman/email.account.smtpPass"
        })
    );
    assert_eq!(
        value["imapPass"],
        json!({
            "secretRef": "email.account.imapPass",
            "service": "careercaveman",
            "uri": "keyring://careercaveman/email.account.imapPass"
        })
    );
    assert_eq!(
        get_secret("email.account.smtpPass").expect("read smtp secret"),
        Some("smtp-secret".to_string()),
    );
    assert_eq!(
        get_secret("email.account.imapPass").expect("read imap secret"),
        Some("imap-secret".to_string()),
    );
    assert_eq!(
        value["oauthClientSecret"]["secretRef"],
        json!("email.account.oauthClientSecret")
    );
    assert_eq!(
        value["oauthRefreshToken"]["secretRef"],
        json!("email.account.oauthRefreshToken")
    );
    assert_eq!(
        get_secret("email.account.oauthClientSecret").expect("read oauth client secret"),
        Some("google-client-secret".to_string()),
    );
    assert_eq!(
        get_secret("email.account.oauthRefreshToken").expect("read oauth refresh token"),
        Some("google-refresh-token".to_string()),
    );

    let protected_prospecting = protect_setting_secrets(UpsertSetting {
        key: "prospecting.config".to_string(),
        category: Some("prospecting".to_string()),
        value: SettingValue::Object(json!({
            "sources": {
                "crunchbaseApiKey": "cb-secret"
            },
            "enrichment": {
                "hunterApiKey": "hunter-secret"
            }
        })),
    })
    .expect("protect prospecting setting secrets");

    let SettingValue::Object(prospecting_value) = protected_prospecting.value else {
        panic!("expected prospecting object setting");
    };
    assert_eq!(
        prospecting_value["sources"]["crunchbaseApiKey"]["secretRef"],
        json!("prospecting.crunchbase.apiKey")
    );
    assert_eq!(
        prospecting_value["enrichment"]["hunterApiKey"]["secretRef"],
        json!("prospecting.hunter.apiKey")
    );
    assert_eq!(
        get_secret("prospecting.crunchbase.apiKey").expect("read crunchbase secret"),
        Some("cb-secret".to_string()),
    );
    assert_eq!(
        get_secret("prospecting.hunter.apiKey").expect("read hunter secret"),
        Some("hunter-secret".to_string()),
    );

    keyring_core::unset_default_store();
}
