import type { FetchLike } from "../../ai/providers/http.js";
import type {
  ConnectorHealth,
  Credentials,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
  Session,
} from "./connector-interface.js";

type LeverConnectorConfig = {
  company: string;
  fetch?: FetchLike;
};

type LeverPosting = {
  id?: string;
  text?: string;
  hostedUrl?: string;
  categories?: {
    location?: string;
    commitment?: string;
    team?: string;
  };
  descriptionPlain?: string;
  lists?: Array<{ text?: string; content?: string }>;
  createdAt?: number;
};

export class LeverConnector implements JobConnector {
  readonly name: string;
  readonly platform = "lever";
  readonly rateLimit = { requests: 30, perSeconds: 60 };
  private readonly company: string;
  private readonly fetchClient: FetchLike;

  constructor(config: LeverConnectorConfig) {
    this.company = config.company;
    this.name = `Lever ${config.company}`;
    this.fetchClient = config.fetch ?? fetch;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    const postings = await this.fetchPostings();
    for (const posting of postings) {
      const listing = this.toListing(posting);
      if (listing && matchesQuery(listing, posting, query)) {
        yield listing;
      }
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const postings = await this.fetchPostings();
    const posting = postings.find((candidate) => candidate.hostedUrl === url);
    const rawHtml = posting?.lists?.map((list) => list.content ?? "").join("\n") ?? "";

    return {
      url,
      description: posting?.descriptionPlain ?? stripHtml(rawHtml),
      requirements: listItems(rawHtml),
      rawHtml,
    };
  }

  async login(_credentials: Credentials): Promise<Session> {
    return { connector: this.platform, authenticatedAt: new Date() };
  }

  async isLoggedIn(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const postings = await this.fetchPostings();
    return {
      ok: true,
      message: `Lever ${this.company} returned ${postings.length} postings`,
    };
  }

  private async fetchPostings(): Promise<LeverPosting[]> {
    const response = await this.fetchClient(
      `https://api.lever.co/v0/postings/${encodeURIComponent(this.company)}?mode=json`,
    );
    if (!response.ok) {
      throw new Error(`Lever postings fetch failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    return Array.isArray(payload) ? payload.filter(isLeverPosting) : [];
  }

  private toListing(posting: LeverPosting): RawJobListing | null {
    const sourceId = nonEmptyString(posting.id);
    const title = nonEmptyString(posting.text);
    const url = nonEmptyString(posting.hostedUrl);
    if (!sourceId || !title || !url) {
      return null;
    }

    return {
      sourceId,
      platform: this.platform,
      url,
      title,
      company: this.company,
      location: nonEmptyString(posting.categories?.location) ?? "Unknown",
      description: posting.descriptionPlain ?? "",
      rawHtml: posting.lists?.map((list) => list.content ?? "").join("\n") ?? "",
      postedDate: typeof posting.createdAt === "number" ? new Date(posting.createdAt) : undefined,
    };
  }
}

function matchesQuery(
  listing: RawJobListing,
  posting: LeverPosting,
  query: SearchQuery,
): boolean {
  const haystack = [
    listing.title,
    listing.company,
    listing.location,
    listing.description ?? "",
    posting.categories?.team ?? "",
    posting.categories?.commitment ?? "",
  ].join(" ").toLowerCase();
  if (query.keywords.length > 0 && !query.keywords.every((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return false;
  }
  if (query.location && !listing.location.toLowerCase().includes(query.location.toLowerCase())) {
    return false;
  }
  if (query.remote && !listing.location.toLowerCase().includes("remote")) {
    return false;
  }
  if (query.jobType && !matchesJobType(posting.categories?.commitment, query.jobType)) {
    return false;
  }

  return true;
}

function matchesJobType(commitment: string | undefined, jobType: SearchQuery["jobType"]): boolean {
  if (!jobType || !commitment) {
    return true;
  }

  return commitment.toLowerCase().replace(/[^a-z]/g, "").includes(jobType.replace(/[^a-z]/g, ""));
}

function isLeverPosting(value: unknown): value is LeverPosting {
  return typeof value === "object" && value !== null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function listItems(value: string): string[] {
  return [...value.matchAll(/<li[^>]*>(.*?)<\/li>/gis)]
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
