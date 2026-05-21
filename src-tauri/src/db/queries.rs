use rusqlite::{params, Connection};
use serde::de::DeserializeOwned;
use serde::Serialize;
use thiserror::Error;

use super::models::{
    Job, Setting, SettingValue, UpsertJob, UpsertSetting, UpsertUserProfile, UserProfile,
};

#[derive(Debug, Error)]
pub enum QueryError {
    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error("profile save did not return a row")]
    MissingProfileAfterSave,
    #[error("setting save did not return a row for key {0}")]
    MissingSettingAfterSave(String),
    #[error("job save did not return a row")]
    MissingJobAfterSave,
}

pub type QueryResult<T> = Result<T, QueryError>;

pub fn get_user_profile(connection: &Connection) -> QueryResult<Option<UserProfile>> {
    let mut statement = connection.prepare(
        "SELECT id, full_name, headline, email, phone, location, portfolio_url, linkedin_url,
                github_url, summary, skills, target_roles, preferences
         FROM user_profiles
         ORDER BY created_at ASC
         LIMIT 1",
    )?;

    let mut rows = statement.query([])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(UserProfile {
        id: row.get(0)?,
        full_name: row.get(1)?,
        headline: row.get(2)?,
        email: row.get(3)?,
        phone: row.get(4)?,
        location: row.get(5)?,
        portfolio_url: row.get(6)?,
        linkedin_url: row.get(7)?,
        github_url: row.get(8)?,
        summary: row.get(9)?,
        skills: from_json_text(row.get::<_, String>(10)?)?,
        target_roles: from_json_text(row.get::<_, String>(11)?)?,
        preferences: from_json_text(row.get::<_, String>(12)?)?,
    }))
}

pub fn upsert_user_profile(
    connection: &Connection,
    profile: UpsertUserProfile,
) -> QueryResult<UserProfile> {
    let skills = to_json_text(&profile.skills)?;
    let target_roles = to_json_text(&profile.target_roles)?;
    let preferences = to_json_text(&profile.preferences)?;

    if let Some(existing) = get_user_profile(connection)? {
        connection.execute(
            "UPDATE user_profiles
             SET full_name = ?1,
                 headline = ?2,
                 email = ?3,
                 phone = ?4,
                 location = ?5,
                 portfolio_url = ?6,
                 linkedin_url = ?7,
                 github_url = ?8,
                 summary = ?9,
                 skills = ?10,
                 target_roles = ?11,
                 preferences = ?12,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?13",
            params![
                profile.full_name,
                profile.headline,
                profile.email,
                profile.phone,
                profile.location,
                profile.portfolio_url,
                profile.linkedin_url,
                profile.github_url,
                profile.summary,
                skills,
                target_roles,
                preferences,
                existing.id,
            ],
        )?;
    } else {
        connection.execute(
            "INSERT INTO user_profiles (
                 full_name, headline, email, phone, location, portfolio_url, linkedin_url,
                 github_url, summary, skills, target_roles, preferences
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                profile.full_name,
                profile.headline,
                profile.email,
                profile.phone,
                profile.location,
                profile.portfolio_url,
                profile.linkedin_url,
                profile.github_url,
                profile.summary,
                skills,
                target_roles,
                preferences,
            ],
        )?;
    }

    get_user_profile(connection)?.ok_or(QueryError::MissingProfileAfterSave)
}

pub fn get_setting(connection: &Connection, key: &str) -> QueryResult<Option<Setting>> {
    let mut statement =
        connection.prepare("SELECT key, value, category FROM settings WHERE key = ?1 LIMIT 1")?;
    let mut rows = statement.query([key])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };

    Ok(Some(Setting {
        key: row.get(0)?,
        value: from_json_text(row.get::<_, String>(1)?)?,
        category: row.get(2)?,
    }))
}

