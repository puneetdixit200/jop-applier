import type {
  ClassifiedJobPosting,
  JobForMatching,
  MatchResult,
  ProfileForMatching,
} from "../ai/provider-interface.js";
import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { SearchQuery } from "./connectors/connector-interface.js";
import type { DiscoveredJob } from "./discovery-manager.js";
import {
  mapDiscoveredJobsToUpsertJobs,
  type DiscoveryMatchResult,
  type UpsertJobPayload,
} from "./job-persistence.js";
import { filterJobsByRules, type MatchRules } from "./matching/rule-matcher.js";

export type StoredDiscoveredJob = {
  id: string;
  platform: string;
  title: string;
  company_name: string;
};

export type JobDiscoveryWorkflowDependencies = {
  searchQueries: SearchQuery[];
  searchForPersistence: (query: SearchQuery) => Promise<UpsertJobPayload[]>;
  search?: (query: SearchQuery) => Promise<DiscoveredJob[]>;
  classifyJobPosting?: (rawPosting: string) => Promise<ClassifiedJobPosting>;
  matchJob?: (job: JobForMatching, profile: ProfileForMatching) => Promise<MatchResult>;
  upsertJobs: (jobs: UpsertJobPayload[]) => Promise<StoredDiscoveredJob[]>;
};

export type JobDiscoveryWorkflowOptions = {
  eventBus?: EventBus<CareerEventMap>;
  searchQueries?: SearchQuery[];
  profile?: ProfileForMatching;
  matchRules?: MatchRules;
  onEnrichmentError?: (error: unknown, job: DiscoveredJob) => void;
};

export type JobDiscoveryWorkflowResult = {
  queries: number;
  discovered: number;
  stored: number;
  jobs: UpsertJobPayload[];
};

export async function runJobDiscoveryWorkflow(
  dependencies: JobDiscoveryWorkflowDependencies,
  options: JobDiscoveryWorkflowOptions = {},
): Promise<JobDiscoveryWorkflowResult> {
  let discovered = 0;
  let stored = 0;
  const discoveredJobs: UpsertJobPayload[] = [];
  const searchQueries = options.searchQueries ?? dependencies.searchQueries;

  for (const query of searchQueries) {
    const jobs = await discoverJobsForPersistence(dependencies, query, options);
    discovered += jobs.length;
    discoveredJobs.push(...jobs);

    if (jobs.length === 0) {
      continue;
    }

    const storedJobs = await dependencies.upsertJobs(jobs);
    stored += storedJobs.length;
    for (const [index, job] of storedJobs.entries()) {
      const sourceJob = jobs[index];
      const event: CareerEventMap["job.discovered"] = {
        jobId: job.id,
        platform: job.platform,
        title: job.title,
        companyName: job.company_name,
      };
      if (sourceJob?.match_score !== null && sourceJob?.match_score !== undefined) {
        event.matchScore = sourceJob.match_score;
      }
      if (sourceJob?.ai_priority !== null && sourceJob?.ai_priority !== undefined) {
        event.priority = sourceJob.ai_priority;
      }
      if (sourceJob?.should_apply !== null && sourceJob?.should_apply !== undefined) {
        event.shouldApply = sourceJob.should_apply;
      }
      options.eventBus?.emit("job.discovered", event);
    }
  }

  return {
    queries: searchQueries.length,
    discovered,
    stored,
    jobs: discoveredJobs,
  };
}

async function discoverJobsForPersistence(
  dependencies: JobDiscoveryWorkflowDependencies,
  query: SearchQuery,
  options: JobDiscoveryWorkflowOptions,
): Promise<UpsertJobPayload[]> {
  if (!dependencies.search) {
    return dependencies.searchForPersistence(query);
  }

  const discoveredJobs = await dependencies.search(query);
  const shouldRunAiEnrichment = options.profile !== undefined;
  const classificationsByUrl = shouldRunAiEnrichment
    ? await classifyDiscoveredJobs(dependencies, discoveredJobs, options)
    : {};
  const unscoredJobs = mapDiscoveredJobsToUpsertJobs(discoveredJobs, {}, classificationsByUrl);
  const matchesByUrl = shouldRunAiEnrichment
    ? await matchDiscoveredJobs(dependencies, unscoredJobs, options)
    : {};
  const jobs = mapDiscoveredJobsToUpsertJobs(discoveredJobs, matchesByUrl, classificationsByUrl);

  return options.matchRules ? filterJobsByRules(jobs, options.matchRules).map((result) => result.job) : jobs;
}

async function classifyDiscoveredJobs(
  dependencies: Pick<JobDiscoveryWorkflowDependencies, "classifyJobPosting">,
  jobs: DiscoveredJob[],
  options: Pick<JobDiscoveryWorkflowOptions, "onEnrichmentError">,
): Promise<Record<string, ClassifiedJobPosting>> {
  if (!dependencies.classifyJobPosting) {
    return {};
  }

  const classifications: Record<string, ClassifiedJobPosting> = {};
  for (const job of jobs) {
    const rawPosting = [job.details.rawHtml, job.details.description, job.listing.rawHtml, job.listing.description]
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .join("\n\n");
    if (!rawPosting) {
      continue;
    }

    try {
      classifications[job.listing.url] = await dependencies.classifyJobPosting(rawPosting);
    } catch (error) {
      options.onEnrichmentError?.(error, job);
    }
  }

  return classifications;
}

async function matchDiscoveredJobs(
  dependencies: Pick<JobDiscoveryWorkflowDependencies, "matchJob">,
  jobs: UpsertJobPayload[],
  options: Pick<JobDiscoveryWorkflowOptions, "profile">,
): Promise<Record<string, DiscoveryMatchResult>> {
  if (!dependencies.matchJob || !options.profile) {
    return {};
  }

  const matches: Record<string, DiscoveryMatchResult> = {};
  for (const job of jobs) {
    try {
      const match = await dependencies.matchJob(
        {
          title: job.title,
          description: job.description ?? job.raw_html ?? "",
        },
        options.profile,
      );
      matches[job.url] = {
        score: match.score,
        confidence: match.confidence,
        reasoning: match.reasoning,
        matchedSkills: match.matchedSkills,
        missingSkills: match.missingSkills,
        tags: match.tags,
        shouldApply: match.shouldApply,
        priority: match.priority,
      };
    } catch {
      // Discovery should still persist usable jobs if AI matching is temporarily unavailable.
    }
  }

  return matches;
}
