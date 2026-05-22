import type { DiscoveredJob } from "./discovery-manager.js";
import type { ClassifiedJobPosting } from "../ai/provider-interface.js";

export type MatchPriority = "high" | "medium" | "low";

export type DiscoveryClassificationResult = ClassifiedJobPosting;

export type DiscoveryMatchResult = {
  score: number;
  confidence: number;
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  tags: string[];
  shouldApply: boolean;
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
  match_confidence: number | null;
  match_reasoning: string | null;
  matched_skills: string[];
  missing_skills: string[];
  ai_tags: string[];
  should_apply: boolean | null;
  ai_priority: MatchPriority | null;
};

export function mapDiscoveredJobsToUpsertJobs(
  jobs: DiscoveredJob[],
  matchesByUrl: Record<string, DiscoveryMatchResult> = {},
  classificationsByUrl: Record<string, ClassifiedJobPosting> = {},
): UpsertJobPayload[] {
  return jobs.map((job) =>
    mapDiscoveredJobToUpsertJob(
      job,
      matchesByUrl[job.listing.url],
      classificationsByUrl[job.listing.url],
    ),
  );
}

export function mapDiscoveredJobToUpsertJob(
  job: DiscoveredJob,
  match?: DiscoveryMatchResult,
  classification?: ClassifiedJobPosting,
): UpsertJobPayload {
  const salary = parseSalary(job.listing.salary);
  const description =
    nullableText(classification?.description) ??
    nullableText(job.details.description) ??
    nullableText(job.listing.description);
  const requirements =
    classification?.requirements && classification.requirements.length > 0
      ? classification.requirements
      : job.details.requirements ?? [];

  return {
    source_id: nullableText(job.listing.sourceId),
    platform: job.listing.platform,
    url: job.details.url || job.listing.url,
    title: nullableText(classification?.title) ?? job.listing.title,
    company_name: nullableText(classification?.companyName) ?? job.listing.company,
    location: nullableText(classification?.location ?? undefined) ?? nullableText(job.listing.location),
    is_remote: classification?.remote ?? /\bremote\b/i.test(job.listing.location),
    salary_min: salary.min,
    salary_max: salary.max,
    salary_currency: salary.currency,
    job_type: nullableText(classification?.jobType ?? undefined),
    experience_level: nullableText(classification?.experienceLevel ?? undefined),
    description,
    requirements,
    raw_html: nullableText(job.details.rawHtml) ?? nullableText(job.listing.rawHtml),
    match_score: match?.score ?? null,
    match_confidence: match?.confidence ?? null,
    match_reasoning: match?.reasoning ?? null,
    matched_skills: match?.matchedSkills ?? [],
    missing_skills: match?.missingSkills ?? [],
    ai_tags: match?.tags ?? [],
    should_apply: match?.shouldApply ?? null,
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
