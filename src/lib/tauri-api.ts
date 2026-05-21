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

