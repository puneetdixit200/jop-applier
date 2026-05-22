use crate::{
    db::{
        models::{
            Application, ApplicationFollowUpUpdate, ApplicationResponseUpdate,
            ApplicationWorkflowStateUpdate, ScheduledTask, ScheduledTaskRunUpdate, SettingValue,
            UpsertCommunication, UpsertJob, UpsertNotification, UpsertSetting,
        },
        queries,
    },
    sidecar::{self, SidecarCommand, SidecarRuntimeStatus},
    AppState,
};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
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

const FOLLOW_UP_DELAYS_DAYS: [i64; 3] = [3, 7, 14];
const MAX_FOLLOW_UPS: i64 = 3;

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
    if workflow_id == "email-check" {
        persist_email_responses(connection, &mut result)?;
    }
    if workflow_id == "cold-email" {
        persist_cold_emails(connection, &mut result)?;
    }
    if workflow_id == "follow-up-check" {
        persist_follow_ups(connection, &mut result)?;
    }
    if workflow_id == "analytics-refresh" {
        persist_analytics_snapshot(connection, &mut result)?;
    }
    if workflow_id == "export-sync" {
        persist_export_runs(connection, &mut result)?;
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
        let task_notifications = if should_run_native_follow_up(connection, &task.task_type)? {
            match run_due_follow_up_task(connection, now) {
                Ok(notifications) => notifications,
                Err(_) => {
                    result.failed += 1;
                    continue;
                }
            }
        } else {
            let Some(workflow_id) = workflow_id_for_task_type(&task.task_type) else {
                result.failed += 1;
                continue;
            };

            let Ok(workflow_result) = run_sidecar_workflow_and_persist_jobs_with_command(
                command,
                connection,
                workflow_id,
            ) else {
                result.failed += 1;
                continue;
            };
            workflow_notifications(&workflow_result)
        };
        result.notifications.extend(task_notifications);

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

fn run_due_follow_up_task(
    connection: &Connection,
    now: OffsetDateTime,
) -> Result<Vec<Value>, String> {
    let applications = queries::list_applications(connection).map_err(|error| error.to_string())?;
    let mut notifications = Vec::new();

    for application in applications
        .into_iter()
        .filter(|application| is_follow_up_due(application, now))
    {
        let sent_at = format_rfc3339_utc(now)?;
        let communication = queries::save_communication(
            connection,
            UpsertCommunication {
                application_id: Some(application.id.clone()),
                contact_id: None,
                direction: "sent".to_string(),
                communication_type: "follow_up".to_string(),
                subject: Some(follow_up_subject(&application)),
                body: Some(follow_up_body(&application)),
                email_id: None,
                sent_at: Some(sent_at.clone()),
                read_at: None,
            },
        )
        .map_err(|error| error.to_string())?;
        let update = follow_up_update(&application, now)?;
        queries::update_application_follow_up_state(connection, &application.id, update.clone())
            .map_err(|error| error.to_string())?;
        notifications.extend(follow_up_notifications(
            connection,
            &application,
            &update,
            &communication.id,
            &sent_at,
        )?);
    }

    Ok(notifications)
}

fn should_run_native_follow_up(connection: &Connection, task_type: &str) -> Result<bool, String> {
    Ok(task_type == "follow_up" && setting_object(connection, "email.account")?.is_none())
}

fn is_follow_up_due(application: &Application, now: OffsetDateTime) -> bool {
    if !is_follow_up_eligible_status(&application.status) {
        return false;
    }
    if application.response_date.is_some() || application.response_type.is_some() {
        return false;
    }
    if application.follow_up_count >= MAX_FOLLOW_UPS {
        return false;
    }
    if let Some(next_follow_up) = application.next_follow_up.as_deref() {
        return parse_rfc3339_utc(next_follow_up).is_ok_and(|next_follow_up| next_follow_up <= now);
    }

    application
        .submitted_at
        .as_deref()
        .and_then(|submitted_at| parse_rfc3339_utc(submitted_at).ok())
        .is_some_and(|submitted_at| submitted_at + Duration::days(FOLLOW_UP_DELAYS_DAYS[0]) <= now)
}

fn is_follow_up_eligible_status(status: &str) -> bool {
    matches!(
        normalized_status_key(status).as_str(),
        "submitted" | "applied" | "noresponse" | "followupsent"
    )
}

fn normalized_status_key(status: &str) -> String {
    status
        .trim()
        .to_ascii_lowercase()
        .chars()
        .filter(|character| !matches!(character, '_' | '-' | ' '))
        .collect()
}

fn follow_up_update(
    application: &Application,
    now: OffsetDateTime,
) -> Result<ApplicationFollowUpUpdate, String> {
    let follow_up_count = application.follow_up_count + 1;
    let last_follow_up = format_rfc3339_utc(now)?;

    if follow_up_count >= MAX_FOLLOW_UPS {
        return Ok(ApplicationFollowUpUpdate {
            status: "ghosted".to_string(),
            follow_up_count,
            last_follow_up,
            next_follow_up: None,
        });
    }

    Ok(ApplicationFollowUpUpdate {
        status: "follow_up_sent".to_string(),
        follow_up_count,
        last_follow_up,
        next_follow_up: Some(format_rfc3339_utc(
            now + Duration::days(next_follow_up_delay_days(follow_up_count)),
        )?),
    })
}

fn next_follow_up_delay_days(follow_up_count: i64) -> i64 {
    let index = usize::try_from(follow_up_count)
        .unwrap_or(0)
        .min(FOLLOW_UP_DELAYS_DAYS.len() - 1);
    FOLLOW_UP_DELAYS_DAYS[index]
}

fn follow_up_subject(application: &Application) -> String {
    format!(
        "Following up on {} at {}",
        application.job_title, application.company_name
    )
}

fn follow_up_body(application: &Application) -> String {
    format!(
        "Hi {},\n\nI wanted to follow up on my application for the {} role.\n\nThank you.",
        application.company_name, application.job_title
    )
}

fn follow_up_notifications(
    connection: &Connection,
    application: &Application,
    update: &ApplicationFollowUpUpdate,
    communication_id: &str,
    created_at: &str,
) -> Result<Vec<Value>, String> {
    let notifications =
        follow_up_notification_values(application, update, communication_id, created_at);

    for notification in notifications
        .iter()
        .filter(|notification| notification["channel"] == json!("in_app"))
    {
        queries::save_notification(
            connection,
            UpsertNotification {
                notification_type: "follow_up.reminder".to_string(),
                title: notification["title"]
                    .as_str()
                    .unwrap_or("Follow-up sent")
                    .to_string(),
                body: notification["body"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
                priority: "medium".to_string(),
                channel: "in_app".to_string(),
                metadata: notification["metadata"].clone(),
            },
        )
        .map_err(|error| error.to_string())?;
    }

    Ok(notifications)
}

fn follow_up_notification_values(
    application: &Application,
    update: &ApplicationFollowUpUpdate,
    communication_id: &str,
    created_at: &str,
) -> Vec<Value> {
    let title = if update.status == "ghosted" {
        "Application marked ghosted"
    } else {
        "Follow-up sent"
    };
    let body = if update.status == "ghosted" {
        format!(
            "Final follow-up sent to {}; application marked ghosted.",
            application.company_name
        )
    } else {
        format!(
            "Follow-up {} sent to {}.",
            update.follow_up_count, application.company_name
        )
    };
    let metadata = json!({
        "applicationId": application.id.as_str(),
        "jobId": application.job_id.as_str(),
        "companyName": application.company_name.as_str(),
        "followUpCount": update.follow_up_count,
        "nextFollowUp": update.next_follow_up.as_deref(),
        "communicationId": communication_id,
    });
    let mut notifications = Vec::new();

    for channel in ["os", "in_app"] {
        notifications.push(json!({
            "type": "follow_up.reminder",
            "title": title,
            "body": body,
            "priority": "medium",
            "channel": channel,
            "createdAt": created_at,
            "metadata": metadata.clone(),
        }));
    }

    notifications
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
    if workflow_id == "job-discovery" {
        return discovery_workflow_params_from_settings(connection);
    }

    if workflow_id == "email-check" {
        return email_check_workflow_params_from_settings(connection);
    }

    if workflow_id == "cold-email" {
        return cold_email_workflow_params_from_settings(connection);
    }

    if workflow_id == "follow-up-check" {
        return follow_up_workflow_params_from_settings(connection);
    }

    if workflow_id == "analytics-refresh" {
        return analytics_refresh_workflow_params_from_database(connection);
    }

    if workflow_id == "export-sync" {
        return export_sync_workflow_params_from_settings(connection);
    }

    Ok(json!({}))
}

fn discovery_workflow_params_from_settings(connection: &Connection) -> Result<Value, String> {
    let mut discovery = Map::new();
    if let Some(search_queries) = discovery_setting_array(connection, "discovery.searchQueries")? {
        discovery.insert("searchQueries".to_string(), Value::Array(search_queries));
    }
    if let Some(feed_sources) = discovery_setting_array(connection, "discovery.feedSources")? {
        discovery.insert("feedSources".to_string(), Value::Array(feed_sources));
    }
    if let Some(ats_sources) = discovery_setting_array(connection, "discovery.atsSources")? {
        discovery.insert("atsSources".to_string(), Value::Array(ats_sources));
    }
    if let Some(career_page_sources) =
        discovery_setting_array(connection, "discovery.careerPageSources")?
    {
        discovery.insert(
            "careerPageSources".to_string(),
            Value::Array(career_page_sources),
        );
    }

    if discovery.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "discovery": discovery }))
    }
}

