import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getBrowserJobs,
  getBrowserSetting,
  getBrowserUserProfile,
  saveBrowserJobs,
  saveBrowserSetting,
  saveBrowserUserProfile,
} from "./browser-persistence";
import type { Job } from "./tauri-api";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("browser persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves and loads a browser preview profile", () => {
    saveBrowserUserProfile({
      full_name: "Asha Rao",
      headline: "Frontend Engineer",
      email: "asha@example.com",
      phone: null,
      location: "Bengaluru",
      portfolio_url: null,
      linkedin_url: null,
      github_url: null,
      summary: "React and TypeScript",
      skills: ["React", "TypeScript"],
      target_roles: ["Frontend Engineer"],
      preferences: {},
    });

    expect(getBrowserUserProfile()).toMatchObject({
      id: "browser-profile",
      full_name: "Asha Rao",
      skills: ["React", "TypeScript"],
    });
  });

  it("saves and replaces browser preview settings by key", () => {
    saveBrowserSetting({ key: "ai.provider", value: "ollama", category: "ai" });
    saveBrowserSetting({ key: "ai.provider", value: "openai", category: "ai" });
    saveBrowserSetting({ key: "application.reviewBeforeSubmit", value: true, category: "application" });

    expect(getBrowserSetting("ai.provider")).toEqual({
      key: "ai.provider",
      value: "openai",
      category: "ai",
    });
    expect(getBrowserSetting("application.reviewBeforeSubmit")?.value).toBe(true);
  });

  it("saves and loads browser-discovered jobs", () => {
    const jobs: Job[] = [
      {
        id: "browser-job-1",
        source_id: "remoteok-1",
        platform: "remoteok",
        url: "https://remoteok.com/remote-job/1",
        title: "React Engineer",
        company_name: "Remote Labs",
        location: "Worldwide",
        is_remote: true,
        salary_min: null,
        salary_max: null,
        salary_currency: "USD",
        job_type: null,
        experience_level: null,
        description: "React role",
        requirements: ["React"],
        raw_html: null,
        match_score: 90,
        match_confidence: 0.9,
        match_reasoning: "Matched browser discovery keywords.",
        matched_skills: ["React"],
        missing_skills: [],
        ai_tags: ["live"],
        should_apply: true,
        ai_priority: "high",
      },
    ];

    expect(saveBrowserJobs(jobs)).toEqual(jobs);
    expect(getBrowserJobs()).toEqual(jobs);
  });
});
