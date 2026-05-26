use cluelyy_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{SettingValue, UpsertSetting},
        queries::{list_jobs, upsert_setting},
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;
use std::{fs, path::Path};

mod common;

#[test]
fn persists_jobs_returned_by_sidecar_discovery_into_sqlite() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let command = common::workflow_sidecar(
        "job-discovery",
        json!({
            "queries": 1,
            "discovered": 1,
            "stored": 0,
            "jobs": [{
                "source_id": "linkedin-42",
                "platform": "linkedin",
                "url": "https://linkedin.example/jobs/42",
                "title": "Frontend Engineer Intern",
                "company_name": "Northstar Labs",
                "location": "Remote",
                "is_remote": true,
                "salary_min": 900000,
                "salary_max": 1400000,
                "salary_currency": "INR",
                "job_type": "internship",
                "experience_level": "intern",
                "description": "React and TypeScript internship",
                "requirements": ["React", "TypeScript"],
                "raw_html": "<main>job</main>",
                "match_score": 91,
                "match_confidence": 0.86,
                "match_reasoning": "Strong React and TypeScript match",
                "matched_skills": ["React", "TypeScript"],
                "missing_skills": ["GraphQL"],
                "ai_tags": ["good-fit"],
                "should_apply": true,
                "ai_priority": "high"
            }]
        }),
    );

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "job-discovery")
            .expect("run job discovery workflow");

    assert_eq!(result["queries"], json!(1));
    assert_eq!(result["discovered"], json!(1));
    assert_eq!(result["stored"], json!(1));

    let jobs = list_jobs(&connection).expect("list persisted jobs");
    assert_eq!(jobs.len(), 1);
    assert_eq!(jobs[0].source_id.as_deref(), Some("linkedin-42"));
    assert_eq!(jobs[0].title, "Frontend Engineer Intern");
    assert_eq!(jobs[0].company_name, "Northstar Labs");
    assert_eq!(jobs[0].match_score, Some(91));
    assert_eq!(jobs[0].ai_priority.as_deref(), Some("high"));
}

#[test]
fn sends_discovery_search_queries_from_settings_to_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "discovery.searchQueries".to_string(),
            category: Some("discovery".to_string()),
            value: SettingValue::Array(vec![json!({
                "keywords": ["react", "typescript"],
                "location": "Remote",
                "remote": true,
                "experienceLevel": "entry",
                "jobType": "fulltime"
            })]),
        },
    )
    .expect("save discovery search query setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "discovery.feedSources".to_string(),
            category: Some("discovery".to_string()),
            value: SettingValue::Array(vec![json!({
                "id": "custom-feed",
                "platform": "custom",
                "url": "https://feeds.example/jobs.json"
            })]),
        },
    )
    .expect("save discovery feed source setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "discovery.portalSources".to_string(),
            category: Some("discovery".to_string()),
            value: SettingValue::Array(vec![
                json!({ "platform": "linkedin" }),
                json!({ "platform": "indeed" }),
                json!({ "platform": "glassdoor" }),
            ]),
        },
    )
    .expect("save discovery portal source setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "discovery.atsSources".to_string(),
            category: Some("discovery".to_string()),
            value: SettingValue::Array(vec![
                json!({
                    "type": "greenhouse",
                    "boardToken": "northstar"
                }),
                json!({
                    "type": "lever",
                    "company": "atlas"
                }),
            ]),
        },
    )
    .expect("save discovery ATS source setting");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "discovery.careerPageSources".to_string(),
            category: Some("discovery".to_string()),
            value: SettingValue::Array(vec![json!({
                "id": "northstar-careers",
                "company": "Northstar Labs",
                "url": "https://northstar.example/careers"
            })]),
        },
    )
    .expect("save discovery career page source setting");
    let request_path = std::env::temp_dir().join(format!(
        "cluelyy-sidecar-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar(&request_path);

    run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "job-discovery")
        .expect("run configured job discovery workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["discovery"]["searchQueries"],
        json!([{
            "keywords": ["react", "typescript"],
            "location": "Remote",
            "remote": true,
            "experienceLevel": "entry",
            "jobType": "fulltime"
        }])
    );
    assert_eq!(
        request["params"]["discovery"]["portalSources"],
        json!([
            { "platform": "linkedin" },
            { "platform": "indeed" },
            { "platform": "glassdoor" }
        ])
    );
    assert_eq!(
        request["params"]["discovery"]["feedSources"],
        json!([{
            "id": "custom-feed",
            "platform": "custom",
            "url": "https://feeds.example/jobs.json"
        }])
    );
    assert_eq!(
        request["params"]["discovery"]["atsSources"],
        json!([
            {
                "type": "greenhouse",
                "boardToken": "northstar"
            },
            {
                "type": "lever",
                "company": "atlas"
            }
        ])
    );
    assert_eq!(
        request["params"]["discovery"]["careerPageSources"],
        json!([{
            "id": "northstar-careers",
            "company": "Northstar Labs",
            "url": "https://northstar.example/careers"
        }])
    );
}

fn capture_request_sidecar(request_path: &Path) -> cluelyy_lib::sidecar::SidecarCommand {
    common::capture_request_sidecar_with_response(
        request_path,
        json!({
            "ok": true,
            "result": {
                "queries": 1,
                "discovered": 0,
                "stored": 0,
                "jobs": []
            }
        }),
    )
}