fn email_check_workflow_params_from_settings(connection: &Connection) -> Result<Value, String> {
    let mut email_check = Map::new();
    if let Some(account) = setting_object(connection, "email.account")? {
        email_check.insert("account".to_string(), Value::Object(account));
    }
    if let Some(check) = setting_object(connection, "email.check")? {
        let mut fetch = Map::new();
        if let Some(mailbox) = check
            .get("mailbox")
            .and_then(Value::as_str)
            .filter(|mailbox| !mailbox.trim().is_empty())
        {
            fetch.insert("mailbox".to_string(), json!(mailbox));
        }
        if let Some(mark_seen) = check.get("markSeen").and_then(Value::as_bool) {
            fetch.insert("markSeen".to_string(), json!(mark_seen));
        }
        if let Some(max_responses) = check
            .get("maxResponses")
            .and_then(Value::as_i64)
            .filter(|max_responses| *max_responses > 0)
        {
            fetch.insert("limit".to_string(), json!(max_responses));
        }
        if !fetch.is_empty() {
            email_check.insert("fetch".to_string(), Value::Object(fetch));
        }
    }
    if let Some(match_context) = email_match_context_from_database(connection)? {
        email_check.insert("matchContext".to_string(), match_context);
    }

    if email_check.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "emailCheck": email_check }))
    }
}

