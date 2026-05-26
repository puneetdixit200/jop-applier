use cluelyy_lib::db::{
    models::UpsertAiCacheEntry,
    queries::{get_ai_cache_entry, save_ai_cache_entry},
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn stores_replaces_and_reads_unexpired_ai_cache_entries() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let first = save_ai_cache_entry(
        &connection,
        UpsertAiCacheEntry {
            prompt_hash: "profile-job-1".to_string(),
            model: "gpt-4.1-mini".to_string(),
            response: "{\"score\":91}".to_string(),
            tokens_used: Some(321),
            expires_at: Some("9999-01-01 00:00:00".to_string()),
        },
    )
    .expect("save cache entry");

    assert_eq!(first.prompt_hash, "profile-job-1");
    assert_eq!(first.model, "gpt-4.1-mini");
    assert_eq!(first.tokens_used, Some(321));

    let cached = get_ai_cache_entry(&connection, "profile-job-1")
        .expect("read cache")
        .expect("cache hit");

    assert_eq!(cached.response, "{\"score\":91}");
    assert_eq!(cached.expires_at.as_deref(), Some("9999-01-01 00:00:00"));

    let replaced = save_ai_cache_entry(
        &connection,
        UpsertAiCacheEntry {
            prompt_hash: "profile-job-1".to_string(),
            model: "ollama:llama3.1".to_string(),
            response: "{\"score\":88}".to_string(),
            tokens_used: Some(250),
            expires_at: None,
        },
    )
    .expect("replace cache entry");

    assert_eq!(replaced.prompt_hash, "profile-job-1");
    assert_eq!(replaced.model, "ollama:llama3.1");
    assert_eq!(replaced.response, "{\"score\":88}");

    let updated = get_ai_cache_entry(&connection, "profile-job-1")
        .expect("read replaced cache")
        .expect("cache hit after replace");

    assert_eq!(updated.model, "ollama:llama3.1");
    assert_eq!(updated.tokens_used, Some(250));
    assert_eq!(updated.expires_at, None);

    save_ai_cache_entry(
        &connection,
        UpsertAiCacheEntry {
            prompt_hash: "expired-entry".to_string(),
            model: "gpt-4.1-mini".to_string(),
            response: "{}".to_string(),
            tokens_used: None,
            expires_at: Some("2000-01-01 00:00:00".to_string()),
        },
    )
    .expect("save expired cache entry");

    let expired = get_ai_cache_entry(&connection, "expired-entry").expect("read expired cache");
    assert_eq!(expired, None);
}
