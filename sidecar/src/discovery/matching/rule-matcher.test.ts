import { describe, expect, it } from "vitest";
import type { UpsertJobPayload } from "../job-persistence.js";
import { evaluateJobAgainstRules, filterJobsByRules, type MatchRules } from "./rule-matcher.js";

const baseJob: UpsertJobPayload = {
  source_id: "linkedin-1",
  platform: "linkedin",
  url: "https://linkedin.example/jobs/1",
  title: "Frontend Engineer Intern",
  company_name: "Northstar Labs",
  location: "Remote - Bengaluru",
  is_remote: true,
  salary_min: 900000,
  salary_max: 1400000,
  salary_currency: "INR",
  job_type: "internship",
  experience_level: "intern",
  description: "Build React product surfaces with TypeScript. Internship for 0-2 years experience.",
  requirements: ["React", "TypeScript", "Testing"],
  raw_html: null,
  match_score: null,
  match_confidence: null,
  match_reasoning: null,
  matched_skills: [],
  missing_skills: [],
  ai_tags: [],
  should_apply: null,
  ai_priority: null,
};

const rules: MatchRules = {
  mustHaveKeywords: ["React", "TypeScript"],
  mustNotHaveKeywords: ["10+ years"],
  locations: ["Bengaluru"],
  remoteOnly: true,
  minSalary: 900000,
  maxExperienceYears: 2,
  companyBlacklist: [],
  companyWhitelist: [],
};

describe("rule matcher", () => {
  it("keeps jobs that satisfy the configured rule filters", () => {
    expect(filterJobsByRules([baseJob], rules)).toEqual([
      {
        job: baseJob,
        ruleMatch: {
          passed: true,
          matchedKeywords: ["React", "TypeScript"],
          rejectedBy: [],
          reasons: expect.arrayContaining([
            "matched required keywords: React, TypeScript",
            "accepted remote job",
            "matched accepted location: Bengaluru",
            "salary meets minimum: 900000",
            "experience within maximum: 2",
          ]),
        },
      },
    ]);
  });

  it("rejects blocked keywords and blacklisted companies unless the company is whitelisted", () => {
    const blockedJob: UpsertJobPayload = {
      ...baseJob,
      company_name: "Exploit Co",
      description: "Build React and TypeScript surfaces. Requires 10+ years of frontend experience.",
    };
    const whitelistJob: UpsertJobPayload = {
      ...baseJob,
      url: "https://linkedin.example/jobs/whitelist",
      company_name: "Dream Systems",
      location: "Mumbai",
      is_remote: false,
      salary_min: null,
      salary_max: null,
      description: "Internal role from a priority company.",
      requirements: [],
    };
    const stricterRules: MatchRules = {
      ...rules,
      companyBlacklist: ["Exploit Co"],
      companyWhitelist: ["Dream Systems"],
    };

    expect(evaluateJobAgainstRules(blockedJob, stricterRules)).toMatchObject({
      passed: false,
      rejectedBy: expect.arrayContaining([
        "blocked keyword: 10+ years",
        "blacklisted company: Exploit Co",
        "experience above maximum: 10",
      ]),
    });
    expect(filterJobsByRules([blockedJob, whitelistJob], stricterRules)).toEqual([
      {
        job: whitelistJob,
        ruleMatch: {
          passed: true,
          matchedKeywords: [],
          rejectedBy: [],
          reasons: ["company whitelist override: Dream Systems"],
        },
      },
    ]);
  });
});
