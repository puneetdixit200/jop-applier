import type {
  ConnectorHealth,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
} from "./connectors/connector-interface.js";
import { deduplicateListings } from "./deduplicator.js";

export type DiscoveredJob = {
  listing: RawJobListing;
  details: RawJobDetails;
};

export class DiscoveryManager {
  private readonly connectors: JobConnector[];

  constructor(connectors: JobConnector[]) {
    this.connectors = connectors;
  }

  async search(query: SearchQuery): Promise<DiscoveredJob[]> {
    const listings: RawJobListing[] = [];

    for (const connector of this.enabledConnectors(query)) {
      for await (const listing of connector.search(query)) {
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

  private enabledConnectors(query: SearchQuery): JobConnector[] {
    if (!query.companies && !query.excludeCompanies) {
      return this.connectors;
    }

    return this.connectors;
  }

  private connectorForListing(listing: RawJobListing): JobConnector {
    const connector = this.connectors.find((candidate) => candidate.platform === listing.platform);
    if (!connector) {
      throw new Error(`No connector registered for platform: ${listing.platform}`);
    }
    return connector;
  }
}

