use job_hunt_lib::db::{
    models::UpsertNotification,
    queries::{list_notifications, mark_notification_read, save_notification},
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn stores_lists_and_marks_in_app_notifications_read() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let failure = save_notification(
        &connection,
        UpsertNotification {
            notification_type: "application.failed".to_string(),
            title: "Application failed".to_string(),
            body: "Northstar Labs application failed: captcha challenge".to_string(),
            priority: "high".to_string(),
            channel: "in_app".to_string(),
            metadata: json!({
                "applicationId": "app-1",
                "jobId": "job-1",
                "reason": "captcha challenge"
            }),
        },
    )
    .expect("save failure notification");
    let response = save_notification(
        &connection,
        UpsertNotification {
            notification_type: "response.received".to_string(),
            title: "Response received".to_string(),
            body: "Northstar Labs replied: Interview availability".to_string(),
            priority: "high".to_string(),
            channel: "in_app".to_string(),
            metadata: json!({
                "applicationId": "app-1",
                "communicationId": "comm-1",
                "responseType": "positive"
            }),
        },
    )
    .expect("save response notification");

    let notifications = list_notifications(&connection).expect("list notifications");

    assert_eq!(notifications.len(), 2);
    assert_eq!(notifications[0].id, response.id);
    assert_eq!(notifications[0].notification_type, "response.received");
    assert_eq!(notifications[0].title, "Response received");
    assert_eq!(notifications[0].priority, "high");
    assert_eq!(notifications[0].channel, "in_app");
    assert_eq!(notifications[0].read_at, None);
    assert_eq!(
        notifications[0].metadata["communicationId"],
        json!("comm-1")
    );
    assert_eq!(notifications[1].id, failure.id);

    let read = mark_notification_read(&connection, &failure.id, "2026-05-29T11:00:00Z")
        .expect("mark notification read")
        .expect("notification exists");

    assert_eq!(read.id, failure.id);
    assert_eq!(read.read_at.as_deref(), Some("2026-05-29T11:00:00Z"));
    assert_eq!(
        mark_notification_read(&connection, "missing", "2026-05-29T11:00:00Z")
            .expect("missing notification read is not an error"),
        None,
    );
}
