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
  last_follow_up: string | null;
  follow_up_count: number;
  next_follow_up: string | null;
  response_date: string | null;
  response_type: string | null;
  response_notes: string | null;
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
  last_follow_up: string | null;
  follow_up_count: number;
  next_follow_up: string | null;
  response_date: string | null;
  response_type: string | null;
  response_notes: string | null;
  submission_url: string | null;
  confirmation_id: string | null;
  error_message: string | null;
  notes: string | null;
  tags: string[];
};

export type ApplicationWorkflowStateUpdate = {
  status?: string;
  resume_path?: string | null;
  cover_letter_path?: string | null;
  submitted_at?: string | null;
  submission_url?: string | null;
  confirmation_id?: string | null;
  retry_count?: number;
  error_message?: string | null;
};

export type ApplicationReviewDecision = "approve" | "cancel";

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

export type ApplicationDocumentContext = {
  application_id: string;
  job_id: string;
  company_name: string;
  resume_version: number;
  profile: UserProfile;
  job: Job;
};

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

export type FundedCompany = {
  id: string;
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  tech_stack: string[];
  funding_stage: string | null;
  funding_amount: number | null;
  funding_currency: string;
  funding_date: string | null;
  investors: string[];
  lead_investor: string | null;
  source: string;
  source_url: string | null;
  region: string;
  relevance_score: number | null;
  ai_summary: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type UpsertFundedCompany = Omit<FundedCompany, "id" | "created_at" | "updated_at">;

export type ProspectContact = {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  email_confidence: number;
  email_status: string;
  role: string;
  linkedin_url: string | null;
  source: string;
  opted_out: boolean;
  created_at: string;
};

export type UpsertProspectContact = Omit<ProspectContact, "id" | "created_at">;

export type OutreachCampaign = {
  id: string;
  company_id: string;
  campaign_type: string;
  status: string;
  sequence_json: string;
  auto_approve: boolean;
  max_emails_per_day: number;
  created_at: string;
  updated_at: string;
};

export type UpsertOutreachCampaign = Omit<OutreachCampaign, "id" | "created_at" | "updated_at">;

export type OutreachEmail = {
  id: string;
  campaign_id: string;
  contact_id: string;
  sequence_step: number;
  subject: string;
  body_html: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  message_id: string | null;
  created_at: string;
};

export type UpsertOutreachEmail = Omit<OutreachEmail, "id" | "created_at">;

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

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  channel: string;
  metadata: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export type UpsertNotification = Omit<Notification, "id" | "read_at" | "created_at">;

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

export type ScheduledTaskRunUpdate = {
  last_run: string;
  next_run: string | null;
};

export type ScheduledTaskRunResult = {
  scanned: number;
  due: number;
  completed: number;
  failed: number;
  skipped: number;
  notifications?: unknown[];
};

export type AiCacheEntry = {
  prompt_hash: string;
  model: string;
  response: string;
  tokens_used: number | null;
  created_at: string;
  expires_at: string | null;
};

export type UpsertAiCacheEntry = Omit<AiCacheEntry, "created_at">;

export type SecureSecretRef = {
  service: string;
  key: string;
  uri: string;
};

export type DatabaseEncryptionStatus = {
  available: boolean;
  enabled: boolean;
  databasePath: string;
  keySource: string | null;
};

export type SidecarProvider = {
  provider: string;
  model: string;
  local: boolean;
};

export type SidecarRuntimeStatus = {
  status: string;
  workflows: string[];
  provider: SidecarProvider;
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

export async function saveSecret(key: string, secret: string) {
  return invoke<SecureSecretRef>("save_secret_command", { key, secret });
}

export async function getSecret(key: string) {
  return invoke<string | null>("get_secret_command", { key });
}

export async function deleteSecret(key: string) {
  return invoke<boolean>("delete_secret_command", { key });
}

export async function getDatabaseEncryptionStatus() {
  return invoke<DatabaseEncryptionStatus>("get_database_encryption_status_command");
}

export async function configureDatabaseEncryption(enabled: boolean, passphrase?: string) {
  return invoke<DatabaseEncryptionStatus>("configure_database_encryption_command", {
    enabled,
    passphrase,
  });
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

export async function updateApplicationWorkflowState(
  applicationId: string,
  update: ApplicationWorkflowStateUpdate,
) {
  return invoke<Application | null>("update_application_workflow_state_command", {
    applicationId,
    update,
  });
}

export async function listApplicationEvents(applicationId: string) {
  return invoke<ApplicationEvent[]>("list_application_events_command", { applicationId });
}

export async function listDocuments(applicationId: string) {
  return invoke<Document[]>("list_documents_command", { applicationId });
}

export async function getApplicationDocumentContext(applicationId: string) {
  return invoke<ApplicationDocumentContext | null>("get_application_document_context_command", { applicationId });
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

export async function listFundedCompanies() {
  return invoke<FundedCompany[]>("list_funded_companies_command");
}

export async function saveFundedCompany(company: UpsertFundedCompany) {
  return invoke<FundedCompany>("save_funded_company_command", { company });
}

export async function listProspectContacts(companyId: string) {
  return invoke<ProspectContact[]>("list_prospect_contacts_command", { companyId });
}

export async function saveProspectContact(contact: UpsertProspectContact) {
  return invoke<ProspectContact>("save_prospect_contact_command", { contact });
}

export async function saveOutreachCampaign(campaign: UpsertOutreachCampaign) {
  return invoke<OutreachCampaign>("save_outreach_campaign_command", { campaign });
}

export async function listOutreachEmails(status?: string) {
  return invoke<OutreachEmail[]>("list_outreach_emails_command", { status: status ?? null });
}

export async function saveOutreachEmail(email: UpsertOutreachEmail) {
  return invoke<OutreachEmail>("save_outreach_email_command", { email });
}

export async function listCommunications(applicationId: string) {
  return invoke<Communication[]>("list_communications_command", { applicationId });
}

export async function saveCommunication(communication: UpsertCommunication) {
  return invoke<Communication>("save_communication_command", { communication });
}

export async function listNotifications() {
  return invoke<Notification[]>("list_notifications_command");
}

export async function saveNotification(notification: UpsertNotification) {
  return invoke<Notification>("save_notification_command", { notification });
}

export async function markNotificationRead(id: string, readAt: string) {
  return invoke<Notification | null>("mark_notification_read_command", { id, readAt });
}

export async function listScheduledTasks() {
  return invoke<ScheduledTask[]>("list_scheduled_tasks_command");
}

export async function saveScheduledTask(task: UpsertScheduledTask) {
  return invoke<ScheduledTask>("save_scheduled_task_command", { task });
}

export async function updateScheduledTaskRun(id: string, update: ScheduledTaskRunUpdate) {
  return invoke<ScheduledTask>("update_scheduled_task_run_command", { id, update });
}

export async function runDueScheduledTasks() {
  return invoke<ScheduledTaskRunResult>("run_due_scheduled_tasks_command");
}

export async function getAiCacheEntry(promptHash: string) {
  return invoke<AiCacheEntry | null>("get_ai_cache_entry_command", { promptHash });
}

export async function saveAiCacheEntry(entry: UpsertAiCacheEntry) {
  return invoke<AiCacheEntry>("save_ai_cache_entry_command", { entry });
}

export async function getSidecarStatus() {
  return invoke<SidecarRuntimeStatus>("sidecar_status_command");
}

export async function runSidecarWorkflow(workflowId: string) {
  return invoke<unknown>("run_sidecar_workflow_command", { workflowId });
}

export async function runApplicationReviewDecision(
  application: Application,
  decision: ApplicationReviewDecision,
) {
  return invoke<Application | null>("run_application_review_decision_command", {
    application,
    decision,
  });
}
