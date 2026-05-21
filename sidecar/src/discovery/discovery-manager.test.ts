import { describe, expect, it } from "vitest";
import { DiscoveryManager } from "./discovery-manager.js";
import type {
  ConnectorHealth,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
} from "./connectors/connector-interface.js";
import type { MatchRules } from "./matching/rule-matcher.js";
import type { DiscoveryMatchResult } from "./job-persistence.js";

class InMemoryConnector implements JobConnector {
  readonly name: string;
  readonly platform: string;
  readonly rateLimit = { requests: 1, perSeconds: 1 };

  constructor(platform: string, listings: RawJobListing[]) {
    this.name = `${platform} test connector`;
    this.platform = platform;
    this.listings = listings;
  }

  private readonly listings: RawJobListing[];

  async *search(_query: SearchQuery): AsyncGenerator<RawJobListing> {
    for (const listing of this.listings) {
      yield listing;
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const listing = this.listings.find((candidate) => candidate.url === url);
    return {
      url,
      description: listing?.description ?? `Detailed posting for ${url}`,
      requirements: ["React", "TypeScript"],
      rawHtml: "<main>Detailed posting</main>",
    };
  }

  async login() {
    return { connector: this.name, authenticatedAt: new Date("2026-01-01T00:00:00Z") };
  }

  async isLoggedIn() {
    return true;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    return { ok: true, message: "ready" };
  }
}

describe("DiscoveryManager", () => {
  it("searches enabled connectors, deduplicates results, and fetches details", async () => {
    const linkedinListing: RawJobListing = {
      sourceId: "linkedin-1",
      platform: "linkedin",
      url: "https://linkedin.example/jobs/1",
      title: "Frontend Engineer Intern",
      company: "Northstar Labs",
      location: "Remote",
    };
    const duplicateFromIndeed: RawJobListing = {
      sourceId: "",
      platform: "indeed",
      url: "https://indeed.example/jobs/a",
      title: "frontend engineer intern",
      company: "Northstar Labs",
      location: "Remote",
    };
    const backendListing: RawJobListing = {
      sourceId: "indeed-2",
      platform: "indeed",
      url: "https://indeed.example/jobs/b",
      title: "Backend Engineer",
      company: "Northstar Labs",
      location: "Bengaluru",
    };

    const manager = new DiscoveryManager([
      new InMemoryConnector("linkedin", [linkedinListing]),
      new InMemoryConnector("indeed", [duplicateFromIndeed, backendListing]),
    ]);

    await expect(
      manager.search({
        keywords: ["engineer"],
        remote: true,
      }),
    ).resolves.toEqual([
      {
        listing: linkedinListing,
        details: {
          url: linkedinListing.url,
          description: `Detailed posting for ${linkedinListing.url}`,
          requirements: ["React", "TypeScript"],
          rawHtml: "<main>Detailed posting</main>",
        },
      },
      {
        listing: backendListing,
        details: {
          url: backendListing.url,
          description: `Detailed posting for ${backendListing.url}`,
          requirements: ["React", "TypeScript"],
          rawHtml: "<main>Detailed posting</main>",
        },
      },
    ]);
  });

  it("reports connector health by platform", async () => {
    const manager = new DiscoveryManager([new InMemoryConnector("linkedin", [])]);

    await expect(manager.health()).resolves.toEqual({
      linkedin: { ok: true, message: "ready" },
    });
  });

  it("maps discovered jobs into persistence payloads", async () => {
    const listing: RawJobListing = {
      sourceId: "linkedin-1",
      platform: "linkedin",
      url: "https://linkedin.example/jobs/1",
      title: "Frontend Engineer Intern",
      company: "Northstar Labs",
      location: "Remote",
    };
    const match: DiscoveryMatchResult = {
      score: 91,
      confidence: 0.86,
      reasoning: "Strong match",
      matchedSkills: ["React"],
      missingSkills: [],
      tags: ["good-fit"],
      shouldApply: true,
      priority: "high",
    };
    const manager = new DiscoveryManager([new InMemoryConnector("linkedin", [listing])]);

    await expect(manager.searchForPersistence({ keywords: ["frontend"] }, { [listing.url]: match })).resolves.toEqual([
      expect.objectContaining({
        source_id: "linkedin-1",
        platform: "linkedin",
        title: "Frontend Engineer Intern",
        company_name: "Northstar Labs",
        match_score: 91,
        ai_priority: "high",
      }),
    ]);
  });

  it("filters persistence payloads with rule matching when rules are provided", async () => {
    const frontendListing: RawJobListing = {
      sourceId: "linkedin-1",
      platform: "linkedin",
      url: "https://linkedin.example/jobs/1",
      title: "Frontend Engineer Intern",
      company: "Northstar Labs",
      location: "Remote",
    };
    const seniorListing: RawJobListing = {
      sourceId: "linkedin-2",
      platform: "linkedin",
      url: "https://linkedin.example/jobs/2",
      title: "Senior Frontend Engineer",
      company: "Northstar Labs",
      location: "Remote",
      description: "Requires React, TypeScript, and 10+ years of experience.",
    };
    const rules: MatchRules = {
      mustHaveKeywords: ["React", "TypeScript"],
      mustNotHaveKeywords: ["10+ years"],
      locations: [],
      remoteOnly: true,
      maxExperienceYears: 2,
      companyBlacklist: [],
      companyWhitelist: [],
    };
    const manager = new DiscoveryManager([new InMemoryConnector("linkedin", [frontendListing, seniorListing])]);

    await expect(manager.searchForPersistence({ keywords: ["frontend"] }, {}, rules)).resolves.toEqual([
      expect.objectContaining({
        source_id: "linkedin-1",
        title: "Frontend Engineer Intern",
      }),
    ]);
  });
});
