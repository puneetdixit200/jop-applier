import { describe, expect, it } from "vitest";
import { DiscoveryManager } from "./discovery-manager.js";
import type {
  ConnectorHealth,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
} from "./connectors/connector-interface.js";

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
    return {
      url,
      description: `Detailed posting for ${url}`,
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
});

