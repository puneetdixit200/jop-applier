import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { SearchQuery } from "./connectors/connector-interface.js";
import type { UpsertJobPayload } from "./job-persistence.js";

export type StoredDiscoveredJob = {
  id: string;
  platform: string;
  title: string;
  company_name: string;
};

export type JobDiscoveryWorkflowDependencies = {
  searchQueries: SearchQuery[];
  searchForPersistence: (query: SearchQuery) => Promise<UpsertJobPayload[]>;
  upsertJobs: (jobs: UpsertJobPayload[]) => Promise<StoredDiscoveredJob[]>;
};

export type JobDiscoveryWorkflowOptions = {
  eventBus?: EventBus<CareerEventMap>;
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

  for (const query of dependencies.searchQueries) {
    const jobs = await dependencies.searchForPersistence(query);
    discovered += jobs.length;
    discoveredJobs.push(...jobs);

    if (jobs.length === 0) {
      continue;
    }

    const storedJobs = await dependencies.upsertJobs(jobs);
    stored += storedJobs.length;
    for (const job of storedJobs) {
      options.eventBus?.emit("job.discovered", {
        jobId: job.id,
        platform: job.platform,
        title: job.title,
        companyName: job.company_name,
      });
    }
  }

  return {
    queries: dependencies.searchQueries.length,
    discovered,
    stored,
    jobs: discoveredJobs,
  };
}