pub fn upsert_setting(connection: &Connection, setting: UpsertSetting) -> QueryResult<Setting> {
    let value = to_json_text(&setting.value)?;
    connection.execute(
        "INSERT INTO settings (key, value, category, updated_at)
         VALUES (?1, ?2, ?3, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET
             value = excluded.value,
             category = excluded.category,
             updated_at = CURRENT_TIMESTAMP",
        params![setting.key, value, setting.category],
    )?;

    get_setting(connection, &setting.key)?.ok_or(QueryError::MissingSettingAfterSave(setting.key))
}

pub fn list_jobs(connection: &Connection) -> QueryResult<Vec<Job>> {
    let mut statement = connection.prepare(
        "SELECT id, source_id, platform, url, title, company_name, location, is_remote,
                salary_min, salary_max, salary_currency, job_type, experience_level,
                description, requirements, raw_html, match_score, match_confidence,
                match_reasoning, matched_skills, missing_skills, ai_tags, should_apply,
                ai_priority
         FROM jobs
         WHERE is_archived = FALSE
         ORDER BY COALESCE(match_score, -1) DESC, discovered_at DESC",
    )?;

    let rows = statement.query_map([], job_from_row)?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(QueryError::from)
}

pub fn upsert_job(connection: &Connection, job: UpsertJob) -> QueryResult<Job> {
    let requirements = to_json_text(&job.requirements)?;
    let matched_skills = to_json_text(&job.matched_skills)?;
    let missing_skills = to_json_text(&job.missing_skills)?;
    let ai_tags = to_json_text(&job.ai_tags)?;

    if let Some(existing) = find_existing_job(connection, &job)? {
        connection.execute(
            "UPDATE jobs
             SET source_id = ?1,
                 platform = ?2,
                 url = ?3,
                 title = ?4,
                 company_name = ?5,
                 location = ?6,
                 is_remote = ?7,
                 salary_min = ?8,
                 salary_max = ?9,
                 salary_currency = ?10,
                 job_type = ?11,
                 experience_level = ?12,
                 description = ?13,
                 requirements = ?14,
                 raw_html = ?15,
                 match_score = ?16,
                 match_confidence = ?17,
                 match_reasoning = ?18,
                 matched_skills = ?19,
                 missing_skills = ?20,
                 ai_tags = ?21,
                 should_apply = ?22,
                 ai_priority = ?23,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?24",
            params![
                job.source_id,
                job.platform,
                job.url,
                job.title,
                job.company_name,
                job.location,
                job.is_remote,
                job.salary_min,
                job.salary_max,
                job.salary_currency,
                job.job_type,
                job.experience_level,
                job.description,
                requirements,
                job.raw_html,
                job.match_score,
                job.match_confidence,
                job.match_reasoning,
                matched_skills,
                missing_skills,
                ai_tags,
                job.should_apply,
                job.ai_priority,
                existing.id,
            ],
        )?;
        return get_job_by_id(connection, &existing.id)?.ok_or(QueryError::MissingJobAfterSave);
    }

    connection.execute(
        "INSERT INTO jobs (
             source_id, platform, url, title, company_name, location, is_remote,
             salary_min, salary_max, salary_currency, job_type, experience_level,
             description, requirements, raw_html, match_score, match_confidence,
             match_reasoning, matched_skills, missing_skills, ai_tags, should_apply,
             ai_priority
         )
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21, ?22, ?23)",
        params![
            job.source_id,
            job.platform,
            job.url,
            job.title,
            job.company_name,
            job.location,
            job.is_remote,
            job.salary_min,
            job.salary_max,
            job.salary_currency,
            job.job_type,
            job.experience_level,
            job.description,
            requirements,
            job.raw_html,
            job.match_score,
            job.match_confidence,
            job.match_reasoning,
            matched_skills,
            missing_skills,
            ai_tags,
            job.should_apply,
            job.ai_priority,
        ],
    )?;

    get_job_by_rowid(connection, connection.last_insert_rowid())?
        .ok_or(QueryError::MissingJobAfterSave)
}

