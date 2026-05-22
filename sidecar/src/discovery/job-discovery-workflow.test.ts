import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { SearchQuery } from "./connectors/connector-interface.js";
import type { DiscoveredJob } from "./discovery-manager.js";
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
      jobs: [
        expect.objectContaining({
          url: "https://jobs.example/react",
          title: "React Engineer",
          company_name: "Northstar Labs",
        }),
        expect.objectContaining({
          url: "https://jobs.example/ui",
          title: "UI Engineer",
          company_name: "Signal Ridge",
        }),
        expect.objectContaining({
          url: "https://jobs.example/node",
          title: "Node Engineer",
          company_name: "Southline Systems",
        }),
      ],
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

  it("classifies, matches, filters, and persists discovered jobs when AI context is configured", async () => {
    const discovered: DiscoveredJob[] = [
      {
        listing: {
          sourceId: "source-1",
          platform: "linkedin",
          url: "https://jobs.example/react",
          title: "React role",
          company: "Northstar Labs",
          location: "Remote",
          rawHtml: "<article>React internship</article>",
        },
        details: {
          url: "https://jobs.example/react",
          description: "Build React tools with TypeScript.",
          requirements: ["React"],
          rawHtml: "<main>React TypeScript internship</main>",
        },
      },
      {
        listing: {
          sourceId: "source-2",
          platform: "linkedin",
          url: "https://jobs.example/senior",
          title: "Senior frontend role",
          company: "Northstar Labs",
          location: "Remote",
        },
        details: {
          url: "https://jobs.example/senior",
          description: "Requires React, TypeScript, and 10+ years of experience.",
          requirements: ["React", "TypeScript"],
        },
      },
    ];
    const persisted: UpsertJobPayload[][] = [];

    const result = await runJobDiscoveryWorkflow(
      {
        searchQueries: [{ keywords: ["react"] }],
        searchForPersistence: async () => [],
        search: async () => discovered,
        classifyJobPosting: async (rawPosting) => ({
          title: rawPosting.includes("internship") ? "Frontend Engineer Intern" : "Senior Frontend Engineer",
          companyName: "Northstar Labs",
          location: "Remote",
          description: rawPosting.includes("internship")
            ? "Build React tools with TypeScript."
            : "Requires React, TypeScript, and 10+ years of experience.",
          requirements: ["React", "TypeScript"],
          jobType: rawPosting.includes("internship") ? "internship" : "fulltime",
          experienceLevel: rawPosting.includes("internship") ? "entry" : "senior",
          remote: true,
        }),
        matchJob: async (matchJob) => ({
          score: matchJob.title.includes("Intern") ? 92 : 64,
          confidence: 0.88,
          reasoning: "React and TypeScript fit",
          matchedSkills: ["React", "TypeScript"],
          missingSkills: [],
          tags: ["good-fit"],
          shouldApply: matchJob.title.includes("Intern"),
          priority: matchJob.title.includes("Intern") ? "high" : "medium",
        }),
        upsertJobs: async (jobs) => {
          persisted.push(jobs);
          return jobs.map((candidate): StoredDiscoveredJob => ({
            id: candidate.source_id ?? candidate.url,
            platform: candidate.platform,
            title: candidate.title,
            company_name: candidate.company_name,
          }));
        },
      },
      {
        profile: {
          headline: "React TypeScript engineer",
          skills: ["React", "TypeScript"],
        },
        matchRules: {
          mustHaveKeywords: ["React", "TypeScript"],
          mustNotHaveKeywords: ["10+ years"],
          locations: [],
          remoteOnly: true,
          maxExperienceYears: 2,
          companyBlacklist: [],
          companyWhitelist: [],
        },
      },
    );

    expect(result.stored).toBe(1);
    expect(persisted).toEqual([
      [
        expect.objectContaining({
          title: "Frontend Engineer Intern",
          job_type: "internship",
          experience_level: "entry",
          match_score: 92,
          match_confidence: 0.88,
          matched_skills: ["React", "TypeScript"],
          should_apply: true,
          ai_priority: "high",
        }),
      ],
    ]);
  });
});
