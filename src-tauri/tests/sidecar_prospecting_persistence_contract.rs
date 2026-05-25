use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{SettingValue, UpsertSetting, UpsertUserProfile},
        queries::{
            list_funded_companies, list_prospect_contacts, upsert_setting, upsert_user_profile,
        },
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;
use std::{fs, path::Path};

mod common;

#[test]
fn persists_prospecting_scan_companies_and_contacts_into_sqlite() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
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
                "description": "API infrastructure for fintech teams",
                "industry": "Fintech",
                "tech_stack": ["TypeScript", "Rust"],
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
            }],
            "contacts": [{
                "company_domain": "setu.co",
                "full_name": "Priya Sharma",
                "email": "Priya@Setu.CO",
                "email_confidence": 0.91,
                "email_status": "valid",
                "role": "hr_manager",
                "linkedin_url": "https://linkedin.example/in/priya",
                "source": "hunter",
                "opted_out": false
            }]
        }),
    );

    let result = run_sidecar_workflow_and_persist_jobs_with_command(
        &command,
        &connection,
        "prospecting-scan",
    )
    .expect("run prospecting scan workflow");

    assert_eq!(result["stored"], json!(1));
    assert_eq!(result["contactsStored"], json!(1));

    let companies = list_funded_companies(&connection).expect("list funded companies");
    assert_eq!(companies.len(), 1);
    assert_eq!(companies[0].name, "Setu");
    assert_eq!(companies[0].domain.as_deref(), Some("setu.co"));
    assert_eq!(companies[0].relevance_score, Some(91.0));

    let contacts =
        list_prospect_contacts(&connection, &companies[0].id).expect("list prospect contacts");
    assert_eq!(contacts.len(), 1);
    assert_eq!(contacts[0].full_name, "Priya Sharma");
    assert_eq!(contacts[0].email, "priya@setu.co");
    assert_eq!(contacts[0].role, "hr_manager");
}

#[test]
fn sends_prospecting_source_and_enrichment_settings_to_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_user_profile(
        &connection,
        UpsertUserProfile {
            full_name: "Asha Rao".to_string(),
            headline: "Frontend Engineer".to_string(),
            email: None,
            phone: None,
            location: Some("India".to_string()),
            portfolio_url: None,
            linkedin_url: None,
            github_url: None,
            summary: Some("Builds React apps".to_string()),
            skills: vec!["React".to_string(), "TypeScript".to_string()],
            target_roles: vec!["Frontend Engineer".to_string()],
            preferences: json!({}),
        },
    )
    .expect("save profile");
    upsert_setting(
        &connection,
        UpsertSetting {
            key: "prospecting.config".to_string(),
            category: Some("prospecting".to_string()),
            value: SettingValue::Object(json!({
                "minRelevanceScore": 72,
                "sources": {
                    "inc42": true,
                    "yourstory": false,
                    "techcrunch": true,
                    "crunchbaseApiKey": "cb-key"
                },
                "enrichment": {
                    "hunterApiKey": "hunter-key",
                    "includeWebsite": true,
                    "includeLinkedIn": true,
                    "maxContacts": 4
                }
            })),
        },
    )
    .expect("save prospecting config");
    let request_path = std::env::temp_dir().join(format!(
        "careercaveman-prospecting-request-{}.json",
        std::process::id()
    ));
    let command = capture_request_sidecar(&request_path);

    run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "prospecting-scan")
        .expect("run prospecting scan workflow");

    let request: serde_json::Value =
        serde_json::from_str(&fs::read_to_string(&request_path).expect("read captured request"))
            .expect("captured request is JSON");
    let _ = fs::remove_file(&request_path);
    assert_eq!(
        request["params"]["prospectingScan"]["profile"],
        json!({
            "targetRole": "Frontend Engineer",
            "skills": ["React", "TypeScript"],
            "summary": "Builds React apps"
        }),
    );
    assert_eq!(
        request["params"]["prospectingScan"]["minRelevanceScore"],
        json!(72.0)
    );
    assert_eq!(
        request["params"]["prospectingScan"]["sources"]["crunchbaseApiKey"],
        json!("cb-key")
    );
    assert_eq!(
        request["params"]["prospectingScan"]["enrichment"]["hunterApiKey"],
        json!("hunter-key")
    );
    assert_eq!(
        request["params"]["prospectingScan"]["enrichment"]["maxContacts"],
        json!(4)
    );
}

fn capture_request_sidecar(request_path: &Path) -> careercaveman_lib::sidecar::SidecarCommand {
    common::capture_request_sidecar_with_response(
        request_path,
        json!({
            "ok": true,
            "result": {
                "sources": 0,
                "discovered": 0,
                "deduped": 0,
                "qualified": 0,
                "stored": 0,
                "companies": []
            }
        }),
    )
}
