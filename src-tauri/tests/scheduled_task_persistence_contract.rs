use cluelyy_lib::db::{
    models::{ScheduledTaskRunUpdate, UpsertScheduledTask},
    queries::{list_scheduled_tasks, save_scheduled_task, update_scheduled_task_run},
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn stores_and_lists_scheduled_tasks_with_config() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let discovery = save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Morning discovery".to_string(),
            task_type: "discovery".to_string(),
            cron_expression: Some("0 9 * * 1-5".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-22T03:30:00Z".to_string()),
            config: json!({
                "platforms": ["linkedin", "indeed"],
                "maxResults": 25
            }),
        },
    )
    .expect("save discovery task");

    let follow_up = save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Follow-up reminders".to_string(),
            task_type: "follow_up".to_string(),
            cron_expression: None,
            is_enabled: false,
            last_run: Some("2026-05-21T03:30:00Z".to_string()),
            next_run: None,
            config: json!({
                "delayDays": [3, 7, 14],
                "channels": ["os", "in_app"]
            }),
        },
    )
    .expect("save follow-up task");

    let tasks = list_scheduled_tasks(&connection).expect("list scheduled tasks");

    assert_eq!(tasks.len(), 2);
    assert_eq!(tasks[0].id, follow_up.id);
    assert_eq!(tasks[0].name, "Follow-up reminders");
    assert_eq!(tasks[0].task_type, "follow_up");
    assert!(!tasks[0].is_enabled);
    assert_eq!(tasks[0].last_run.as_deref(), Some("2026-05-21T03:30:00Z"));
    assert_eq!(tasks[0].next_run.as_deref(), None);
    assert_eq!(tasks[0].config["delayDays"], json!([3, 7, 14]));
    assert_eq!(tasks[0].config["channels"], json!(["os", "in_app"]));

    assert_eq!(tasks[1].id, discovery.id);
    assert_eq!(tasks[1].name, "Morning discovery");
    assert_eq!(tasks[1].task_type, "discovery");
    assert!(tasks[1].is_enabled);
    assert_eq!(tasks[1].cron_expression.as_deref(), Some("0 9 * * 1-5"));
    assert_eq!(tasks[1].next_run.as_deref(), Some("2026-05-22T03:30:00Z"));
    assert_eq!(tasks[1].config["platforms"], json!(["linkedin", "indeed"]));
    assert_eq!(tasks[1].config["maxResults"], json!(25));
}

#[test]
fn updates_scheduled_task_run_timestamps() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let task = save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Follow-up check".to_string(),
            task_type: "follow_up".to_string(),
            cron_expression: Some("0 9 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-27T09:00:00Z".to_string()),
            config: json!({
                "delayDays": [3, 7, 14]
            }),
        },
    )
    .expect("save scheduled task");

    let updated = update_scheduled_task_run(
        &connection,
        &task.id,
        ScheduledTaskRunUpdate {
            last_run: "2026-05-27T09:00:00.000Z".to_string(),
            next_run: Some("2026-05-28T09:00:00.000Z".to_string()),
        },
    )
    .expect("update scheduled task run");

    assert_eq!(updated.id, task.id);
    assert_eq!(updated.last_run.as_deref(), Some("2026-05-27T09:00:00.000Z"));
    assert_eq!(updated.next_run.as_deref(), Some("2026-05-28T09:00:00.000Z"));
    assert_eq!(updated.name, "Follow-up check");
    assert_eq!(updated.config["delayDays"], json!([3, 7, 14]));

    let tasks = list_scheduled_tasks(&connection).expect("list scheduled tasks");
    assert_eq!(tasks[0].last_run.as_deref(), Some("2026-05-27T09:00:00.000Z"));
    assert_eq!(tasks[0].next_run.as_deref(), Some("2026-05-28T09:00:00.000Z"));
}
