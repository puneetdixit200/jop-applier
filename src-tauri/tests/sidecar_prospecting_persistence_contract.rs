use careercaveman_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        queries::{list_funded_companies, list_prospect_contacts},
        schema::initialize_schema,
    },
    sidecar::SidecarCommand,
};
use rusqlite::Connection;
use serde_json::json;
use std::path::PathBuf;

#[test]
fn persists_prospecting_scan_companies_and_contacts_into_sqlite() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let command = shell_sidecar(
        r#"read line
case "$line" in
  *'"method":"workflow.run"'*'"workflowId":"prospecting-scan"'*) printf '{"id":"workflow-prospecting-scan","ok":true,"result":{"sources":1,"discovered":1,"deduped":1,"qualified":1,"stored":0,"companies":[{"name":"Setu","domain":"setu.co","description":"API infrastructure for fintech teams","industry":"Fintech","tech_stack":["TypeScript","Rust"],"funding_stage":"series_a","funding_amount":30000000,"funding_currency":"USD","funding_date":"2026-05-23T02:30:00.000Z","investors":["Lightspeed"],"lead_investor":"Lightspeed","source":"inc42","source_url":"https://inc42.example/setu","region":"india","relevance_score":91,"ai_summary":"Strong API fit","status":"discovered"}],"contacts":[{"company_domain":"setu.co","full_name":"Priya Sharma","email":"Priya@Setu.CO","email_confidence":0.91,"email_status":"valid","role":"hr_manager","linkedin_url":"https://linkedin.example/in/priya","source":"hunter","opted_out":false}]}}\n' ;;
  *) printf '{"id":null,"ok":false,"error":{"message":"unexpected request"}}\n' ;;
esac"#,
    );

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "prospecting-scan")
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

fn shell_sidecar(script: &str) -> SidecarCommand {
    SidecarCommand {
        program: PathBuf::from("/bin/sh"),
        args: vec!["-c".to_string(), script.to_string()],
    }
}
