use job_hunt_lib::db::{
    models::UpsertCompany,
    queries::{list_companies, save_company},
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn stores_and_lists_company_crm_records() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let blocked = save_company(
        &connection,
        UpsertCompany {
            name: "Acme Outsourcing".to_string(),
            domain: Some("acme.example".to_string()),
            careers_url: Some("https://acme.example/careers".to_string()),
            industry: Some("Staffing".to_string()),
            size: Some("1001-5000".to_string()),
            linkedin_url: Some("https://linkedin.example/company/acme".to_string()),
            glassdoor_url: None,
            notes: Some("Rejects remote internships".to_string()),
            is_blacklisted: true,
            is_whitelisted: false,
        },
    )
    .expect("save blocked company");

    let preferred = save_company(
        &connection,
        UpsertCompany {
            name: "Northstar Labs".to_string(),
            domain: Some("northstar.example".to_string()),
            careers_url: Some("https://northstar.example/jobs".to_string()),
            industry: Some("Developer Tools".to_string()),
            size: Some("51-200".to_string()),
            linkedin_url: None,
            glassdoor_url: Some("https://glassdoor.example/northstar".to_string()),
            notes: Some("Strong frontend internship target".to_string()),
            is_blacklisted: false,
            is_whitelisted: true,
        },
    )
    .expect("save preferred company");

    let companies = list_companies(&connection).expect("list companies");

    assert_eq!(companies.len(), 2);
    assert_eq!(companies[0].id, preferred.id);
    assert_eq!(companies[0].name, "Northstar Labs");
    assert_eq!(companies[0].domain.as_deref(), Some("northstar.example"));
    assert_eq!(companies[0].industry.as_deref(), Some("Developer Tools"));
    assert!(companies[0].is_whitelisted);
    assert!(!companies[0].is_blacklisted);
    assert_eq!(
        companies[0].glassdoor_url.as_deref(),
        Some("https://glassdoor.example/northstar")
    );

    assert_eq!(companies[1].id, blocked.id);
    assert_eq!(companies[1].name, "Acme Outsourcing");
    assert_eq!(
        companies[1].careers_url.as_deref(),
        Some("https://acme.example/careers")
    );
    assert!(companies[1].is_blacklisted);
    assert!(!companies[1].is_whitelisted);
    assert_eq!(
        companies[1].notes.as_deref(),
        Some("Rejects remote internships")
    );
}
