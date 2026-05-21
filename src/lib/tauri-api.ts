import { invoke } from "@tauri-apps/api/core";

export type SettingValue = string | number | boolean | Record<string, unknown> | unknown[] | null;

export type UserProfile = {
  id: string;
  full_name: string;
  headline: string;
  email: string | null;
  phone: string | null;
  location: string | null;
  portfolio_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  summary: string | null;
  skills: string[];
  target_roles: string[];
  preferences: Record<string, unknown>;
};

export type UpsertUserProfile = Omit<UserProfile, "id">;

export type Setting = {
  key: string;
  value: SettingValue;
  category: string | null;
};

export type UpsertSetting = Setting;

export type Job = {
  id: string;
  source_id: string | null;
  platform: string;
  url: string;
  title: string;
  company_name: string;
  location: string | null;
  is_remote: boolean;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string;
  job_type: string | null;
  experience_level: string | null;
  description: string | null;
  requirements: string[];
  raw_html: string | null;
  match_score: number | null;
  match_confidence: number | null;
  match_reasoning: string | null;
  matched_skills: string[];
  missing_skills: string[];
  ai_tags: string[];
  should_apply: boolean | null;
  ai_priority: string | null;
};

export type UpsertJob = Omit<Job, "id">;

export type Application = {
  id: string;
  job_id: string;
  job_title: string;
  company_name: string;
  status: string;
  mode: string;
  resume_path: string | null;
  cover_letter_path: string | null;
  submitted_at: string | null;
  submission_url: string | null;
  confirmation_id: string | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  notes: string | null;
  tags: string[];
};

export type UpsertApplication = {
  job_id: string;
  status: string;
  mode: string;
  resume_path: string | null;
  cover_letter_path: string | null;
  submission_url: string | null;
  confirmation_id: string | null;
  error_message: string | null;
  notes: string | null;
  tags: string[];
};

export function isDesktopRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export async function getUserProfile() {
  return invoke<UserProfile | null>("get_user_profile_command");
}

export async function saveUserProfile(profile: UpsertUserProfile) {
  return invoke<UserProfile>("save_user_profile_command", { profile });
}

export async function getSetting(key: string) {
  return invoke<Setting | null>("get_setting_command", { key });
}

export async function saveSetting(setting: UpsertSetting) {
  return invoke<Setting>("save_setting_command", { setting });
}

export async function listJobs() {
  return invoke<Job[]>("list_jobs_command");
}

export async function saveJob(job: UpsertJob) {
  return invoke<Job>("save_job_command", { job });
}

export async function listApplications() {
  return invoke<Application[]>("list_applications_command");
}

export async function saveApplication(application: UpsertApplication) {
  return invoke<Application>("save_application_command", { application });
}
