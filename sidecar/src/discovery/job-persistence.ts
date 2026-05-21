import type { DiscoveredJob } from "./discovery-manager.js";

export type MatchPriority = "high" | "medium" | "low";

export type DiscoveryMatchResult = {
  score: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  tags: string[];
  priority: MatchPriority;
};

export type UpsertJobPayload = {
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
  match_reasoning: string | null;
  matched_skills: string[];
  missing_skills: string[];
  ai_tags: string[];
  ai_priority: MatchPriority | null;
};

export function mapDiscoveredJobsToUpsertJobs(
  jobs: DiscoveredJob[],
  matchesByUrl: Record<string, DiscoveryMatchResult> = {},
): UpsertJobPayload[] {
  return jobs.map((job) => mapDiscoveredJobToUpsertJob(job, matchesByUrl[job.listing.url]));
}

export function mapDiscoveredJobToUpsertJob(
  job: DiscoveredJob,
  match?: DiscoveryMatchResult,
): UpsertJobPayload {
  const salary = parseSalary(job.listing.salary);

  return {
    source_id: nullableText(job.listing.sourceId),
    platform: job.listing.platform,
    url: job.details.url || job.listing.url,
    title: job.listing.title,
    company_name: job.listing.company,
    location: nullableText(job.listing.location),
    is_remote: /\bremote\b/i.test(job.listing.location),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    job_type: null,
    experience_level: null,
    description: nullableText(job.details.description) ?? nullableText(job.listing.description),
    requirements: job.details.requirements ?? [],
    raw_html: nullableText(job.details.rawHtml) ?? nullableText(job.listing.rawHtml),
    match_score: match?.score ?? null,
    match_reasoning: match?.reasoning ?? null,
    matched_skills: match?.matchedSkills ?? [],
    missing_skills: match?.missingSkills ?? [],
    ai_tags: match?.tags ?? [],
    ai_priority: match?.priority ?? null,
  };
}

function parseSalary(value: string | undefined): { min: number | null; max: number | null; currency: string } {
  if (!value) {
    return { min: null, max: null, currency: "INR" };
  }

  const currency = value.match(/\b[A-Z]{3}\b/)?.[0] ?? "INR";
  const numbers = [...value.matchAll(/\d[\d,]*/g)]
    .map((match) => Number(match[0].replace(/,/g, "")))
    .filter((number) => Number.isFinite(number));

  return {
    min: numbers[0] ?? null,
    max: numbers[1] ?? numbers[0] ?? null,
    currency,
  };
}

function nullableText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

