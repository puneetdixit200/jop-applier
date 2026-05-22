use careercaveman_lib::db::{
    models::{
        UpsertEmailOptOut, UpsertFundedCompany, UpsertOutreachCampaign, UpsertOutreachEmail,
        UpsertProspectContact,
    },
    queries::{
        list_funded_companies, list_outreach_emails, list_prospect_contacts, record_email_opt_out,
        save_funded_company, save_outreach_campaign, save_outreach_email, save_prospect_contact,
    },
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn stores_prospecting_companies_contacts_campaigns_and_opt_outs() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let company = save_funded_company(
        &connection,
        UpsertFundedCompany {
            name: "Setu".to_string(),
            domain: Some("setu.co".to_string()),
            description: Some("Banking API infrastructure".to_string()),
            industry: Some("Fintech".to_string()),
            tech_stack: vec!["React".to_string(), "AWS".to_string()],
            funding_stage: Some("series_a".to_string()),
            funding_amount: Some(30_000_000.0),
            funding_currency: "USD".to_string(),
            funding_date: Some("2026-05-01T00:00:00.000Z".to_string()),
            investors: vec!["Bharat Inclusion Fund".to_string()],
            lead_investor: Some("Bharat Inclusion Fund".to_string()),
            source: "inc42".to_string(),
            source_url: Some("https://inc42.example/setu".to_string()),
            region: "india".to_string(),
            relevance_score: Some(91.0),
            ai_summary: Some("Strong API fit".to_string()),
            status: "discovered".to_string(),
        },
    )
    .expect("save funded company");

    let contact = save_prospect_contact(
        &connection,
        UpsertProspectContact {
            company_id: company.id.clone(),
            full_name: "Priya Sharma".to_string(),
            email: "PRIYA@SETU.CO".to_string(),
            email_confidence: 0.91,
            email_status: "valid".to_string(),
            role: "hr_manager".to_string(),
            linkedin_url: Some("https://linkedin.example/in/priya".to_string()),
            source: "hunter".to_string(),
            opted_out: false,
        },
    )
    .expect("save prospect contact");

    let campaign = save_outreach_campaign(
        &connection,
        UpsertOutreachCampaign {
            company_id: company.id.clone(),
            campaign_type: "hr_outreach".to_string(),
            status: "draft".to_string(),
            sequence_json: r#"[{"step":1},{"step":2},{"step":3}]"#.to_string(),
            auto_approve: false,
            max_emails_per_day: 30,
        },
    )
    .expect("save campaign");

    let email = save_outreach_email(
        &connection,
        UpsertOutreachEmail {
            campaign_id: campaign.id.clone(),
            contact_id: contact.id.clone(),
            sequence_step: 1,
            subject: "Congrats on the Series A".to_string(),
            body_html: "<p>Hello</p><a href=\"/unsubscribe\">unsubscribe</a>".to_string(),
            status: "pending".to_string(),
            scheduled_at: Some("2026-05-23T04:30:00.000Z".to_string()),
            sent_at: None,
            message_id: None,
        },
    )
    .expect("save outreach email");

    record_email_opt_out(
        &connection,
        UpsertEmailOptOut {
            email: "priya@setu.co".to_string(),
            opted_out_at: "2026-05-24T04:30:00.000Z".to_string(),
            reason: "unsubscribe_link".to_string(),
        },
    )
    .expect("record opt out");

    let companies = list_funded_companies(&connection).expect("list funded companies");
    let contacts = list_prospect_contacts(&connection, &company.id).expect("list prospect contacts");
    let emails = list_outreach_emails(&connection, Some("pending")).expect("list emails");

    assert_eq!(companies.len(), 1);
    assert_eq!(companies[0].id, company.id);
    assert_eq!(companies[0].tech_stack, vec!["React", "AWS"]);
    assert_eq!(companies[0].investors, vec!["Bharat Inclusion Fund"]);
    assert_eq!(contacts.len(), 1);
    assert_eq!(contacts[0].id, contact.id);
    assert_eq!(contacts[0].email, "priya@setu.co");
    assert!(contacts[0].opted_out);
    assert_eq!(emails.len(), 0, "pending emails are cancelled when a contact opts out");

    let cancelled = list_outreach_emails(&connection, Some("cancelled")).expect("list cancelled emails");
    assert_eq!(cancelled[0].id, email.id);
    assert_eq!(cancelled[0].message_id, None);
}
