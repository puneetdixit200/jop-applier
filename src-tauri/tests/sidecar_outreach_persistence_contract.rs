use job_hunt_lib::{
    commands::sidecar::run_sidecar_workflow_and_persist_jobs_with_command,
    db::{
        models::{
            UpsertFundedCompany, UpsertOutreachCampaign, UpsertOutreachEmail, UpsertProspectContact,
        },
        queries::{
            list_outreach_emails, save_funded_company, save_outreach_campaign, save_outreach_email,
            save_prospect_contact,
        },
        schema::initialize_schema,
    },
};
use rusqlite::Connection;
use serde_json::json;

mod common;

#[test]
fn persists_outreach_send_updates_from_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (_company_id, _contact_id, _campaign_id, email_id) =
        seed_queued_outreach(&connection, "queued");
    let command = common::workflow_sidecar(
        "outreach-send",
        json!({
            "scanned": 1,
            "sent": 1,
            "skipped": 0,
            "failed": 0,
            "updates": [{
                "id": email_id,
                "status": "sent",
                "sentAt": "2026-05-27T05:00:00.000Z",
                "messageId": "smtp-outreach-1"
            }]
        }),
    );

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "outreach-send")
            .expect("run outreach send workflow");

    assert_eq!(result["storedOutreachUpdates"], json!(1));
    let sent = list_outreach_emails(&connection, Some("sent")).expect("list sent outreach");
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].id, email_id);
    assert_eq!(sent[0].sent_at.as_deref(), Some("2026-05-27T05:00:00.000Z"));
    assert_eq!(sent[0].message_id.as_deref(), Some("smtp-outreach-1"));
}

#[test]
fn persists_outreach_follow_up_drafts_from_sidecar() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (_company_id, contact_id, campaign_id, _email_id) =
        seed_queued_outreach(&connection, "sent");
    let command = common::workflow_sidecar(
        "outreach-follow-up",
        json!({
            "scanned": 1,
            "queued": 1,
            "skipped": 0,
            "drafts": [{
                "campaign_id": campaign_id,
                "contact_id": contact_id,
                "sequence_step": 2,
                "subject": "Re: Congrats on Series A",
                "body_html": "<p>Following up</p><p><a href='job-hunt://unsubscribe?token=abc'>unsubscribe</a></p>",
                "status": "pending",
                "scheduled_at": "2026-05-27T05:00:00.000Z",
                "sent_at": null,
                "message_id": null
            }]
        }),
    );

    let result = run_sidecar_workflow_and_persist_jobs_with_command(
        &command,
        &connection,
        "outreach-follow-up",
    )
    .expect("run outreach follow-up workflow");

    assert_eq!(result["storedOutreachFollowUps"], json!(1));
    let pending =
        list_outreach_emails(&connection, Some("pending")).expect("list pending outreach");
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].sequence_step, 2);
    assert_eq!(pending[0].subject, "Re: Congrats on Series A");
}

#[test]
fn persists_outreach_replies_from_email_check_and_cancels_follow_ups() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    let (_company_id, contact_id, campaign_id, email_id) =
        seed_queued_outreach(&connection, "sent");
    save_outreach_email(
        &connection,
        UpsertOutreachEmail {
            campaign_id: campaign_id.clone(),
            contact_id: contact_id.clone(),
            sequence_step: 2,
            subject: "Re: Congrats on Series A".to_string(),
            body_html: "<p>Following up</p>".to_string(),
            status: "queued".to_string(),
            scheduled_at: Some("2026-05-27T05:00:00.000Z".to_string()),
            sent_at: None,
            message_id: None,
        },
    )
    .expect("save queued follow-up");
    let command = common::workflow_sidecar(
        "email-check",
        json!({
            "scanned": 1,
            "matched": 1,
            "recorded": 1,
            "failed": 0,
            "skipped": 0,
            "outreachReplies": [{
                "emailId": email_id,
                "contactId": contact_id,
                "campaignId": campaign_id,
                "messageId": "imap-reply-1",
                "from": "Priya <priya@setu.co>",
                "subject": "Re: Congrats on Series A",
                "receivedAt": "2026-05-29T10:00:00.000Z"
            }]
        }),
    );

    let result =
        run_sidecar_workflow_and_persist_jobs_with_command(&command, &connection, "email-check")
            .expect("run email check workflow");

    assert_eq!(result["storedOutreachReplies"], json!(1));
    let replied =
        list_outreach_emails(&connection, Some("replied")).expect("list replied outreach");
    assert_eq!(replied.len(), 1);
    assert_eq!(replied[0].id, email_id);
    let cancelled =
        list_outreach_emails(&connection, Some("cancelled")).expect("list cancelled outreach");
    assert_eq!(cancelled.len(), 1);
    assert_eq!(cancelled[0].sequence_step, 2);
}

fn seed_queued_outreach(connection: &Connection, status: &str) -> (String, String, String, String) {
    let company = save_funded_company(
        connection,
        UpsertFundedCompany {
            name: "Setu".to_string(),
            domain: Some("setu.co".to_string()),
            description: Some("API infrastructure".to_string()),
            industry: Some("Fintech".to_string()),
            tech_stack: vec!["TypeScript".to_string()],
            funding_stage: Some("series_a".to_string()),
            funding_amount: Some(30_000_000.0),
            funding_currency: "USD".to_string(),
            funding_date: Some("2026-05-23T02:30:00.000Z".to_string()),
            investors: vec!["Lightspeed".to_string()],
            lead_investor: Some("Lightspeed".to_string()),
            source: "inc42".to_string(),
            source_url: Some("https://inc42.example/setu".to_string()),
            region: "india".to_string(),
            relevance_score: Some(91.0),
            ai_summary: Some("Strong API fit".to_string()),
            status: "enriched".to_string(),
        },
    )
    .expect("save funded company");
    let contact = save_prospect_contact(
        connection,
        UpsertProspectContact {
            company_id: company.id.clone(),
            full_name: "Priya Sharma".to_string(),
            email: "priya@setu.co".to_string(),
            email_confidence: 0.91,
            email_status: "valid".to_string(),
            role: "hr_manager".to_string(),
            linkedin_url: None,
            source: "hunter".to_string(),
            opted_out: false,
        },
    )
    .expect("save prospect contact");
    let campaign = save_outreach_campaign(
        connection,
        UpsertOutreachCampaign {
            company_id: company.id.clone(),
            campaign_type: "hr_outreach".to_string(),
            status: "active".to_string(),
            sequence_json: r#"[{"step":1},{"step":2},{"step":3}]"#.to_string(),
            auto_approve: false,
            max_emails_per_day: 30,
        },
    )
    .expect("save campaign");
    let email = save_outreach_email(
        connection,
        UpsertOutreachEmail {
            campaign_id: campaign.id.clone(),
            contact_id: contact.id.clone(),
            sequence_step: 1,
            subject: "Congrats on Series A".to_string(),
            body_html: "<p>Hello</p><p><a href=\"job-hunt://unsubscribe?token=abc\">unsubscribe</a></p>".to_string(),
            status: status.to_string(),
            scheduled_at: Some("2026-05-23T04:30:00.000Z".to_string()),
            sent_at: if status == "sent" {
                Some("2026-05-23T05:00:00.000Z".to_string())
            } else {
                None
            },
            message_id: if status == "sent" {
                Some("smtp-outreach-1".to_string())
            } else {
                None
            },
        },
    )
    .expect("save outreach email");

    (company.id, contact.id, campaign.id, email.id)
}
