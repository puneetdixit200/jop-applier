use job_hunt_lib::db::{
    models::UpsertJob,
    queries::{list_jobs, upsert_job},
    schema::initialize_schema,
};
use rusqlite::Connection;

#[test]
fn stores_updates_and_lists_discovered_jobs() {
    let connection = Connection::open_in_memory().expect("open in-memory database");
    initialize_schema(&connection).expect("initialize schema");

    let saved = upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("linkedin-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/1".to_string(),
            title: "Frontend Engineer Intern".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: Some(900_000),
            salary_max: Some(1_400_000),
            salary_currency: "INR".to_string(),
            job_type: Some("internship".to_string()),
            experience_level: Some("intern".to_string()),
            description: Some("React and TypeScript internship".to_string()),
            requirements: vec!["React".to_string(), "TypeScript".to_string()],
            raw_html: Some("<main>React job</main>".to_string()),
            match_score: Some(88),
            match_confidence: Some(0.81),
            match_reasoning: Some("Strong React match".to_string()),
            matched_skills: vec!["React".to_string()],
            missing_skills: vec!["GraphQL".to_string()],
            ai_tags: vec!["good-fit".to_string()],
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("save job");

    let updated = upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("linkedin-1".to_string()),
            platform: "linkedin".to_string(),
            url: "https://linkedin.example/jobs/1-updated".to_string(),
            title: "Frontend Platform Intern".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Remote".to_string()),
            is_remote: true,
            salary_min: Some(950_000),
            salary_max: Some(1_500_000),
            salary_currency: "INR".to_string(),
            job_type: Some("internship".to_string()),
            experience_level: Some("intern".to_string()),
            description: Some("Updated React internship".to_string()),
            requirements: vec!["React".to_string(), "Rust".to_string()],
            raw_html: Some("<main>Updated job</main>".to_string()),
            match_score: Some(94),
            match_confidence: Some(0.93),
            match_reasoning: Some("React plus Rust desktop fit".to_string()),
            matched_skills: vec!["React".to_string(), "Rust".to_string()],
            missing_skills: Vec::new(),
            ai_tags: vec!["good-fit".to_string(), "desktop".to_string()],
            should_apply: Some(true),
            ai_priority: Some("high".to_string()),
        },
    )
    .expect("update job");

    upsert_job(
        &connection,
        UpsertJob {
            source_id: Some("indeed-2".to_string()),
            platform: "indeed".to_string(),
            url: "https://indeed.example/jobs/2".to_string(),
            title: "Backend Engineer".to_string(),
            company_name: "Northstar Labs".to_string(),
            location: Some("Bengaluru".to_string()),
            is_remote: false,
            salary_min: None,
            salary_max: None,
            salary_currency: "INR".to_string(),
            job_type: Some("fulltime".to_string()),
            experience_level: Some("entry".to_string()),
            description: Some("Node services".to_string()),
            requirements: vec!["Node.js".to_string()],
            raw_html: None,
            match_score: Some(72),
            match_confidence: Some(0.58),
            match_reasoning: Some("Some backend overlap".to_string()),
            matched_skills: vec!["Node.js".to_string()],
            missing_skills: vec!["Kubernetes".to_string()],
            ai_tags: vec!["stretch".to_string()],
            should_apply: Some(false),
            ai_priority: Some("medium".to_string()),
        },
    )
    .expect("save second job");

    let jobs = list_jobs(&connection).expect("list jobs");

    assert_eq!(saved.id, updated.id);
    assert_eq!(jobs.len(), 2);
    assert_eq!(jobs[0].title, "Frontend Platform Intern");
    assert_eq!(jobs[0].url, "https://linkedin.example/jobs/1-updated");
    assert_eq!(jobs[0].requirements, vec!["React", "Rust"]);
    assert_eq!(jobs[0].ai_tags, vec!["good-fit", "desktop"]);
    assert_eq!(jobs[0].match_score, Some(94));
    assert_eq!(jobs[0].match_confidence, Some(0.93));
    assert_eq!(jobs[0].should_apply, Some(true));
    assert_eq!(jobs[1].title, "Backend Engineer");
    assert_eq!(jobs[1].match_confidence, Some(0.58));
    assert_eq!(jobs[1].should_apply, Some(false));
}
