use crate::{
    db::{
        models::{
            Application, ApplicationWorkflowStateUpdate, ScheduledTask, ScheduledTaskRunUpdate,
            SettingValue, UpsertJob, UpsertNotification,
        },
        queries,
    },
    sidecar::{self, SidecarCommand, SidecarRuntimeStatus},
    AppState,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::State;
use time::{format_description::well_known::Rfc3339, Duration, OffsetDateTime, Time, UtcOffset};

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct DueScheduledTaskRunResult {
    pub scanned: usize,
    pub due: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub notifications: Vec<Value>,
}

#[tauri::command]
pub fn sidecar_status_command() -> Result<SidecarRuntimeStatus, String> {
    sidecar::sidecar_status().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_sidecar_workflow_command(
    state: State<'_, AppState>,
    workflow_id: String,
) -> Result<Value, String> {
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;
    run_sidecar_workflow_and_persist_jobs_with_command(
        &sidecar::default_sidecar_command().map_err(|error| error.to_string())?,
        &connection,
        &workflow_id,
    )
}

pub fn run_sidecar_workflow_and_persist_jobs_with_command(
    command: &SidecarCommand,
    connection: &Connection,
    workflow_id: &str,
) -> Result<Value, String> {
    let mut result = sidecar::run_sidecar_workflow_with_command_and_params(
        command,
        workflow_id,
        workflow_params_from_settings(connection, workflow_id)?,
    )
    .map_err(|error| error.to_string())?;

    if workflow_id == "job-discovery" {
        persist_discovered_jobs(connection, &mut result)?;
    }
    persist_sidecar_notifications(connection, &mut result)?;

    Ok(result)
}

#[tauri::command]
pub fn run_application_review_decision_command(
    state: State<'_, AppState>,
    application: Application,
    decision: String,
) -> Result<Option<Application>, String> {
    let now = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())?;
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;

    run_application_review_decision_and_persist_with_command(
        &sidecar::default_sidecar_command().map_err(|error| error.to_string())?,
        &connection,
        &application,
        &decision,
        &now,
    )
}

pub fn run_application_review_decision_and_persist_with_command(
    command: &SidecarCommand,
    connection: &Connection,
    application: &Application,
    decision: &str,
    now: &str,
) -> Result<Option<Application>, String> {
    let result = sidecar::run_application_review_decision_with_command(
        command,
        serde_json::to_value(application).map_err(|error| error.to_string())?,
        decision,
    )
    .map_err(|error| error.to_string())?;
    let result: ApplicationReviewDecisionResult =
        serde_json::from_value(result).map_err(|error| error.to_string())?;

    queries::update_application_workflow_state(
        connection,
        &application.id,
        workflow_update_from_review_decision(application, result, now),
    )
    .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn run_due_scheduled_tasks_command(
    state: State<'_, AppState>,
) -> Result<DueScheduledTaskRunResult, String> {
    let now = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| error.to_string())?;
    let command = sidecar::default_sidecar_command().map_err(|error| error.to_string())?;
    let connection = state
        .connection
        .lock()
        .map_err(|_| "database connection lock poisoned".to_string())?;

    run_due_scheduled_tasks_with_command(&command, &connection, &now)
}

pub fn run_due_scheduled_tasks_with_command(
    command: &SidecarCommand,
    connection: &Connection,
    now: &str,
) -> Result<DueScheduledTaskRunResult, String> {
    let now = parse_rfc3339_utc(now)?;
    let tasks = queries::list_scheduled_tasks(connection).map_err(|error| error.to_string())?;
    let due_tasks = tasks
        .iter()
        .filter(|task| is_task_due(task, now))
        .collect::<Vec<_>>();
    let mut result = DueScheduledTaskRunResult {
        scanned: tasks.len(),
        due: due_tasks.len(),
        completed: 0,
        failed: 0,
        skipped: tasks.len().saturating_sub(due_tasks.len()),
        notifications: Vec::new(),
    };

    for task in due_tasks {
        let Some(workflow_id) = workflow_id_for_task_type(&task.task_type) else {
            result.failed += 1;
            continue;
        };

        let Ok(workflow_result) =
            run_sidecar_workflow_and_persist_jobs_with_command(command, connection, workflow_id)
        else {
            result.failed += 1;
            continue;
        };
        result
            .notifications
            .extend(workflow_notifications(&workflow_result));

        let update = ScheduledTaskRunUpdate {
            last_run: format_rfc3339_utc(now)?,
            next_run: calculate_next_run(task, now)
                .map(format_rfc3339_utc)
                .transpose()?,
        };
        queries::update_scheduled_task_run(connection, &task.id, update)
            .map_err(|error| error.to_string())?;
        result.completed += 1;
    }

    Ok(result)
}

fn workflow_notifications(result: &Value) -> Vec<Value> {
    result
        .get("notifications")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
enum ApplicationReviewDecisionResult {
    Submitted {
        #[serde(rename = "confirmationId")]
        confirmation_id: Option<String>,
    },
    Cancelled,
    Failed {
        reason: String,
    },
}

fn workflow_update_from_review_decision(
    application: &Application,
    result: ApplicationReviewDecisionResult,
    now: &str,
) -> ApplicationWorkflowStateUpdate {
    match result {
        ApplicationReviewDecisionResult::Submitted { confirmation_id } => {
            ApplicationWorkflowStateUpdate {
                status: Some("submitted".to_string()),
                submitted_at: Some(Some(now.to_string())),
                confirmation_id: Some(confirmation_id),
                error_message: Some(None),
                ..Default::default()
            }
        }
        ApplicationReviewDecisionResult::Cancelled => ApplicationWorkflowStateUpdate {
            status: Some("cancelled".to_string()),
            error_message: Some(None),
            ..Default::default()
        },
        ApplicationReviewDecisionResult::Failed { reason } => ApplicationWorkflowStateUpdate {
            status: Some("failed".to_string()),
            retry_count: Some(application.retry_count + 1),
            error_message: Some(Some(reason)),
            ..Default::default()
        },
    }
}

fn workflow_params_from_settings(
    connection: &Connection,
    workflow_id: &str,
) -> Result<Value, String> {
    if workflow_id != "job-discovery" {
        return Ok(json!({}));
    }

    let mut discovery = Map::new();
    if let Some(search_queries) = discovery_setting_array(connection, "discovery.searchQueries")? {
        discovery.insert("searchQueries".to_string(), Value::Array(search_queries));
    }
    if let Some(feed_sources) = discovery_setting_array(connection, "discovery.feedSources")? {
        discovery.insert("feedSources".to_string(), Value::Array(feed_sources));
    }

    if discovery.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "discovery": discovery }))
    }
}

