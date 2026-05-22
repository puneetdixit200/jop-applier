import type { FetchLike } from "../../ai/providers/http.js";
import { trimTrailingSlash } from "../../ai/providers/http.js";
import type {
  ConnectorHealth,
  Credentials,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  SearchQuery,
  Session,
} from "./connector-interface.js";

type WorkdayConnectorConfig = {
  tenant: string;
  site: string;
  baseUrl?: string;
  fetch?: FetchLike;
  pageSize?: number;
};

type WorkdaySearchResponse = {
  jobPostings?: unknown;
};

type WorkdayJobPosting = {
  id?: string;
  title?: string;
  externalPath?: string;
  locationsText?: string;
  jobDescription?: string;
  bulletFields?: string[];
  postedOn?: string;
  timeType?: string;
};

export class WorkdayConnector implements JobConnector {
  readonly name: string;
  readonly platform = "workday";
  readonly rateLimit = { requests: 20, perSeconds: 60 };
  private readonly tenant: string;
  private readonly site: string;
  private readonly baseUrl: string;
  private readonly fetchClient: FetchLike;
  private readonly pageSize: number;

  constructor(config: WorkdayConnectorConfig) {
    this.tenant = config.tenant;
    this.site = config.site;
    this.name = `Workday ${config.tenant}/${config.site}`;
    this.baseUrl = trimTrailingSlash(
      config.baseUrl ?? `https://${config.tenant}.wd1.myworkdayjobs.com`,
    );
    this.fetchClient = config.fetch ?? fetch;
    this.pageSize = config.pageSize ?? 50;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    const postings = await this.fetchPostings(query);
    for (const posting of postings) {
      const listing = this.toListing(posting);
      if (listing && matchesQuery(listing, posting, query)) {
        yield listing;
      }
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const postings = await this.fetchPostings({ keywords: [] });
    const posting = postings.find((candidate) => this.postingUrl(candidate) === url);
    const rawHtml = posting?.jobDescription ?? "";

    return {
      url,
      description: stripHtml(rawHtml || (posting?.bulletFields ?? []).join(" ")),
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
    const postings = await this.fetchPostings({ keywords: [] });
    return {
      ok: true,
      message: `Workday ${this.tenant}/${this.site} returned ${postings.length} postings`,
    };
  }

  private async fetchPostings(query: SearchQuery): Promise<WorkdayJobPosting[]> {
    const response = await this.fetchClient(
      `${this.baseUrl}/wday/cxs/${encodeURIComponent(this.tenant)}/${encodeURIComponent(this.site)}/jobs`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appliedFacets: {},
          limit: this.pageSize,
          offset: 0,
          searchText: query.keywords.join(" "),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Workday jobs fetch failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as WorkdaySearchResponse;
    return Array.isArray(payload.jobPostings)
      ? payload.jobPostings.filter(isWorkdayJobPosting)
      : [];
  }

  private toListing(posting: WorkdayJobPosting): RawJobListing | null {
    const title = nonEmptyString(posting.title);
    const url = this.postingUrl(posting);
    if (!title || !url) {
      return null;
    }

    return {
      sourceId: nonEmptyString(posting.id) ?? posting.externalPath ?? url,
      platform: this.platform,
      url,
      title,
      company: this.tenant,
      location: nonEmptyString(posting.locationsText) ?? "Unknown",
      description: stripHtml(posting.jobDescription ?? (posting.bulletFields ?? []).join(" ")),
      rawHtml: posting.jobDescription ?? "",
      postedDate: parseDate(posting.postedOn),
    };
  }

  private postingUrl(posting: WorkdayJobPosting): string | null {
    const externalPath = nonEmptyString(posting.externalPath);
    if (!externalPath) {
      return null;
    }

    return new URL(externalPath, `${this.baseUrl}/`).toString();
  }
}

function matchesQuery(
  listing: RawJobListing,
  posting: WorkdayJobPosting,
  query: SearchQuery,
): boolean {
  const haystack = [
    listing.title,
    listing.company,
    listing.location,
    listing.description ?? "",
    posting.timeType ?? "",
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
  if (query.jobType && !matchesJobType(posting.timeType, query.jobType)) {
    return false;
  }

  return true;
}

function matchesJobType(timeType: string | undefined, jobType: SearchQuery["jobType"]): boolean {
  if (!jobType || !timeType) {
    return true;
  }

  return normalize(timeType).includes(normalize(jobType));
}

function isWorkdayJobPosting(value: unknown): value is WorkdayJobPosting {
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

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, "");
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
