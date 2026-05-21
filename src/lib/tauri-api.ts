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

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  careers_url: string | null;
  industry: string | null;
  size: string | null;
  linkedin_url: string | null;
  glassdoor_url: string | null;
  notes: string | null;
  is_blacklisted: boolean;
  is_whitelisted: boolean;
  created_at: string;
};

export type UpsertCompany = Omit<Company, "id" | "created_at">;

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

export type ApplicationEvent = {
  id: string;
  application_id: string;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type Document = {
  id: string;
  application_id: string | null;
  type: string;
  file_path: string;
  file_name: string;
  version: number;
  ai_model_used: string | null;
  created_at: string;
};

export type UpsertDocument = Omit<Document, "id" | "created_at">;

export type Contact = {
  id: string;
  company_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  role: string | null;
  notes: string | null;
  created_at: string;
};

export type UpsertContact = Omit<Contact, "id" | "created_at">;

export type Communication = {
  id: string;
  application_id: string | null;
  contact_id: string | null;
  direction: string;
  type: string;
  subject: string | null;
  body: string | null;
  email_id: string | null;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

export type UpsertCommunication = Omit<Communication, "id" | "created_at">;

export type ScheduledTask = {
  id: string;
  name: string;
  type: string;
  cron_expression: string | null;
  is_enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  config: Record<string, unknown>;
  created_at: string;
};

export type UpsertScheduledTask = Omit<ScheduledTask, "id" | "created_at">;

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

export async function listCompanies() {
  return invoke<Company[]>("list_companies_command");
}

export async function saveCompany(company: UpsertCompany) {
  return invoke<Company>("save_company_command", { company });
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

export async function listApplicationEvents(applicationId: string) {
  return invoke<ApplicationEvent[]>("list_application_events_command", { applicationId });
}

export async function listDocuments(applicationId: string) {
  return invoke<Document[]>("list_documents_command", { applicationId });
}

export async function saveDocument(document: UpsertDocument) {
  return invoke<Document>("save_document_command", { document });
}

export async function listContacts() {
  return invoke<Contact[]>("list_contacts_command");
}

export async function saveContact(contact: UpsertContact) {
  return invoke<Contact>("save_contact_command", { contact });
}

export async function listCommunications(applicationId: string) {
  return invoke<Communication[]>("list_communications_command", { applicationId });
}

export async function saveCommunication(communication: UpsertCommunication) {
  return invoke<Communication>("save_communication_command", { communication });
}

export async function listScheduledTasks() {
  return invoke<ScheduledTask[]>("list_scheduled_tasks_command");
}

export async function saveScheduledTask(task: UpsertScheduledTask) {
  return invoke<ScheduledTask>("save_scheduled_task_command", { task });
}
