use rusqlite::{params, Connection};
use serde::de::DeserializeOwned;
use serde::Serialize;
use thiserror::Error;

use super::models::{Setting, SettingValue, UpsertSetting, UpsertUserProfile, UserProfile};

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

fn to_json_text<T: Serialize>(value: &T) -> Result<String, serde_json::Error> {
    serde_json::to_string(value)
}

fn from_json_text<T: DeserializeOwned>(value: String) -> Result<T, serde_json::Error> {
    serde_json::from_str(&value)
}

#[allow(dead_code)]
fn _assert_setting_value_send_sync(_: SettingValue) {}

