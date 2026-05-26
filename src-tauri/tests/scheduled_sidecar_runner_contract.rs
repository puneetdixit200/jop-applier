use cluelyy_lib::{
    commands::sidecar::run_due_scheduled_tasks_with_command,
    db::{
        models::UpsertScheduledTask,
        queries::{list_funded_companies, list_jobs, list_scheduled_tasks, save_scheduled_task},
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;

mod common;

#[test]
fn runs_due_scheduled_tasks_through_sidecar_and_updates_task_state() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let due_task = save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Job Discovery".to_string(),
            task_type: "discovery".to_string(),
            cron_expression: Some("0 8-20/4 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-29T08:00:00Z".to_string()),
            config: json!({
                "cadence": {
                    "kind": "windowed_interval",
                    "everyHours": 4,
                    "startHour": 8,
                    "endHour": 20,
                    "minute": 0
                }
            }),
        },
    )
    .expect("save due scheduled task");
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Future Follow-up".to_string(),
            task_type: "follow_up".to_string(),
            cron_expression: Some("0 9 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-30T09:00:00Z".to_string()),
            config: json!({
                "cadence": { "kind": "daily", "hour": 9, "minute": 0 }
            }),
        },
    )
    .expect("save future scheduled task");
    let command = common::workflow_sidecar(
        "job-discovery",
        json!({
            "queries": 1,
            "discovered": 1,
            "stored": 0,
            "jobs": [{
                "source_id": "scheduled-1",
                "platform": "custom",
                "url": "https://jobs.example/scheduled",
                "title": "Scheduled Discovery Engineer",
                "company_name": "Schedule Labs",
                "location": "Remote",
                "is_remote": true,
                "salary_min": null,
                "salary_max": null,
                "salary_currency": "INR",
                "job_type": null,
                "experience_level": null,
                "description": null,
                "requirements": [],
                "raw_html": null,
                "match_score": 77,
                "match_confidence": 0.8,
                "match_reasoning": "scheduled match",
                "matched_skills": [],
                "missing_skills": [],
                "ai_tags": ["scheduled"],
                "should_apply": true,
                "ai_priority": "medium"
            }],
            "notifications": [
                {
                    "type": "job.high_match_found",
                    "title": "High-match job found",
                    "body": "Schedule Labs has a 77% match.",
                    "priority": "high",
                    "channel": "os",
                    "createdAt": "2026-05-29T08:00:00.000Z"
                },
                {
                    "type": "job.high_match_found",
                    "title": "High-match job found",
                    "body": "Schedule Labs has a 77% match.",
                    "priority": "high",
                    "channel": "in_app",
                    "createdAt": "2026-05-29T08:00:00.000Z"
                }
            ]
        }),
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-29T08:00:00Z")
            .expect("run due scheduled tasks");

    assert_eq!(result.scanned, 2);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);
    assert_eq!(result.skipped, 1);
    assert_eq!(result.notifications.len(), 2);
    assert_eq!(result.notifications[0]["channel"], json!("os"));
    assert_eq!(result.notifications[1]["channel"], json!("in_app"));

    let updated_tasks = list_scheduled_tasks(&connection).expect("list scheduled tasks");
    let updated_due_task = updated_tasks
        .iter()
        .find(|task| task.id == due_task.id)
        .expect("updated due task exists");
    assert_eq!(
        updated_due_task.last_run.as_deref(),
        Some("2026-05-29T08:00:00Z")
    );
    assert_eq!(
        updated_due_task.next_run.as_deref(),
        Some("2026-05-29T12:00:00Z")
    );

    let jobs = list_jobs(&connection).expect("list persisted jobs");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].source_id.as_deref(), Some("scheduled-1"));
    assert_eq!(jobs[0].title, "Scheduled Discovery Engineer");
}

#[test]
fn runs_due_prospecting_scan_schedule_through_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    save_scheduled_task(
        &connection,
        UpsertScheduledTask {
            name: "Funded Company Prospecting".to_string(),
            task_type: "prospecting_scan".to_string(),
            cron_expression: Some("0 8 * * *".to_string()),
            is_enabled: true,
            last_run: None,
            next_run: Some("2026-05-29T08:00:00Z".to_string()),
            config: json!({
                "cadence": { "kind": "daily", "hour": 8, "minute": 0 }
            }),
        },
    )
    .expect("save prospecting scheduled task");
    let command = common::workflow_sidecar(
        "prospecting-scan",
        json!({
            "sources": 1,
            "discovered": 1,
            "deduped": 1,
            "qualified": 1,
            "stored": 0,
            "companies": [{
                "name": "Setu",
                "domain": "setu.co",
                "description": "API infrastructure",
                "industry": "Fintech",
                "tech_stack": ["TypeScript"],
                "funding_stage": "series_a",
                "funding_amount": 30000000,
                "funding_currency": "USD",
                "funding_date": "2026-05-23T02:30:00.000Z",
                "investors": ["Lightspeed"],
                "lead_investor": "Lightspeed",
                "source": "inc42",
                "source_url": "https://inc42.example/setu",
                "region": "india",
                "relevance_score": 91,
                "ai_summary": "Strong API fit",
                "status": "discovered"
            }]
        }),
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-29T08:00:00Z")
            .expect("run due scheduled tasks");

    assert_eq!(result.scanned, 1);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);

    let companies = list_funded_companies(&connection).expect("list funded companies");
    assert_eq!(companies.len(), 1);
    assert_eq!(companies[0].domain.as_deref(), Some("setu.co"));
}
