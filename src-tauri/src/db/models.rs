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
    pub match_confidence: Option<f64>,
    pub match_reasoning: Option<String>,
    pub matched_skills: Vec<String>,
    pub missing_skills: Vec<String>,
    pub ai_tags: Vec<String>,
    pub should_apply: Option<bool>,
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
    pub match_confidence: Option<f64>,
    pub match_reasoning: Option<String>,
    pub matched_skills: Vec<String>,
    pub missing_skills: Vec<String>,
    pub ai_tags: Vec<String>,
    pub should_apply: Option<bool>,
    pub ai_priority: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Application {
    pub id: String,
    pub job_id: String,
    pub job_title: String,
    pub company_name: String,
    pub status: String,
    pub mode: String,
    pub resume_path: Option<String>,
    pub cover_letter_path: Option<String>,
    pub submitted_at: Option<String>,
    pub submission_url: Option<String>,
    pub confirmation_id: Option<String>,
    pub error_message: Option<String>,
    pub retry_count: i64,
    pub max_retries: i64,
    pub notes: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertApplication {
    pub job_id: String,
    pub status: String,
    pub mode: String,
    pub resume_path: Option<String>,
    pub cover_letter_path: Option<String>,
    pub submission_url: Option<String>,
    pub confirmation_id: Option<String>,
    pub error_message: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApplicationEvent {
    pub id: String,
    pub application_id: String,
    pub event_type: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub description: Option<String>,
    pub metadata: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub application_id: Option<String>,
    #[serde(rename = "type")]
    pub document_type: String,
    pub file_path: String,
    pub file_name: String,
    pub version: i64,
    pub ai_model_used: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertDocument {
    pub application_id: Option<String>,
    #[serde(rename = "type")]
    pub document_type: String,
    pub file_path: String,
    pub file_name: String,
    pub version: i64,
    pub ai_model_used: Option<String>,
}
