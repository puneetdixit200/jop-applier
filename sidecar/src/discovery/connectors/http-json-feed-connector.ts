import type {
  ConnectorHealth,
  Credentials,
  JobConnector,
  RawJobDetails,
  RawJobListing,
  RateLimit,
  SearchQuery,
  Session,
} from "./connector-interface.js";

export type HttpJsonFeedSource = {
  id: string;
  name?: string;
  platform?: string;
  url: string;
  headers?: Record<string, string>;
};

type FeedJobRecord = {
  id?: unknown;
  sourceId?: unknown;
  url?: unknown;
  title?: unknown;
  company?: unknown;
  companyName?: unknown;
  location?: unknown;
  remote?: unknown;
  salary?: unknown;
  description?: unknown;
  requirements?: unknown;
  rawHtml?: unknown;
  jobType?: unknown;
  experienceLevel?: unknown;
};

type NormalizedFeedJob = {
  sourceId: string;
  platform: string;
  url: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  salary?: string;
  description?: string;
  requirements?: string[];
  rawHtml?: string;
  jobType?: string;
  experienceLevel?: string;
};

export class HttpJsonFeedConnector implements JobConnector {
  readonly name: string;
  readonly platform: string;
  readonly rateLimit: RateLimit = { requests: 60, perSeconds: 60 };

  private readonly detailsByUrl = new Map<string, NormalizedFeedJob>();

  constructor(private readonly source: HttpJsonFeedSource) {
    this.name = source.name ?? source.id;
    this.platform = source.platform ?? source.id;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    for (const job of await this.loadJobs()) {
      if (!matchesQuery(job, query)) {
        continue;
      }

      this.detailsByUrl.set(job.url, job);
      yield toRawListing(job);
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const job = this.detailsByUrl.get(url) ?? (await this.loadJobs()).find((candidate) => candidate.url === url);
    return {
      url,
      description: job?.description ?? "",
      requirements: job?.requirements,
      rawHtml: job?.rawHtml,
    };
  }

  async login(_credentials: Credentials): Promise<Session> {
    return { connector: this.name, authenticatedAt: new Date() };
  }

  async isLoggedIn(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      const response = await fetch(this.source.url, { headers: this.source.headers ?? {} });
      return {
        ok: response.ok,
        message: response.ok
          ? `${this.name} feed is reachable`
          : `${this.name} feed returned ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async loadJobs(): Promise<NormalizedFeedJob[]> {
    const response = await fetch(this.source.url, { headers: this.source.headers ?? {} });
    if (!response.ok) {
      throw new Error(`${this.name} feed returned ${response.status}`);
    }

    const payload = await response.json();
    return extractFeedRecords(payload)
      .map((record) => normalizeFeedJob(this.source, this.platform, record))
      .filter((job): job is NormalizedFeedJob => job !== null);
  }
}

function extractFeedRecords(payload: unknown): FeedJobRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["jobs", "items", "listings"]) {
    const value = (payload as Record<string, unknown>)[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function normalizeFeedJob(
  source: HttpJsonFeedSource,
  platform: string,
  record: FeedJobRecord,
): NormalizedFeedJob | null {
  const url = text(record.url);
  const title = text(record.title);
  const company = text(record.company) ?? text(record.companyName);
  if (!url || !title || !company) {
    return null;
  }

  const sourceId = text(record.sourceId) ?? text(record.id) ?? url;
  const location = text(record.location) ?? (record.remote === true ? "Remote" : "Location unknown");

  return {
    sourceId: `${source.id}:${sourceId}`,
    platform,
    url,
    title,
    company,
    location,
    remote: record.remote === true || /\bremote\b/i.test(location),
    salary: text(record.salary),
    description: text(record.description),
    requirements: stringArray(record.requirements),
    rawHtml: text(record.rawHtml),
    jobType: text(record.jobType),
    experienceLevel: text(record.experienceLevel),
  };
}

function toRawListing(job: NormalizedFeedJob): RawJobListing {
  return {
    sourceId: job.sourceId,
    platform: job.platform,
    url: job.url,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    description: job.description,
    rawHtml: job.rawHtml,
  };
}

function matchesQuery(job: NormalizedFeedJob, query: SearchQuery): boolean {
  if (query.remote === true && !job.remote) {
    return false;
  }
  if (query.location && !job.location.toLowerCase().includes(query.location.toLowerCase()) && !job.remote) {
    return false;
  }
  if (query.experienceLevel && job.experienceLevel && job.experienceLevel !== query.experienceLevel) {
    return false;
  }
  if (query.jobType && job.jobType && job.jobType !== query.jobType) {
    return false;
  }
  if (query.companies?.length && !includesNormalized(query.companies, job.company)) {
    return false;
  }
  if (query.excludeCompanies?.length && includesNormalized(query.excludeCompanies, job.company)) {
    return false;
  }

  const searchableText = [
    job.title,
    job.company,
    job.location,
    job.description,
    ...(job.requirements ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return query.keywords.every((keyword) => searchableText.includes(keyword.toLowerCase()));
}

function includesNormalized(values: string[], candidate: string): boolean {
  return values.some((value) => candidate.toLowerCase().includes(value.toLowerCase()));
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

function isRecord(value: unknown): value is FeedJobRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
