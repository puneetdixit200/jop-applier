import type { UpsertJobPayload } from "../job-persistence.js";

export type MatchRules = {
  mustHaveKeywords: string[];
  mustNotHaveKeywords: string[];
  locations: string[];
  remoteOnly: boolean;
  minSalary?: number;
  maxExperienceYears?: number;
  companyBlacklist: string[];
  companyWhitelist: string[];
};

export type RuleMatchResult = {
  passed: boolean;
  matchedKeywords: string[];
  rejectedBy: string[];
  reasons: string[];
};

export type RuleMatchedJob = {
  job: UpsertJobPayload;
  ruleMatch: RuleMatchResult;
};

export function filterJobsByRules(jobs: UpsertJobPayload[], rules: MatchRules): RuleMatchedJob[] {
  return jobs
    .map((job) => ({ job, ruleMatch: evaluateJobAgainstRules(job, rules) }))
    .filter((candidate) => candidate.ruleMatch.passed);
}

export function evaluateJobAgainstRules(job: UpsertJobPayload, rules: MatchRules): RuleMatchResult {
  const rejectedBy: string[] = [];
  const reasons: string[] = [];
  const whitelistedCompany = rules.companyWhitelist.find((company) => sameCompany(job.company_name, company));
  if (whitelistedCompany) {
    return {
      passed: true,
      matchedKeywords: [],
      rejectedBy: [],
      reasons: [`company whitelist override: ${whitelistedCompany}`],
    };
  }

  const searchText = normalizeText([
    job.title,
    job.company_name,
    job.location,
    job.description,
    job.requirements.join(" "),
  ]);

  const blacklistedCompany = rules.companyBlacklist.find((company) => sameCompany(job.company_name, company));
  if (blacklistedCompany) {
    rejectedBy.push(`blacklisted company: ${blacklistedCompany}`);
  }

  const matchedKeywords = rules.mustHaveKeywords.filter((keyword) => searchText.includes(normalizeText(keyword)));
  const missingKeywords = rules.mustHaveKeywords.filter((keyword) => !matchedKeywords.includes(keyword));
  if (matchedKeywords.length > 0) {
    reasons.push(`matched required keywords: ${matchedKeywords.join(", ")}`);
  }
  if (missingKeywords.length > 0) {
    rejectedBy.push(`missing required keywords: ${missingKeywords.join(", ")}`);
  }

  for (const keyword of rules.mustNotHaveKeywords) {
    if (searchText.includes(normalizeText(keyword))) {
      rejectedBy.push(`blocked keyword: ${keyword}`);
    }
  }

  if (rules.remoteOnly) {
    if (job.is_remote) {
      reasons.push("accepted remote job");
    } else {
      rejectedBy.push("not remote");
    }
  }

  const matchedLocation = rules.locations.find((location) => normalizeText(job.location ?? "").includes(normalizeText(location)));
  if (rules.locations.length > 0) {
    if (matchedLocation) {
      reasons.push(`matched accepted location: ${matchedLocation}`);
    } else {
      rejectedBy.push(`location not accepted: ${job.location ?? "unspecified"}`);
    }
  }

  if (rules.minSalary !== undefined) {
    const highestSalary = Math.max(job.salary_min ?? 0, job.salary_max ?? 0);
    if (highestSalary >= rules.minSalary) {
      reasons.push(`salary meets minimum: ${rules.minSalary}`);
    } else {
      rejectedBy.push(`salary below minimum: ${rules.minSalary}`);
    }
  }

  if (rules.maxExperienceYears !== undefined) {
    const requiredExperienceYears = highestExperienceYears(searchText);
    if (requiredExperienceYears === null || requiredExperienceYears <= rules.maxExperienceYears) {
      reasons.push(`experience within maximum: ${rules.maxExperienceYears}`);
    } else {
      rejectedBy.push(`experience above maximum: ${requiredExperienceYears}`);
    }
  }

  return {
    passed: rejectedBy.length === 0,
    matchedKeywords,
    rejectedBy,
    reasons,
  };
}

function normalizeText(value: string | null | undefined | (string | null | undefined)[]): string {
  if (Array.isArray(value)) {
    return value.join(" ").toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }
  return (value ?? "").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

function sameCompany(actual: string, expected: string): boolean {
  return normalizeText(actual) === normalizeText(expected);
}

function highestExperienceYears(text: string): number | null {
  const years = [...text.matchAll(/\b(\d+)(?:\s*-\s*(\d+)|\+)?\s*years?\b/g)]
    .flatMap((match) => [match[1], match[2]])
    .filter((value): value is string => value !== undefined)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  if (years.length === 0) {
    return null;
  }

  return Math.max(...years);
}
