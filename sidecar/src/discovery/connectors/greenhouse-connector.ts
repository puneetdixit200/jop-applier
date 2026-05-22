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

type GreenhouseConnectorConfig = {
  boardToken: string;
  fetch?: FetchLike;
};

type GreenhouseJob = {
  id: number | string;
  title?: string;
  absolute_url?: string;
  location?: { name?: string };
  content?: string;
  updated_at?: string;
};

export class GreenhouseConnector implements JobConnector {
  readonly name: string;
  readonly platform = "greenhouse";
  readonly rateLimit = { requests: 30, perSeconds: 60 };
  private readonly boardToken: string;
  private readonly fetchClient: FetchLike;

  constructor(config: GreenhouseConnectorConfig) {
    this.boardToken = config.boardToken;
    this.name = `Greenhouse ${config.boardToken}`;
    this.fetchClient = config.fetch ?? fetch;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    const jobs = await this.fetchJobs();
    for (const job of jobs) {
      const listing = this.toListing(job);
      if (listing && matchesQuery(listing, query)) {
        yield listing;
      }
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const jobs = await this.fetchJobs();
    const job = jobs.find((candidate) => candidate.absolute_url === url);
    const rawHtml = job?.content ?? "";

    return {
      url,
      description: stripHtml(rawHtml),
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
    const jobs = await this.fetchJobs();
    return {
      ok: true,
      message: `Greenhouse ${this.boardToken} returned ${jobs.length} jobs`,
    };
  }

  private async fetchJobs(): Promise<GreenhouseJob[]> {
    const response = await this.fetchClient(
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(this.boardToken)}/jobs?content=true`,
    );
    if (!response.ok) {
      throw new Error(`Greenhouse board fetch failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { jobs?: unknown };
    return Array.isArray(payload.jobs) ? payload.jobs.filter(isGreenhouseJob) : [];
  }

  private toListing(job: GreenhouseJob): RawJobListing | null {
    const title = nonEmptyString(job.title);
    const url = nonEmptyString(job.absolute_url);
    if (!title || !url) {
      return null;
    }

    return {
      sourceId: String(job.id),
      platform: this.platform,
      url,
      title,
      company: this.boardToken,
      location: nonEmptyString(job.location?.name) ?? "Unknown",
      description: stripHtml(job.content ?? ""),
      rawHtml: job.content ?? "",
      postedDate: parseDate(job.updated_at),
    };
  }
}

function isGreenhouseJob(value: unknown): value is GreenhouseJob {
  return typeof value === "object" && value !== null && "id" in value;
}

function matchesQuery(listing: RawJobListing, query: SearchQuery): boolean {
  const haystack = `${listing.title} ${listing.company} ${listing.location} ${listing.description ?? ""}`.toLowerCase();
  if (query.keywords.length > 0 && !query.keywords.every((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return false;
  }
  if (query.remote && !listing.location.toLowerCase().includes("remote")) {
    return false;
  }
  if (query.location && !listing.location.toLowerCase().includes(query.location.toLowerCase())) {
    return false;
  }

  return true;
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

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
