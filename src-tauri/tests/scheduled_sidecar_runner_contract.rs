use careercaveman_lib::{
    commands::sidecar::run_due_scheduled_tasks_with_command,
    db::{
        models::UpsertScheduledTask,
        queries::{list_jobs, list_scheduled_tasks, save_scheduled_task},
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;

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
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"workflow.run"'*'"workflowId":"job-discovery"'*) printf '{"id":"workflow-job-discovery","ok":true,"result":{"queries":1,"discovered":1,"stored":0,"jobs":[{"source_id":"scheduled-1","platform":"custom","url":"https://jobs.example/scheduled","title":"Scheduled Discovery Engineer","company_name":"Schedule Labs","location":"Remote","is_remote":true,"salary_min":null,"salary_max":null,"salary_currency":"INR","job_type":null,"experience_level":null,"description":null,"requirements":[],"raw_html":null,"match_score":77,"match_confidence":0.8,"match_reasoning":"scheduled match","matched_skills":[],"missing_skills":[],"ai_tags":["scheduled"],"should_apply":true,"ai_priority":"medium"}]}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let result =
        run_due_scheduled_tasks_with_command(&command, &connection, "2026-05-29T08:00:00Z")
            .expect("run due scheduled tasks");

    assert_eq!(result.scanned, 2);
    assert_eq!(result.due, 1);
    assert_eq!(result.completed, 1);
    assert_eq!(result.failed, 0);
    assert_eq!(result.skipped, 1);

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

fn shell_sidecar(script: &str) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), script.to_string()],
    }
}
