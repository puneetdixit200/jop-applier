import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { SearchQuery } from "./connectors/connector-interface.js";
import { runJobDiscoveryWorkflow, type StoredDiscoveredJob } from "./job-discovery-workflow.js";
import type { UpsertJobPayload } from "./job-persistence.js";

function job(overrides: Partial<UpsertJobPayload>): UpsertJobPayload {
  return {
    source_id: null,
    platform: "linkedin",
    url: "https://jobs.example/job",
    title: "Frontend Engineer",
    company_name: "Northstar Labs",
    location: "Remote",
    is_remote: true,
    salary_min: null,
    salary_max: null,
    salary_currency: "INR",
    job_type: null,
    experience_level: null,
    description: null,
    requirements: [],
    raw_html: null,
    match_score: null,
    match_confidence: null,
    match_reasoning: null,
    matched_skills: [],
    missing_skills: [],
    ai_tags: [],
    should_apply: null,
    ai_priority: null,
    ...overrides,
  };
}

describe("job discovery workflow", () => {
  it("searches configured queries, persists discovered jobs, and emits job events", async () => {
    const queries: SearchQuery[] = [
      { keywords: ["react"], remote: true },
      { keywords: ["node"], location: "Bengaluru" },
    ];
    const searchedQueries: SearchQuery[] = [];
    const persistedBatches: string[][] = [];
    const discoveredEvents: Array<CareerEventMap["job.discovered"]> = [];
    const bus = new EventBus<CareerEventMap>();

    bus.on("job.discovered", (event) => discoveredEvents.push(event));

    const result = await runJobDiscoveryWorkflow(
      {
        searchQueries: queries,
        searchForPersistence: async (query) => {
          searchedQueries.push(query);
          if (query.keywords.includes("react")) {
            return [
              job({
                url: "https://jobs.example/react",
                title: "React Engineer",
                company_name: "Northstar Labs",
              }),
              job({
                url: "https://jobs.example/ui",
                title: "UI Engineer",
                company_name: "Signal Ridge",
              }),
            ];
          }

          return [
            job({
              platform: "indeed",
              url: "https://jobs.example/node",
              title: "Node Engineer",
              company_name: "Southline Systems",
            }),
          ];
        },
        upsertJobs: async (jobs) => {
          persistedBatches.push(jobs.map((candidate) => candidate.url));
          return jobs.map(
            (candidate, index): StoredDiscoveredJob => ({
              id: `${candidate.platform}-${index}-${candidate.title.toLowerCase().replace(/\s+/g, "-")}`,
              platform: candidate.platform,
              title: candidate.title,
              company_name: candidate.company_name,
            }),
          );
        },
      },
      { eventBus: bus },
    );

    expect(result).toEqual({
      queries: 2,
      discovered: 3,
      stored: 3,
    });
    expect(searchedQueries).toEqual(queries);
    expect(persistedBatches).toEqual([
      ["https://jobs.example/react", "https://jobs.example/ui"],
      ["https://jobs.example/node"],
    ]);
    expect(discoveredEvents).toEqual([
      {
        jobId: "linkedin-0-react-engineer",
        platform: "linkedin",
        title: "React Engineer",
        companyName: "Northstar Labs",
      },
      {
        jobId: "linkedin-1-ui-engineer",
        platform: "linkedin",
        title: "UI Engineer",
        companyName: "Signal Ridge",
      },
      {
        jobId: "indeed-0-node-engineer",
        platform: "indeed",
        title: "Node Engineer",
        companyName: "Southline Systems",
      },
    ]);
  });
});