fn discovery_setting_array(
    connection: &Connection,
    key: &str,
) -> Result<Option<Vec<Value>>, String> {
    let Some(setting) = queries::get_setting(connection, key).map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };

    match setting.value {
        SettingValue::Array(values) if !values.is_empty() => Ok(Some(values)),
        SettingValue::Object(value) => match value.as_array() {
            Some(values) if !values.is_empty() => Ok(Some(values.to_vec())),
            _ => Ok(None),
        },
        _ => Ok(None),
    }
}

fn persist_discovered_jobs(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(jobs_value) = result.get("jobs").cloned() else {
        return Ok(());
    };
    let jobs: Vec<UpsertJob> =
        serde_json::from_value(jobs_value).map_err(|error| error.to_string())?;
    let mut stored = 0;

    for job in jobs {
        queries::upsert_job(connection, job).map_err(|error| error.to_string())?;
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("stored".to_string(), json!(stored));
    }

    Ok(())
}

fn persist_sidecar_notifications(
    connection: &Connection,
    result: &mut Value,
) -> Result<(), String> {
    let Some(notifications_value) = result.get("notifications").cloned() else {
        return Ok(());
    };
    let notifications: Vec<SidecarNotificationDelivery> =
        serde_json::from_value(notifications_value).map_err(|error| error.to_string())?;
    let mut stored = 0;

    for notification in notifications
        .into_iter()
        .filter(|notification| notification.channel == "in_app")
    {
        queries::save_notification(
            connection,
            UpsertNotification {
                notification_type: notification.notification_type,
                title: notification.title,
                body: notification.body,
                priority: notification.priority,
                channel: notification.channel,
                metadata: notification.metadata,
            },
        )
        .map_err(|error| error.to_string())?;
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedNotifications".to_string(), json!(stored));
    }

    Ok(())
}

#[derive(Clone, Debug, Deserialize)]
struct SidecarNotificationDelivery {
    #[serde(rename = "type")]
    notification_type: String,
    title: String,
    body: String,
    priority: String,
    channel: String,
    #[serde(default)]
    metadata: Value,
}

fn workflow_id_for_task_type(task_type: &str) -> Option<&'static str> {
    match task_type {
        "discovery" => Some("job-discovery"),
        "apply" => Some("application-processing"),
        "follow_up" => Some("follow-up-check"),
        "email_check" => Some("email-check"),
        "analytics" => Some("analytics-refresh"),
        "export" => Some("export-sync"),
        "session_health" => Some("session-health"),
        "cleanup" => Some("cleanup"),
        _ => None,
    }
}

