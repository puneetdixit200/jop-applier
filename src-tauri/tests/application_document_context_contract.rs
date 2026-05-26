use job_hunt_lib::db::{
    models::{UpsertApplication, UpsertDocument, UpsertJob, UpsertUserProfile},
    queries::{
        get_application_document_context, save_document, upsert_application, upsert_job,
        upsert_user_profile,
    },
    schema::initialize_schema,
};
use rusqlite::Connection;
use serde_json::json;

#[test]
fn builds_document_generation_context_from_profile_application_job_and_document_history() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");
    upsert_user_profile(
        &connection,
        UpsertUserProfile {
            full_name: "Asha Rao".to_string(),
            headline: "React and Tauri engineer".to_string(),
            email: Some("asha@example.com".to_string()),
            phone: Some("+91-555-0100".to_string()),
            location: Some("Bengaluru".to_string()),
            portfolio_url: Some("https://asha.example".to_string()),
            linkedin_url: Some("https://linkedin.example/in/asha".to_string()),
            github_url: Some("https://github.example/asha".to_string()),
            summary: Some("Frontend engineer focused on local-first automation.".to_string()),
            skills: vec!["React".to_string(), "TypeScript".to_string(), "Rust".to_string()],
            target_roles: vec!["Desktop Automation Engineer".to_string()],
            preferences: json!({
                "commonAnswers": {
                    "work_authorization": "Authorized to work in India"
                }
            }),
        },
    )
    .expect("save profile");
    let job = upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("linkedin-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/1".to_string(),
            title: "Desktop Automation Engineer".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: Some(900_000),
            salary_max: Some(1_400_000),
            salary_currency: "INR".to_string(),
            job_type: Some("fulltime".to_string()),
            experience_level: Some("entry".to_string()),
            description: Some("Build Tauri and Rust workflow automation.".to_string()),
            requirements: vec!["React".to_string(), "Rust".to_string(), "Tauri".to_string()],
            raw_html: Some("<main>Desktop automation role</main>".to_string()),
            match_score: Some(94),
            match_confidence: Some(0.93),
            match_reasoning: Some("Strong automation fit".to_string()),
            matched_skills: vec!["React".to_string(), "Rust".to_string()],
            missing_skills: vec!["Playwright".to_string()],
            ai_tags: vec!["good-fit".to_string()],
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("save job");
    let application = upsert_application(
        &connection,
        UpsertApplication {
            job_id: job.id.clone(),
            status: "queued".to_string(),
            mode: "semi-auto".to_string(),
            resume_path: None,
            cover_letter_path: None,
            last_follow_up: None,
            follow_up_count: 0,
            next_follow_up: None,
            response_date: None,
            response_type: None,
            response_notes: None,
            submission_url: None,
            confirmation_id: None,
            error_message: None,
            notes: Some("Generate fresh documents".to_string()),
            tags: vec!["priority".to_string()],
        },
    )
    .expect("save application");
    save_document(
        &connection,
        UpsertDocument {
            application_id: Some(application.id.clone()),
            document_type: "resume".to_string(),
            file_path: "/tmp/resume-v1.pdf".to_string(),
            file_name: "resume-v1.pdf".to_string(),
            version: 1,
            ai_model_used: Some("ollama:mistral".to_string()),
        },
    )
    .expect("save resume");
    save_document(
        &connection,
        UpsertDocument {
            application_id: Some(application.id.clone()),
            document_type: "cover_letter".to_string(),
            file_path: "/tmp/cover-letter-v2.pdf".to_string(),
            file_name: "cover-letter-v2.pdf".to_string(),
            version: 2,
            ai_model_used: Some("ollama:mistral".to_string()),
        },
    )
    .expect("save cover letter");

    let context = get_application_document_context(&connection, &application.id)
        .expect("load document context")
        .expect("context exists");

    assert_eq!(context.application_id, application.id);
    assert_eq!(context.job_id, job.id);
    assert_eq!(context.company_name, "Northstar Labs");
    assert_eq!(context.resume_version, 3);
    assert_eq!(context.profile.full_name, "Asha Rao");
    assert_eq!(
        context.profile.preferences["commonAnswers"]["work_authorization"],
        json!("Authorized to work in India")
    );
    assert_eq!(context.job.title, "Desktop Automation Engineer");
    assert_eq!(context.job.requirements, vec!["React", "Rust", "Tauri"]);
    assert_eq!(
        context.job.description.as_deref(),
        Some("Build Tauri and Rust workflow automation.")
    );
}

#[test]
fn returns_no_document_context_for_missing_application() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let context = get_application_document_context(&connection, "missing-app")
        .expect("load missing document context");

    assert_eq!(context, None);
}
