use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UserProfile {
    pub id: String,
    pub full_name: String,
    pub headline: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub location: Option<String>,
    pub portfolio_url: Option<String>,
    pub linkedin_url: Option<String>,
    pub github_url: Option<String>,
    pub summary: Option<String>,
    pub skills: Vec<String>,
    pub target_roles: Vec<String>,
    pub preferences: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertUserProfile {
    pub full_name: String,
    pub headline: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub location: Option<String>,
    pub portfolio_url: Option<String>,
    pub linkedin_url: Option<String>,
    pub github_url: Option<String>,
    pub summary: Option<String>,
    pub skills: Vec<String>,
    pub target_roles: Vec<String>,
    pub preferences: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SettingValue {
    String(String),
    Number(f64),
    Boolean(bool),
    Object(Value),
    Array(Vec<Value>),
    Null,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Setting {
    pub key: String,
    pub value: SettingValue,
    pub category: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertSetting {
    pub key: String,
    pub value: SettingValue,
    pub category: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Job {
    pub id: String,
    pub source_id: Option<String>,
    pub platform: String,
    pub url: String,
    pub title: String,
    pub company_name: String,
    pub location: Option<String>,
    pub is_remote: bool,
    pub salary_min: Option<i64>,
    pub salary_max: Option<i64>,
    pub salary_currency: String,
    pub job_type: Option<String>,
    pub experience_level: Option<String>,
    pub description: Option<String>,
    pub requirements: Vec<String>,
    pub raw_html: Option<String>,
    pub match_score: Option<i64>,
    pub match_reasoning: Option<String>,
    pub matched_skills: Vec<String>,
    pub missing_skills: Vec<String>,
    pub ai_tags: Vec<String>,
    pub ai_priority: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertJob {
    pub source_id: Option<String>,
    pub platform: String,
    pub url: String,
    pub title: String,
    pub company_name: String,
    pub location: Option<String>,
    pub is_remote: bool,
    pub salary_min: Option<i64>,
    pub salary_max: Option<i64>,
    pub salary_currency: String,
    pub job_type: Option<String>,
    pub experience_level: Option<String>,
    pub description: Option<String>,
    pub requirements: Vec<String>,
    pub raw_html: Option<String>,
    pub match_score: Option<i64>,
    pub match_reasoning: Option<String>,
    pub matched_skills: Vec<String>,
    pub missing_skills: Vec<String>,
    pub ai_tags: Vec<String>,
    pub ai_priority: Option<String>,
}
