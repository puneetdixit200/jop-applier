import type {
  ConnectorHealth,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
} from "./connectors/connector-interface.js";
import { deduplicateListings } from "./deduplicator.js";
import {
  mapDiscoveredJobsToUpsertJobs,
  type DiscoveryMatchResult,
  type UpsertJobPayload,
} from "./job-persistence.js";
import { filterJobsByRules, type MatchRules } from "./matching/rule-matcher.js";

export type DiscoveredJob = {
  listing: RawJobListing;
  details: RawJobDetails;
};

export class DiscoveryManager {
  private readonly connectors: JobConnector[];
  private readonly connectorByListingUrl = new Map<string, JobConnector>();

  constructor(connectors: JobConnector[]) {
    this.connectors = connectors;
  }

  async search(query: SearchQuery): Promise<DiscoveredJob[]> {
    const listings: RawJobListing[] = [];

    for (const connector of this.enabledConnectors(query)) {
      for await (const listing of connector.search(query)) {
        this.connectorByListingUrl.set(listing.url, connector);
        listings.push(listing);
      }
    }

    const uniqueListings = deduplicateListings(listings);
    const discovered: DiscoveredJob[] = [];

    for (const listing of uniqueListings) {
      const connector = this.connectorForListing(listing);
      const details = await connector.getJobDetails(listing.url);
      discovered.push({ listing, details });
    }

    return discovered;
  }

  async health(): Promise<Record<string, ConnectorHealth>> {
    const entries = await Promise.all(
      this.connectors.map(async (connector) => [connector.platform, await connector.healthCheck()] as const),
    );
    return Object.fromEntries(entries);
  }

  async searchForPersistence(
    query: SearchQuery,
    matchesByUrl: Record<string, DiscoveryMatchResult> = {},
    rules?: MatchRules,
  ): Promise<UpsertJobPayload[]> {
    const jobs = mapDiscoveredJobsToUpsertJobs(await this.search(query), matchesByUrl);
    return rules ? filterJobsByRules(jobs, rules).map((result) => result.job) : jobs;
  }

  private enabledConnectors(query: SearchQuery): JobConnector[] {
    if (!query.companies && !query.excludeCompanies) {
      return this.connectors;
    }

    return this.connectors;
  }

  private connectorForListing(listing: RawJobListing): JobConnector {
    const exactConnector = this.connectorByListingUrl.get(listing.url);
    if (exactConnector) {
      return exactConnector;
    }

    const connector = this.connectors.find((candidate) => candidate.platform === listing.platform);
    if (!connector) {
      throw new Error(`No connector registered for platform: ${listing.platform}`);
    }
    return connector;
  }
}
