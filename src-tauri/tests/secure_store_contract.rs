use careercaveman_lib::secure_store::{delete_secret, get_secret, save_secret};
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
