use job_hunt_lib::db::{
    models::UpsertContact,
    queries::{list_contacts, save_contact},
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn stores_and_lists_recruiting_contacts() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let recruiter = save_contact(
        &connection,
        UpsertContact {
            company_id: None,
            name: "Priya Sharma".to_string(),
            email: Some("priya@example.com".to_string()),
            phone: None,
            linkedin_url: Some("https://linkedin.example/in/priya".to_string()),
            role: Some("recruiter".to_string()),
            notes: Some("Handles frontend internship hiring".to_string()),
        },
    )
    .expect("save recruiter");

    let hiring_manager = save_contact(
        &connection,
        UpsertContact {
            company_id: None,
            name: "Arjun Mehta".to_string(),
            email: Some("arjun@example.com".to_string()),
            phone: Some("+91-555-0101".to_string()),
            linkedin_url: None,
            role: Some("hiring_manager".to_string()),
            notes: None,
        },
    )
    .expect("save hiring manager");

    let contacts = list_contacts(&connection).expect("list contacts");

    assert_eq!(contacts.len(), 2);
    assert_eq!(contacts[0].id, hiring_manager.id);
    assert_eq!(contacts[0].name, "Arjun Mehta");
    assert_eq!(contacts[0].phone.as_deref(), Some("+91-555-0101"));
    assert_eq!(contacts[0].role.as_deref(), Some("hiring_manager"));
    assert_eq!(contacts[1].id, recruiter.id);
    assert_eq!(contacts[1].email.as_deref(), Some("priya@example.com"));
    assert_eq!(
        contacts[1].linkedin_url.as_deref(),
        Some("https://linkedin.example/in/priya")
    );
    assert_eq!(
        contacts[1].notes.as_deref(),
        Some("Handles frontend internship hiring")
    );
}
