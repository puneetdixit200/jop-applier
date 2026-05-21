use careercaveman_lib::db::schema::{initialize_schema, schema_version};
use rusqlite::Connection;

#[test]
fn phase_one_schema_creates_core_tables() {
    let connection = Connection::open_in_memory().expect("open in-memory database");

    initialize_schema(&connection).expect("initialize schema");

    let mut statement = connection
        .prepare(
            "SELECT name FROM sqlite_master \
             WHERE type = 'table' AND name IN ('user_profiles', 'jobs', 'applications', 'settings', 'ai_cache') \
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
        vec!["ai_cache", "applications", "jobs", "settings", "user_profiles"]
    );
    assert_eq!(schema_version(&connection).expect("read schema version"), 1);
}

