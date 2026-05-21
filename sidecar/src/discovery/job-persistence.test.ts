import { describe, expect, it } from "vitest";
import type { DiscoveredJob } from "./discovery-manager.js";
import { mapDiscoveredJobToUpsertJob, mapDiscoveredJobsToUpsertJobs } from "./job-persistence.js";

const discoveredJob: DiscoveredJob = {
  listing: {
    sourceId: "linkedin-1",
    platform: "linkedin",
    url: "https://linkedin.example/jobs/1",
    title: "Frontend Engineer Intern",
    company: "Northstar Labs",
    location: "Remote",
    salary: "900000 - 1400000 INR",
    description: "List view summary",
    rawHtml: "<article>summary</article>",
  },
  details: {
    url: "https://linkedin.example/jobs/1",
    description: "Detailed React and TypeScript internship",
    requirements: ["React", "TypeScript"],
    rawHtml: "<main>full details</main>",
  },
};

describe("job persistence mapping", () => {
  it("maps discovered jobs to the Tauri job upsert payload", () => {
    expect(
      mapDiscoveredJobToUpsertJob(discoveredJob, {
        score: 91,
        reasoning: "Strong React and TypeScript match",
        matchedSkills: ["React", "TypeScript"],
        missingSkills: ["GraphQL"],
        tags: ["good-fit", "internship"],
        priority: "high",
      }),
    ).toEqual({
      source_id: "linkedin-1",
      platform: "linkedin",
      url: "https://linkedin.example/jobs/1",
      title: "Frontend Engineer Intern",
      company_name: "Northstar Labs",
      location: "Remote",
      is_remote: true,
      salary_min: 900000,
      salary_max: 1400000,
      salary_currency: "INR",
      job_type: null,
      experience_level: null,
      description: "Detailed React and TypeScript internship",
      requirements: ["React", "TypeScript"],
      raw_html: "<main>full details</main>",
      match_score: 91,
      match_reasoning: "Strong React and TypeScript match",
      matched_skills: ["React", "TypeScript"],
      missing_skills: ["GraphQL"],
      ai_tags: ["good-fit", "internship"],
      ai_priority: "high",
    });
  });

  it("uses listing details and unscored defaults when enrichment is missing", () => {
    expect(
      mapDiscoveredJobToUpsertJob({
        listing: {
          ...discoveredJob.listing,
          sourceId: "",
          salary: undefined,
        },
        details: {
          url: discoveredJob.listing.url,
          description: "",
        },
      }),
    ).toMatchObject({
      source_id: null,
      description: "List view summary",
      requirements: [],
      raw_html: "<article>summary</article>",
      salary_min: null,
      salary_max: null,
      salary_currency: "INR",
      match_score: null,
      matched_skills: [],
      missing_skills: [],
      ai_tags: [],
      ai_priority: null,
    });
  });

  it("maps discovery batches with match results keyed by URL", () => {
    expect(
      mapDiscoveredJobsToUpsertJobs([discoveredJob], {
        [discoveredJob.listing.url]: {
          score: 72,
          reasoning: "Some overlap",
          matchedSkills: ["React"],
          missingSkills: ["Rust"],
          tags: ["stretch"],
          priority: "medium",
        },
      }),
    ).toHaveLength(1);
    expect(
      mapDiscoveredJobsToUpsertJobs([discoveredJob], {
        [discoveredJob.listing.url]: {
          score: 72,
          reasoning: "Some overlap",
          matchedSkills: ["React"],
          missingSkills: ["Rust"],
          tags: ["stretch"],
          priority: "medium",
        },
      })[0].ai_priority,
    ).toBe("medium");
  });
});