fn is_task_due(task: &ScheduledTask, now: OffsetDateTime) -> bool {
    task.is_enabled
        && task
            .next_run
            .as_deref()
            .and_then(|next_run| parse_rfc3339_utc(next_run).ok())
            .is_some_and(|next_run| next_run <= now)
}

fn calculate_next_run(task: &ScheduledTask, now: OffsetDateTime) -> Option<OffsetDateTime> {
    let cadence = task.config.get("cadence")?;
    let kind = cadence.get("kind")?.as_str()?;

    match kind {
        "interval" => {
            let minutes = positive_i64(cadence, "minutes")?;
            Some(now + Duration::minutes(minutes))
        }
        "daily" => {
            let hour = hour(cadence, "hour")?;
            let minute = minute(cadence, "minute")?;
            Some(next_daily_run(now, hour, minute)?)
        }
        "weekly" => {
            let day_of_week = day_of_week(cadence, "dayOfWeek")?;
            let hour = hour(cadence, "hour")?;
            let minute = minute(cadence, "minute")?;
            Some(next_weekly_run(now, day_of_week, hour, minute)?)
        }
        "windowed_interval" => {
            let every_hours = positive_u8(cadence, "everyHours")?;
            let start_hour = hour(cadence, "startHour")?;
            let end_hour = hour(cadence, "endHour")?;
            let minute = minute(cadence, "minute")?;
            Some(next_windowed_interval_run(
                now,
                every_hours,
                start_hour,
                end_hour,
                minute,
            )?)
        }
        _ => None,
    }
}

fn next_daily_run(now: OffsetDateTime, hour: u8, minute: u8) -> Option<OffsetDateTime> {
    let candidate = at_utc_time(now, 0, hour, minute)?;
    Some(if candidate > now {
        candidate
    } else {
        candidate + Duration::days(1)
    })
}

fn next_weekly_run(
    now: OffsetDateTime,
    day_of_week: u8,
    hour: u8,
    minute: u8,
) -> Option<OffsetDateTime> {
    let candidate = at_utc_time(now, 0, hour, minute)?;
    let days_until_target =
        (i64::from(day_of_week) - i64::from(candidate.weekday().number_days_from_sunday()) + 7) % 7;
    let target = candidate + Duration::days(days_until_target);

    Some(if target > now {
        target
    } else {
        target + Duration::days(7)
    })
}

fn next_windowed_interval_run(
    now: OffsetDateTime,
    every_hours: u8,
    start_hour: u8,
    end_hour: u8,
    minute: u8,
) -> Option<OffsetDateTime> {
    for day_offset in 0..=1 {
        for hour in (start_hour..=end_hour).step_by(usize::from(every_hours)) {
            let candidate = at_utc_time(now, day_offset, hour, minute)?;
            if candidate > now {
                return Some(candidate);
            }
        }
    }

    Some(now + Duration::hours(i64::from(every_hours)))
}

fn at_utc_time(
    now: OffsetDateTime,
    day_offset: i64,
    hour: u8,
    minute: u8,
) -> Option<OffsetDateTime> {
    let date = (now + Duration::days(day_offset)).date();
    let time = Time::from_hms(hour, minute, 0).ok()?;
    Some(date.with_time(time).assume_utc())
}

fn positive_i64(value: &Value, key: &str) -> Option<i64> {
    value.get(key)?.as_i64().filter(|number| *number > 0)
}

fn positive_u8(value: &Value, key: &str) -> Option<u8> {
    let number = positive_i64(value, key)?;
    u8::try_from(number).ok()
}

fn hour(value: &Value, key: &str) -> Option<u8> {
    let number = value.get(key)?.as_i64()?;
    u8::try_from(number).ok().filter(|hour| *hour <= 23)
}

fn minute(value: &Value, key: &str) -> Option<u8> {
    let number = value.get(key)?.as_i64()?;
    u8::try_from(number).ok().filter(|minute| *minute <= 59)
}

fn day_of_week(value: &Value, key: &str) -> Option<u8> {
    let number = value.get(key)?.as_i64()?;
    u8::try_from(number).ok().filter(|day| *day <= 6)
}

fn parse_rfc3339_utc(value: &str) -> Result<OffsetDateTime, String> {
    OffsetDateTime::parse(value, &Rfc3339)
        .map(|datetime| datetime.to_offset(UtcOffset::UTC))
        .map_err(|error| error.to_string())
}

fn format_rfc3339_utc(value: OffsetDateTime) -> Result<String, String> {
    value
        .to_offset(UtcOffset::UTC)
        .format(&Rfc3339)
        .map_err(|error| error.to_string())
}
