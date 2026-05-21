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

