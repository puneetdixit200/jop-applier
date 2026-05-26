import type {
  Setting,
  Job,
  UpsertSetting,
  UpsertUserProfile,
  UserProfile,
} from "./tauri-api";

const PROFILE_KEY = "cluelyy.browser.profile";
const SETTINGS_KEY = "cluelyy.browser.settings";
const JOBS_KEY = "cluelyy.browser.jobs";

function getStorage() {
  try {
    const storage = globalThis.localStorage;
    const probeKey = "cluelyy.browser.probe";
    storage.setItem(probeKey, "1");
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  const storage = getStorage();
  if (!storage) {
    return fallback;
  }

  const raw = storage.getItem(key);
  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  storage.setItem(key, JSON.stringify(value));
  return true;
}

export function getBrowserUserProfile(): UserProfile | null {
  return readJson<UserProfile | null>(PROFILE_KEY, null);
}

export function saveBrowserUserProfile(profile: UpsertUserProfile): UserProfile | null {
  const record: UserProfile = {
    id: "browser-profile",
    ...profile,
  };

  return writeJson(PROFILE_KEY, record) ? record : null;
}

export function getBrowserSetting(key: string): Setting | null {
  const settings = readJson<Record<string, Setting>>(SETTINGS_KEY, {});
  return settings[key] ?? null;
}

export function saveBrowserSetting(setting: UpsertSetting): Setting | null {
  const settings = readJson<Record<string, Setting>>(SETTINGS_KEY, {});
  const record: Setting = {
    key: setting.key,
    value: setting.value,
    category: setting.category ?? null,
  };
  settings[record.key] = record;

  return writeJson(SETTINGS_KEY, settings) ? record : null;
}

export function getBrowserJobs(): Job[] {
  return readJson<Job[]>(JOBS_KEY, []).filter(isBrowserJob);
}

export function saveBrowserJobs(jobs: Job[]): Job[] | null {
  return writeJson(JOBS_KEY, jobs) ? jobs : null;
}

function isBrowserJob(value: unknown): value is Job {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.platform === "string" &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    typeof value.company_name === "string" &&
    Array.isArray(value.requirements) &&
    Array.isArray(value.matched_skills) &&
    Array.isArray(value.missing_skills) &&
    Array.isArray(value.ai_tags)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