fn cold_email_workflow_params_from_settings(connection: &Connection) -> Result<Value, String> {
    let mut cold_email = Map::new();
    if let Some(account) = setting_object(connection, "email.account")? {
        cold_email.insert("account".to_string(), Value::Object(account));
    }

    if cold_email.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "coldEmail": cold_email }))
    }
}

fn follow_up_workflow_params_from_settings(connection: &Connection) -> Result<Value, String> {
    let mut follow_up = Map::new();
    if let Some(account) = setting_object(connection, "email.account")? {
        follow_up.insert("account".to_string(), Value::Object(account));
    }
    if let Some(applications) = follow_up_applications_from_database(connection)? {
        follow_up.insert("applications".to_string(), Value::Array(applications));
    }

    if follow_up.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "followUp": follow_up }))
    }
}

fn follow_up_applications_from_database(
    connection: &Connection,
) -> Result<Option<Vec<Value>>, String> {
    let applications = queries::list_applications(connection).map_err(|error| error.to_string())?;
    if applications.is_empty() {
        return Ok(None);
    }

    let companies = queries::list_companies(connection).map_err(|error| error.to_string())?;
    let company_names_by_id = companies
        .into_iter()
        .map(|company| (company.id, company.name))
        .collect::<HashMap<_, _>>();
    let contacts = queries::list_contacts(connection).map_err(|error| error.to_string())?;
    let contacts_by_company = contacts
        .into_iter()
        .filter_map(|contact| {
            let email = contact.email.clone()?;
            let company_name = contact
                .company_id
                .as_deref()
                .and_then(|company_id| company_names_by_id.get(company_id))?
                .clone();

            Some((
                normalized_company_name(&company_name),
                json!({
                    "contactId": contact.id,
                    "contactName": contact.name,
                    "contactEmail": email,
                }),
            ))
        })
        .collect::<HashMap<_, _>>();

    let values = applications
        .into_iter()
        .map(|application| {
            let contact =
                contacts_by_company.get(&normalized_company_name(&application.company_name));

            json!({
                "id": application.id,
                "jobId": application.job_id,
                "jobTitle": application.job_title,
                "companyName": application.company_name,
                "status": application.status,
                "submittedAt": application.submitted_at,
                "nextFollowUp": application.next_follow_up,
                "lastFollowUp": application.last_follow_up,
                "followUpCount": application.follow_up_count,
                "responseDate": application.response_date,
                "responseType": application.response_type,
                "contactId": contact.and_then(|value| value.get("contactId")).cloned(),
                "contactName": contact.and_then(|value| value.get("contactName")).cloned(),
                "contactEmail": contact.and_then(|value| value.get("contactEmail")).cloned(),
            })
        })
        .collect::<Vec<_>>();

    Ok(Some(values))
}

