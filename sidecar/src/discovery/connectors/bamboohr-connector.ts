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

type BambooHrConnectorConfig = {
  subdomain: string;
  baseUrl?: string;
  apiKey?: string;
  fetch?: FetchLike;
};

type BambooHrJob = Record<string, unknown>;

type CachedBambooJobDetails = {
  description: string;
  requirements: string[];
  rawHtml: string;
};

export class BambooHrConnector implements JobConnector {
  readonly name: string;
  readonly platform = "bamboohr";
  readonly rateLimit = { requests: 20, perSeconds: 60 };

  private readonly subdomain: string;
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly fetchClient: FetchLike;
  private readonly detailsByUrl = new Map<string, CachedBambooJobDetails>();

  constructor(config: BambooHrConnectorConfig) {
    this.subdomain = config.subdomain;
    this.name = `BambooHR ${config.subdomain}`;
    this.baseUrl = trimTrailingSlash(
      config.baseUrl ?? `https://${config.subdomain}.bamboohr.com`,
    );
    this.apiKey = config.apiKey;
    this.fetchClient = config.fetch ?? fetch;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    for (const job of await this.fetchJobs()) {
      const listing = this.toListing(job);
      if (!listing || !matchesQuery(listing, job, query)) {
        continue;
      }

      this.detailsByUrl.set(listing.url, detailsFromJob(job));
      yield listing;
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const cached = this.detailsByUrl.get(url);
    if (cached && cached.rawHtml) {
      return { url, ...cached };
    }

    const response = await this.fetchClient(url);
    if (!response.ok) {
      throw new Error(`BambooHR job detail fetch failed with HTTP ${response.status}`);
    }
    const rawHtml = await response.text();

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
      message: `BambooHR ${this.subdomain} returned ${jobs.length} jobs`,
    };
  }

  private async fetchJobs(): Promise<BambooHrJob[]> {
    const response = await this.fetchClient(this.jobsUrl(), {
      headers: this.requestHeaders(),
    });
    if (!response.ok) {
      throw new Error(`BambooHR jobs fetch failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as unknown;

    return bambooJobsFromPayload(payload);
  }

  private jobsUrl(): string {
    if (this.apiKey) {
      return `${this.baseUrl}/api/v1/applicant_tracking/jobs?statusGroups=Open`;
    }

    return `${this.baseUrl}/careers/list`;
  }

  private requestHeaders(): Record<string, string> {
    if (!this.apiKey) {
      return { Accept: "application/json" };
    }

    return {
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${this.apiKey}:x`).toString("base64")}`,
    };
  }

  private toListing(job: BambooHrJob): RawJobListing | null {
    const id = textFromKeys(job, ["id", "jobOpeningId", "jobId", "postingId"]);
    const title = textFromKeys(job, ["jobOpeningName", "postingTitle", "title", "jobTitle"]);
    if (!id || !title) {
      return null;
    }
    const url =
      textFromKeys(job, ["url", "jobUrl", "postingUrl", "applyUrl"]) ??
      `${this.baseUrl}/careers/${encodeURIComponent(id)}`;
    const details = detailsFromJob(job);

    return {
      sourceId: id,
      platform: this.platform,
      url,
      title,
      company: this.subdomain,
      location: locationFromJob(job) ?? "Unknown",
      description: details.description,
      rawHtml: details.rawHtml,
      postedDate: parseDate(textFromKeys(job, ["datePosted", "createdDate", "lastUpdated"])),
    };
  }
}

function bambooJobsFromPayload(payload: unknown): BambooHrJob[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["result", "jobs", "data"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function detailsFromJob(job: BambooHrJob): CachedBambooJobDetails {
  const rawHtml =
    textFromKeys(job, ["description", "jobDescription", "postingDescription", "details"]) ?? "";

  return {
    description: stripHtml(rawHtml),
    requirements: listItems(rawHtml),
    rawHtml,
  };
}

function matchesQuery(
  listing: RawJobListing,
  job: BambooHrJob,
  query: SearchQuery,
): boolean {
  const haystack = [
    listing.title,
    listing.company,
    listing.location,
    listing.description ?? "",
    textFromKeys(job, ["department", "departmentLabel", "employmentStatus", "employmentType"]) ?? "",
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
  if (query.jobType && !haystack.includes(query.jobType.toLowerCase())) {
    return false;
  }

  return true;
}

function locationFromJob(job: BambooHrJob): string | null {
  const direct = textFromKeys(job, [
    "locationLabel",
    "locationName",
    "jobLocation",
    "location",
    "city",
  ]);
  if (direct) {
    return direct;
  }

  const location = job.location;
  if (!isRecord(location)) {
    return null;
  }

  const parts = [
    textFromKeys(location, ["city", "name", "label"]),
    textFromKeys(location, ["state", "stateName"]),
    textFromKeys(location, ["country", "countryName"]),
  ].filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(", ") : null;
}

function textFromKeys(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) {
      return value;
    }
  }

  return null;
}

function stripHtml(value: string): string {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listItems(value: string): string[] {
  return [...value.matchAll(/<li[^>]*>(.*?)<\/li>/gis)]
    .map((match) => stripHtml(match[1] ?? ""))
    .filter(Boolean);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function parseDate(value: string | undefined | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function text(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