fn find_existing_job(connection: &Connection, job: &UpsertJob) -> QueryResult<Option<Job>> {
    if let Some(source_id) = job
        .source_id
        .as_ref()
        .filter(|value| !value.trim().is_empty())
    {
        let mut statement = connection.prepare(
            "SELECT id, source_id, platform, url, title, company_name, location, is_remote,
                    salary_min, salary_max, salary_currency, job_type, experience_level,
                    description, requirements, raw_html, match_score, match_confidence,
                    match_reasoning, matched_skills, missing_skills, ai_tags, should_apply,
                    ai_priority
             FROM jobs
             WHERE platform = ?1 AND source_id = ?2
             LIMIT 1",
        )?;
        let mut rows = statement.query(params![&job.platform, source_id])?;
        let Some(row) = rows.next()? else {
            return Ok(None);
        };
        return job_from_row(row).map(Some).map_err(QueryError::from);
    }

    Ok(None)
}

fn get_job_by_id(connection: &Connection, id: &str) -> QueryResult<Option<Job>> {
    let mut statement = connection.prepare(
        "SELECT id, source_id, platform, url, title, company_name, location, is_remote,
                salary_min, salary_max, salary_currency, job_type, experience_level,
                description, requirements, raw_html, match_score, match_confidence,
                match_reasoning, matched_skills, missing_skills, ai_tags, should_apply,
                ai_priority
         FROM jobs
         WHERE id = ?1
         LIMIT 1",
    )?;
    let mut rows = statement.query([id])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    job_from_row(row).map(Some).map_err(QueryError::from)
}

fn get_job_by_rowid(connection: &Connection, rowid: i64) -> QueryResult<Option<Job>> {
    let mut statement = connection.prepare(
        "SELECT id, source_id, platform, url, title, company_name, location, is_remote,
                salary_min, salary_max, salary_currency, job_type, experience_level,
                description, requirements, raw_html, match_score, match_confidence,
                match_reasoning, matched_skills, missing_skills, ai_tags, should_apply,
                ai_priority
         FROM jobs
         WHERE rowid = ?1
         LIMIT 1",
    )?;
    let mut rows = statement.query([rowid])?;
    let Some(row) = rows.next()? else {
        return Ok(None);
    };
    job_from_row(row).map(Some).map_err(QueryError::from)
}

fn job_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<Job> {
    let requirements = json_cell(row, 14)?;
    let matched_skills = json_cell(row, 19)?;
    let missing_skills = json_cell(row, 20)?;
    let ai_tags = json_cell(row, 21)?;

    Ok(Job {
        id: row.get(0)?,
        source_id: row.get(1)?,
        platform: row.get(2)?,
        url: row.get(3)?,
        title: row.get(4)?,
        company_name: row.get(5)?,
        location: row.get(6)?,
        is_remote: row.get(7)?,
        salary_min: row.get(8)?,
        salary_max: row.get(9)?,
        salary_currency: row.get(10)?,
        job_type: row.get(11)?,
        experience_level: row.get(12)?,
        description: row.get(13)?,
        requirements,
        raw_html: row.get(15)?,
        match_score: row.get(16)?,
        match_confidence: row.get(17)?,
        match_reasoning: row.get(18)?,
        matched_skills,
        missing_skills,
        ai_tags,
        should_apply: row.get(22)?,
        ai_priority: row.get(23)?,
    })
}

fn json_cell<T: DeserializeOwned>(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<T> {
    let value: Option<String> = row.get(index)?;
    serde_json::from_str(value.as_deref().unwrap_or("[]")).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            index,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn to_json_text<T: Serialize>(value: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string(value)
}

fn from_json_text<T: DeserializeOwned>(value: String) -> Result<T, serde_json::Error> {
    serde_json::from_str(&value)
}

#[allow(dead_code)]
fn _assert_setting_value_send_sync(_: SettingValue) {}