fn normalized_company_name(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn analytics_refresh_workflow_params_from_database(
    connection: &Connection,
) -> Result<Value, String> {
    let applications = queries::list_applications(connection).map_err(|error| error.to_string())?;
    let jobs = queries::list_jobs(connection).map_err(|error| error.to_string())?;
    if applications.is_empty() && jobs.is_empty() {
        return Ok(json!({}));
    }

    let job_platforms = jobs
        .iter()
        .map(|job| (job.id.clone(), job.platform.clone()))
        .collect::<HashMap<_, _>>();
    let application_values = applications
        .into_iter()
        .map(|application| {
            json!({
                "id": application.id,
                "companyName": application.company_name,
                "platform": job_platforms
                    .get(&application.job_id)
                    .cloned()
                    .unwrap_or_else(|| "unknown".to_string()),
                "status": application.status,
                "appliedAt": application.submitted_at,
                "responseDate": application.response_date,
                "responseType": application.response_type,
                "followUpCount": application.follow_up_count,
                "resumeVersion": Value::Null,
            })
        })
        .collect::<Vec<_>>();
    let job_values = jobs
        .into_iter()
        .map(|job| {
            json!({
                "id": job.id,
                "platform": job.platform,
                "companyName": job.company_name,
                "matchScore": job.match_score,
                "requiredSkills": job.requirements,
            })
        })
        .collect::<Vec<_>>();

    Ok(json!({
        "analyticsRefresh": {
            "inputs": {
                "applications": application_values,
                "jobs": job_values,
            }
        }
    }))
}

fn export_sync_workflow_params_from_settings(connection: &Connection) -> Result<Value, String> {
    let mut export_sync = Map::new();

    if let Some(payload) = export_sync_payload_from_database(connection)? {
        export_sync.insert("payload".to_string(), payload);
    }
    if let Some(export_config) = setting_object(connection, "export.config")? {
        if let Some(notion) = notion_export_settings(&export_config) {
            export_sync.insert("notion".to_string(), Value::Object(notion));
        }
        if let Some(google_sheets) = google_sheets_export_settings(&export_config) {
            export_sync.insert("googleSheets".to_string(), Value::Object(google_sheets));
        }
        if let Some(csv) = csv_export_settings(&export_config) {
            export_sync.insert("csv".to_string(), Value::Object(csv));
        }
    }

    if export_sync.is_empty() {
        Ok(json!({}))
    } else {
        Ok(json!({ "exportSync": export_sync }))
    }
}

fn export_sync_payload_from_database(connection: &Connection) -> Result<Option<Value>, String> {
    let applications = queries::list_applications(connection).map_err(|error| error.to_string())?;
    let analytics = queries::get_setting(connection, "analytics.latestSnapshot")
        .map_err(|error| error.to_string())?
        .and_then(|setting| match setting.value {
            SettingValue::Object(snapshot) => Some(snapshot),
            _ => None,
        });

    if applications.is_empty() && analytics.is_none() {
        return Ok(None);
    }

    let application_values = applications
        .into_iter()
        .map(|application| {
            json!({
                "id": application.id,
                "jobId": application.job_id,
                "jobTitle": application.job_title,
                "companyName": application.company_name,
                "status": application.status,
                "mode": application.mode,
                "resumePath": application.resume_path,
                "coverLetterPath": application.cover_letter_path,
                "submittedAt": application.submitted_at,
                "submissionUrl": application.submission_url,
                "confirmationId": application.confirmation_id,
                "lastFollowUp": application.last_follow_up,
                "nextFollowUp": application.next_follow_up,
                "followUpCount": application.follow_up_count,
                "responseDate": application.response_date,
                "responseType": application.response_type,
                "tags": application.tags,
            })
        })
        .collect::<Vec<_>>();

    Ok(Some(json!({
        "applications": application_values,
        "analytics": analytics.unwrap_or(Value::Null),
    })))
}

fn notion_export_settings(config: &Map<String, Value>) -> Option<Map<String, Value>> {
    let enabled = config
        .get("notionEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let api_key = non_empty_config_string(config, "notionApiKey");
    let database_id = non_empty_config_string(config, "notionDatabaseId");

    if !enabled && api_key.is_none() && database_id.is_none() {
        return None;
    }

    let mut notion = Map::new();
    notion.insert("enabled".to_string(), json!(enabled));
    insert_string_config(&mut notion, "apiKey", api_key);
    insert_string_config(&mut notion, "databaseId", database_id);
    Some(notion)
}

fn google_sheets_export_settings(config: &Map<String, Value>) -> Option<Map<String, Value>> {
    let enabled = config
        .get("googleSheetsEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let spreadsheet_id = non_empty_config_string(config, "googleSheetsId");
    let access_token = non_empty_config_string(config, "googleSheetsAccessToken");
    let api_key = non_empty_config_string(config, "googleSheetsApiKey");
    let range = non_empty_config_string(config, "googleSheetsRange");

    if !enabled
        && spreadsheet_id.is_none()
        && access_token.is_none()
        && api_key.is_none()
        && range.is_none()
    {
        return None;
    }

    let mut google_sheets = Map::new();
    google_sheets.insert("enabled".to_string(), json!(enabled));
    insert_string_config(&mut google_sheets, "spreadsheetId", spreadsheet_id);
    insert_string_config(&mut google_sheets, "accessToken", access_token);
    insert_string_config(&mut google_sheets, "apiKey", api_key);
    insert_string_config(&mut google_sheets, "range", range);
    Some(google_sheets)
}

fn csv_export_settings(config: &Map<String, Value>) -> Option<Map<String, Value>> {
    let enabled = config
        .get("csvEnabled")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    let output_path = non_empty_config_string(config, "csvOutputPath");

    if !enabled && output_path.is_none() {
        return None;
    }

    let mut csv = Map::new();
    csv.insert("enabled".to_string(), json!(enabled));
    insert_string_config(&mut csv, "outputPath", output_path);
    Some(csv)
}

fn insert_string_config(target: &mut Map<String, Value>, key: &str, value: Option<String>) {
    if let Some(value) = value {
        target.insert(key.to_string(), json!(value));
    }
}

fn non_empty_config_string(config: &Map<String, Value>, key: &str) -> Option<String> {
    config
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn email_match_context_from_database(connection: &Connection) -> Result<Option<Value>, String> {
    let applications = queries::list_applications(connection).map_err(|error| error.to_string())?;
    let contacts = queries::list_contacts(connection).map_err(|error| error.to_string())?;
    if applications.is_empty() && contacts.is_empty() {
        return Ok(None);
    }

    let companies = queries::list_companies(connection).map_err(|error| error.to_string())?;
    let company_names_by_id = companies
        .into_iter()
        .map(|company| (company.id, company.name))
        .collect::<HashMap<_, _>>();
    let application_values = applications
        .into_iter()
        .map(|application| {
            json!({
                "id": application.id,
                "jobId": application.job_id,
                "companyName": application.company_name,
                "status": application.status,
            })
        })
        .collect::<Vec<_>>();
    let contact_values = contacts
        .into_iter()
        .filter_map(|contact| {
            let email = contact.email?;
            let company_name = contact
                .company_id
                .as_deref()
                .and_then(|company_id| company_names_by_id.get(company_id))
                .cloned();

            Some(json!({
                "id": contact.id,
                "name": contact.name,
                "email": email,
                "companyId": contact.company_id,
                "companyName": company_name,
            }))
        })
        .collect::<Vec<_>>();

    if application_values.is_empty() && contact_values.is_empty() {
        Ok(None)
    } else {
        Ok(Some(json!({
            "applications": application_values,
            "contacts": contact_values,
        })))
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

fn setting_object(
    connection: &Connection,
    key: &str,
) -> Result<Option<Map<String, Value>>, String> {
    let Some(setting) = queries::get_setting(connection, key).map_err(|error| error.to_string())?
    else {
        return Ok(None);
    };

    match setting.value {
        SettingValue::Object(Value::Object(value)) if !value.is_empty() => Ok(Some(value)),
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

fn persist_email_responses(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(responses_value) = result.get("responses").cloned() else {
        return Ok(());
    };
    let responses: Vec<SidecarEmailResponse> =
        serde_json::from_value(responses_value).map_err(|error| error.to_string())?;
    let mut stored = 0;
    let mut notifications = result
        .get("notifications")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for response in responses
        .into_iter()
        .filter(|response| response.application_id.is_some())
    {
        let application_id = response
            .application_id
            .as_deref()
            .expect("filtered email responses have an application id");
        queries::update_application_response_state(
            connection,
            application_id,
            ApplicationResponseUpdate {
                status: "response_received".to_string(),
                response_date: response.received_at.clone(),
                response_type: response.response_type.clone(),
                response_notes: response.subject.clone(),
            },
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| format!("email response application not found: {application_id}"))?;
        let communication = queries::save_communication(
            connection,
            UpsertCommunication {
                application_id: Some(application_id.to_string()),
                contact_id: response.contact_id.clone(),
                direction: "received".to_string(),
                communication_type: "response".to_string(),
                subject: response.subject.clone(),
                body: response.body.clone(),
                email_id: Some(response.email_id.clone()),
                sent_at: Some(response.received_at.clone()),
                read_at: None,
            },
        )
        .map_err(|error| error.to_string())?;
        notifications.extend(email_response_notifications(&response, &communication.id));
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedEmailResponses".to_string(), json!(stored));
        if !notifications.is_empty() {
            payload.insert("notifications".to_string(), Value::Array(notifications));
        }
    }

    Ok(())
}

fn email_response_notifications(
    response: &SidecarEmailResponse,
    communication_id: &str,
) -> Vec<Value> {
    let company_name = response.company_name.as_deref().unwrap_or("A company");
    let subject = response
        .subject
        .as_deref()
        .unwrap_or(response.response_type.as_str());
    let body = format!("{company_name} replied: {subject}");
    let metadata = json!({
        "applicationId": response.application_id.as_deref(),
        "jobId": response.job_id.as_deref(),
        "companyName": response.company_name.as_deref(),
        "communicationId": communication_id,
        "responseType": response.response_type.as_str(),
        "subject": response.subject.as_deref(),
        "emailId": response.email_id.as_str(),
    });

    ["os", "in_app"]
        .into_iter()
        .map(|channel| {
            json!({
                "type": "response.received",
                "title": "Response received",
                "body": body.as_str(),
                "priority": "high",
                "channel": channel,
                "createdAt": response.received_at.as_str(),
                "metadata": metadata.clone(),
            })
        })
        .collect()
}

fn persist_cold_emails(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(cold_emails_value) = result.get("coldEmails").cloned() else {
        return Ok(());
    };
    let cold_emails: Vec<SidecarColdEmail> =
        serde_json::from_value(cold_emails_value).map_err(|error| error.to_string())?;
    let mut stored = 0;
    let mut persisted_cold_emails = Vec::new();

    for mut cold_email in cold_emails {
        let communication = queries::save_communication(
            connection,
            UpsertCommunication {
                application_id: cold_email.application_id.clone(),
                contact_id: cold_email.contact_id.clone(),
                direction: "sent".to_string(),
                communication_type: "cold_email".to_string(),
                subject: Some(cold_email.subject.clone()),
                body: Some(cold_email.body.clone()),
                email_id: cold_email.email_id.clone(),
                sent_at: Some(cold_email.sent_at.clone()),
                read_at: None,
            },
        )
        .map_err(|error| error.to_string())?;
        cold_email.communication_id = Some(communication.id);
        persisted_cold_emails
            .push(serde_json::to_value(cold_email).map_err(|error| error.to_string())?);
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedColdEmails".to_string(), json!(stored));
        payload.insert(
            "coldEmails".to_string(),
            Value::Array(persisted_cold_emails),
        );
    }

    Ok(())
}

fn persist_follow_ups(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(follow_ups_value) = result.get("followUps").cloned() else {
        return Ok(());
    };
    let follow_ups: Vec<SidecarFollowUp> =
        serde_json::from_value(follow_ups_value).map_err(|error| error.to_string())?;
    let mut stored = 0;
    let mut persisted_follow_ups = Vec::new();
    let mut notifications = result
        .get("notifications")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();

    for mut follow_up in follow_ups {
        let update = ApplicationFollowUpUpdate {
            status: follow_up.status.clone(),
            follow_up_count: follow_up.follow_up_count,
            last_follow_up: follow_up.sent_at.clone(),
            next_follow_up: follow_up.next_follow_up.clone(),
        };
        let application = queries::update_application_follow_up_state(
            connection,
            &follow_up.application_id,
            update.clone(),
        )
        .map_err(|error| error.to_string())?
        .ok_or_else(|| {
            format!(
                "follow-up application not found: {}",
                follow_up.application_id
            )
        })?;
        let communication = queries::save_communication(
            connection,
            UpsertCommunication {
                application_id: Some(follow_up.application_id.clone()),
                contact_id: follow_up.contact_id.clone(),
                direction: "sent".to_string(),
                communication_type: "follow_up".to_string(),
                subject: Some(follow_up.subject.clone()),
                body: Some(follow_up.body.clone()),
                email_id: follow_up.email_id.clone(),
                sent_at: Some(follow_up.sent_at.clone()),
                read_at: None,
            },
        )
        .map_err(|error| error.to_string())?;
        follow_up.communication_id = Some(communication.id.clone());
        notifications.extend(follow_up_notification_values(
            &application,
            &update,
            &communication.id,
            &follow_up.sent_at,
        ));
        persisted_follow_ups
            .push(serde_json::to_value(follow_up).map_err(|error| error.to_string())?);
        stored += 1;
    }

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedFollowUps".to_string(), json!(stored));
        payload.insert("followUps".to_string(), Value::Array(persisted_follow_ups));
        if !notifications.is_empty() {
            payload.insert("notifications".to_string(), Value::Array(notifications));
        }
    }

    Ok(())
}

fn persist_analytics_snapshot(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(snapshot) = result.get("snapshot").cloned() else {
        return Ok(());
    };

    queries::upsert_setting(
        connection,
        UpsertSetting {
            key: "analytics.latestSnapshot".to_string(),
            category: Some("analytics".to_string()),
            value: SettingValue::Object(snapshot),
        },
    )
    .map_err(|error| error.to_string())?;

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedAnalyticsSnapshot".to_string(), json!(true));
    }

    Ok(())
}

fn persist_export_runs(connection: &Connection, result: &mut Value) -> Result<(), String> {
    let Some(runs) = result.get("runs").and_then(Value::as_array).cloned() else {
        return Ok(());
    };

    queries::upsert_setting(
        connection,
        UpsertSetting {
            key: "export.latestRuns".to_string(),
            category: Some("export".to_string()),
            value: SettingValue::Array(runs.clone()),
        },
    )
    .map_err(|error| error.to_string())?;

    if let Some(payload) = result.as_object_mut() {
        payload.insert("storedExportRuns".to_string(), json!(runs.len()));
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

#[derive(Clone, Debug, Deserialize)]
struct SidecarEmailResponse {
    #[serde(rename = "id")]
    email_id: String,
    #[serde(rename = "applicationId")]
    application_id: Option<String>,
    #[serde(rename = "jobId")]
    job_id: Option<String>,
    #[serde(rename = "companyName")]
    company_name: Option<String>,
    #[serde(rename = "contactId")]
    contact_id: Option<String>,
    subject: Option<String>,
    body: Option<String>,
    #[serde(rename = "receivedAt")]
    received_at: String,
    #[serde(rename = "responseType")]
    response_type: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct SidecarColdEmail {
    #[serde(rename = "applicationId")]
    application_id: Option<String>,
    #[serde(rename = "jobId")]
    job_id: Option<String>,
    #[serde(rename = "companyName")]
    company_name: String,
    #[serde(rename = "contactId")]
    contact_id: Option<String>,
    #[serde(rename = "contactName")]
    contact_name: Option<String>,
    #[serde(rename = "communicationId")]
    communication_id: Option<String>,
    #[serde(rename = "emailId")]
    email_id: Option<String>,
    subject: String,
    body: String,
    #[serde(rename = "sentAt")]
    sent_at: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
struct SidecarFollowUp {
    #[serde(rename = "applicationId")]
    application_id: String,
    #[serde(rename = "jobId")]
    job_id: String,
    #[serde(rename = "companyName")]
    company_name: String,
    #[serde(rename = "contactId")]
    contact_id: Option<String>,
    #[serde(rename = "contactName")]
    contact_name: Option<String>,
    #[serde(rename = "contactEmail")]
    contact_email: Option<String>,
    #[serde(rename = "communicationId")]
    communication_id: Option<String>,
    #[serde(rename = "emailId")]
    email_id: Option<String>,
    subject: String,
    body: String,
    #[serde(rename = "sentAt")]
    sent_at: String,
    status: String,
    #[serde(rename = "followUpCount")]
    follow_up_count: i64,
    #[serde(rename = "nextFollowUp")]
    next_follow_up: Option<String>,
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
