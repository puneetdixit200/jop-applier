use job_hunt_lib::db::schema::{initialize_schema, schema_version};
use rusqlite::Connection;

#[test]
fn phase_one_schema_creates_core_tables() {
    let connection = Connection::open_in_memory().expect("open in-memory database");

    initialize_schema(&connection).expect("initialize schema");

    let mut statement = connection
        .prepare(
            "SELECT name FROM sqlite_master \
             WHERE type = 'table' AND name IN (
                'user_profiles', 'jobs', 'applications', 'settings', 'ai_cache', 'notifications',
                'funded_companies', 'prospect_contacts', 'outreach_campaigns', 'outreach_emails',
                'email_opt_outs'
             ) \
             ORDER BY name",
        )
        .expect("prepare table query");
    let table_names = statement
        .query_map([], |row| row.get::<_, String>(0))
        .expect("query table names")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect table names");

    assert_eq!(
        table_names,
        vec![
            "ai_cache",
            "applications",
            "email_opt_outs",
            "funded_companies",
            "jobs",
            "notifications",
            "outreach_campaigns",
            "outreach_emails",
            "prospect_contacts",
            "settings",
            "user_profiles"
        ]
    );
    assert_eq!(schema_version(&connection).expect("read schema version"), 4);
}

#[test]
fn jobs_schema_includes_ai_recommendation_fields() {
    let connection = Connection::open_in_memory().expect("open in-memory database");

    initialize_schema(&connection).expect("initialize schema");

    let mut statement = connection
        .prepare("PRAGMA table_info(jobs)")
        .expect("prepare jobs columns query");
    let column_names = statement
        .query_map([], |row| row.get::<_, String>(1))
        .expect("query jobs columns")
        .collect::<Result<Vec<_>, _>>()
        .expect("collect jobs columns");

    assert!(column_names.contains(&"match_confidence".to_string()));
    assert!(column_names.contains(&"should_apply".to_string()));
}
