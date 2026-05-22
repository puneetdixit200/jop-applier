use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

fn deserialize_nullable_field<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

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
pub struct Company {
    pub id: String,
    pub name: String,
    pub domain: Option<String>,
    pub careers_url: Option<String>,
    pub industry: Option<String>,
    pub size: Option<String>,
    pub linkedin_url: Option<String>,
    pub glassdoor_url: Option<String>,
    pub notes: Option<String>,
    pub is_blacklisted: bool,
    pub is_whitelisted: bool,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertCompany {
    pub name: String,
    pub domain: Option<String>,
    pub careers_url: Option<String>,
    pub industry: Option<String>,
    pub size: Option<String>,
    pub linkedin_url: Option<String>,
    pub glassdoor_url: Option<String>,
    pub notes: Option<String>,
    pub is_blacklisted: bool,
    pub is_whitelisted: bool,
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
    pub last_follow_up: Option<String>,
    pub follow_up_count: i64,
    pub next_follow_up: Option<String>,
    pub response_date: Option<String>,
    pub response_type: Option<String>,
    pub response_notes: Option<String>,
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
    pub last_follow_up: Option<String>,
    pub follow_up_count: i64,
    pub next_follow_up: Option<String>,
    pub response_date: Option<String>,
    pub response_type: Option<String>,
    pub response_notes: Option<String>,
    pub submission_url: Option<String>,
    pub confirmation_id: Option<String>,
    pub error_message: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct ApplicationWorkflowStateUpdate {
    pub status: Option<String>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub resume_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub cover_letter_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub submitted_at: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub submission_url: Option<Option<String>>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub confirmation_id: Option<Option<String>>,
    pub retry_count: Option<i64>,
    #[serde(default, deserialize_with = "deserialize_nullable_field")]
    pub error_message: Option<Option<String>>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApplicationFollowUpUpdate {
    pub status: String,
    pub follow_up_count: i64,
    pub last_follow_up: String,
    pub next_follow_up: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApplicationResponseUpdate {
    pub status: String,
    pub response_date: String,
    pub response_type: String,
    pub response_notes: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ApplicationDocumentContext {
    pub application_id: String,
    pub job_id: String,
    pub company_name: String,
    pub resume_version: i64,
    pub profile: UserProfile,
    pub job: Job,
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

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Contact {
    pub id: String,
    pub company_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin_url: Option<String>,
    pub role: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertContact {
    pub company_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub linkedin_url: Option<String>,
    pub role: Option<String>,
    pub notes: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Communication {
    pub id: String,
    pub application_id: Option<String>,
    pub contact_id: Option<String>,
    pub direction: String,
    #[serde(rename = "type")]
    pub communication_type: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub email_id: Option<String>,
    pub sent_at: Option<String>,
    pub read_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertCommunication {
    pub application_id: Option<String>,
    pub contact_id: Option<String>,
    pub direction: String,
    #[serde(rename = "type")]
    pub communication_type: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub email_id: Option<String>,
    pub sent_at: Option<String>,
    pub read_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    #[serde(rename = "type")]
    pub notification_type: String,
    pub title: String,
    pub body: String,
    pub priority: String,
    pub channel: String,
    pub metadata: Value,
    pub read_at: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertNotification {
    #[serde(rename = "type")]
    pub notification_type: String,
    pub title: String,
    pub body: String,
    pub priority: String,
    pub channel: String,
    pub metadata: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScheduledTask {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub cron_expression: Option<String>,
    pub is_enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub config: Value,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertScheduledTask {
    pub name: String,
    #[serde(rename = "type")]
    pub task_type: String,
    pub cron_expression: Option<String>,
    pub is_enabled: bool,
    pub last_run: Option<String>,
    pub next_run: Option<String>,
    pub config: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ScheduledTaskRunUpdate {
    pub last_run: String,
    pub next_run: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AiCacheEntry {
    pub prompt_hash: String,
    pub model: String,
    pub response: String,
    pub tokens_used: Option<i64>,
    pub created_at: String,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertAiCacheEntry {
    pub prompt_hash: String,
    pub model: String,
    pub response: String,
    pub tokens_used: Option<i64>,
    pub expires_at: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct FundedCompany {
    pub id: String,
    pub name: String,
    pub domain: Option<String>,
    pub description: Option<String>,
    pub industry: Option<String>,
    pub tech_stack: Vec<String>,
    pub funding_stage: Option<String>,
    pub funding_amount: Option<f64>,
    pub funding_currency: String,
    pub funding_date: Option<String>,
    pub investors: Vec<String>,
    pub lead_investor: Option<String>,
    pub source: String,
    pub source_url: Option<String>,
    pub region: String,
    pub relevance_score: Option<f64>,
    pub ai_summary: Option<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertFundedCompany {
    pub name: String,
    pub domain: Option<String>,
    pub description: Option<String>,
    pub industry: Option<String>,
    pub tech_stack: Vec<String>,
    pub funding_stage: Option<String>,
    pub funding_amount: Option<f64>,
    pub funding_currency: String,
    pub funding_date: Option<String>,
    pub investors: Vec<String>,
    pub lead_investor: Option<String>,
    pub source: String,
    pub source_url: Option<String>,
    pub region: String,
    pub relevance_score: Option<f64>,
    pub ai_summary: Option<String>,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ProspectContact {
    pub id: String,
    pub company_id: String,
    pub full_name: String,
    pub email: String,
    pub email_confidence: f64,
    pub email_status: String,
    pub role: String,
    pub linkedin_url: Option<String>,
    pub source: String,
    pub opted_out: bool,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertProspectContact {
    pub company_id: String,
    pub full_name: String,
    pub email: String,
    pub email_confidence: f64,
    pub email_status: String,
    pub role: String,
    pub linkedin_url: Option<String>,
    pub source: String,
    pub opted_out: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OutreachCampaign {
    pub id: String,
    pub company_id: String,
    pub campaign_type: String,
    pub status: String,
    pub sequence_json: String,
    pub auto_approve: bool,
    pub max_emails_per_day: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertOutreachCampaign {
    pub company_id: String,
    pub campaign_type: String,
    pub status: String,
    pub sequence_json: String,
    pub auto_approve: bool,
    pub max_emails_per_day: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OutreachEmail {
    pub id: String,
    pub campaign_id: String,
    pub contact_id: String,
    pub sequence_step: i64,
    pub subject: String,
    pub body_html: String,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub message_id: Option<String>,
    pub created_at: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertOutreachEmail {
    pub campaign_id: String,
    pub contact_id: String,
    pub sequence_step: i64,
    pub subject: String,
    pub body_html: String,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub sent_at: Option<String>,
    pub message_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct OutreachEmailReviewUpdate {
    pub id: String,
    pub subject: String,
    pub body_html: String,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct EmailOptOut {
    pub email: String,
    pub opted_out_at: String,
    pub reason: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct UpsertEmailOptOut {
    pub email: String,
    pub opted_out_at: String,
    pub reason: String,
}
