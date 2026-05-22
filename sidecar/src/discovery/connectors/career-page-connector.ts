import type { FetchLike } from "../../ai/providers/http.js";
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

export type CareerPageSource = {
  id: string;
  name?: string;
  company?: string;
  platform?: string;
  url: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
};

type ParsedCareerJob = RawJobListing & {
  detailUrl: string;
};

export class CareerPageConnector implements JobConnector {
  readonly name: string;
  readonly platform: string;
  readonly rateLimit: RateLimit = { requests: 20, perSeconds: 60 };

  private readonly fetchClient: FetchLike;
  private readonly detailsByUrl = new Map<string, ParsedCareerJob>();

  constructor(private readonly source: CareerPageSource) {
    this.name = source.name ?? source.company ?? source.id;
    this.platform = source.platform ?? "company-career-page";
    this.fetchClient = source.fetch ?? fetch;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    for (const job of await this.loadJobs()) {
      if (!matchesQuery(job, query)) {
        continue;
      }

      this.detailsByUrl.set(job.url, job);
      yield {
        sourceId: job.sourceId,
        platform: job.platform,
        url: job.url,
        title: job.title,
        company: job.company,
        location: job.location,
        salary: job.salary,
        postedDate: job.postedDate,
        description: job.description,
        rawHtml: job.rawHtml,
      };
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const listing = this.detailsByUrl.get(url);
    const response = await this.fetchClient(listing?.detailUrl ?? url, {
      headers: this.source.headers ?? {},
    });
    if (!response.ok) {
      throw new Error(`${this.name} job detail returned HTTP ${response.status}`);
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
    return { connector: this.name, authenticatedAt: new Date() };
  }

  async isLoggedIn(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    try {
      const response = await this.fetchClient(this.source.url, { headers: this.source.headers ?? {} });
      return {
        ok: response.ok,
        message: response.ok
          ? `${this.name} career page is reachable`
          : `${this.name} career page returned ${response.status}`,
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async loadJobs(): Promise<ParsedCareerJob[]> {
    const response = await this.fetchClient(this.source.url, { headers: this.source.headers ?? {} });
    if (!response.ok) {
      throw new Error(`${this.name} career page returned HTTP ${response.status}`);
    }

    const html = await response.text();
    const jobs = jobsFromJsonLd(this.source, this.platform, html);
    return jobs.length > 0 ? jobs : jobsFromLinks(this.source, this.platform, html);
  }
}

function jobsFromJsonLd(
  source: CareerPageSource,
  platform: string,
  html: string,
): ParsedCareerJob[] {
  return jsonLdBlocks(html)
    .flatMap((block) => collectJobPostings(block))
    .map((record) => jobFromJsonLd(source, platform, record))
    .filter((job): job is ParsedCareerJob => job !== null);
}

function jobFromJsonLd(
  source: CareerPageSource,
  platform: string,
  record: Record<string, unknown>,
): ParsedCareerJob | null {
  const title = text(record.title);
  if (!title) {
    return null;
  }
  const url = absoluteUrl(text(record.url) ?? source.url, source.url);
  const company =
    textFromPath(record.hiringOrganization, "name") ??
    source.company ??
    source.name ??
    source.id;
  const location = jobLocation(record) ?? "Location unknown";
  const description = stripHtml(text(record.description) ?? "");

  return {
    sourceId: sourceIdForJsonLd(source, record, url),
    platform,
    url,
    detailUrl: url,
    title,
    company,
    location,
    description,
    rawHtml: text(record.description),
    postedDate: parseDate(text(record.datePosted)),
  };
}

function jobsFromLinks(
  source: CareerPageSource,
  platform: string,
  html: string,
): ParsedCareerJob[] {
  const jobs: ParsedCareerJob[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gis)) {
    const href = attribute(match[1] ?? "", "href");
    const title = stripHtml(match[2] ?? "");
    if (!href || !title || !looksLikeJobLink(href, title)) {
      continue;
    }
    const url = absoluteUrl(href, source.url);
    jobs.push({
      sourceId: `${source.id}:${url}`,
      platform,
      url,
      detailUrl: url,
      title,
      company: source.company ?? source.name ?? source.id,
      location: "Location unknown",
      description: title,
    });
  }

  return dedupeByUrl(jobs);
}

function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis)]
    .flatMap((match) => {
      try {
        return [JSON.parse(decodeEntities(match[1] ?? "")) as unknown];
      } catch {
        return [];
      }
    });
}

function collectJobPostings(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.flatMap(collectJobPostings);
  }
  if (!isRecord(value)) {
    return [];
  }
  const graph = value["@graph"];
  const nested = Array.isArray(graph) ? graph.flatMap(collectJobPostings) : [];
  return isJobPosting(value) ? [value, ...nested] : nested;
}

function isJobPosting(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  if (Array.isArray(type)) {
    return type.some((item) => item === "JobPosting");
  }

  return type === "JobPosting";
}

function sourceIdForJsonLd(
  source: CareerPageSource,
  record: Record<string, unknown>,
  url: string,
): string {
  const identifier = record.identifier;
  if (isRecord(identifier)) {
    return `${source.id}:${text(identifier.value) ?? text(identifier.name) ?? url}`;
  }

  return `${source.id}:${text(identifier) ?? url}`;
}

function jobLocation(record: Record<string, unknown>): string | null {
  if (text(record.jobLocationType)?.toUpperCase() === "TELECOMMUTE") {
    return "Remote";
  }

  const location = record.jobLocation;
  if (typeof location === "string") {
    return location;
  }
  if (Array.isArray(location)) {
    return location.map(locationText).filter(Boolean).join("; ") || null;
  }

  return locationText(location);
}

function locationText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const address = isRecord(value.address) ? value.address : value;
  const parts = [
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.addressCountry),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : null;
}

function matchesQuery(job: ParsedCareerJob, query: SearchQuery): boolean {
  const searchableText = [
    job.title,
    job.company,
    job.location,
    job.description ?? "",
  ].join(" ").toLowerCase();
  if (query.keywords.length > 0 && !query.keywords.every((keyword) => searchableText.includes(keyword.toLowerCase()))) {
    return false;
  }
  if (query.remote && !job.location.toLowerCase().includes("remote")) {
    return false;
  }
  if (query.location && !job.location.toLowerCase().includes(query.location.toLowerCase())) {
    return false;
  }
  if (query.companies?.length && !includesNormalized(query.companies, job.company)) {
    return false;
  }
  if (query.excludeCompanies?.length && includesNormalized(query.excludeCompanies, job.company)) {
    return false;
  }

  return true;
}

function looksLikeJobLink(href: string, title: string): boolean {
  return /\b(job|career|opening|position|role|intern|engineer|developer|analyst|manager)\b/i.test(
    `${href} ${title}`,
  );
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1];
}

function absoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
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

function dedupeByUrl(jobs: ParsedCareerJob[]): ParsedCareerJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.url)) {
      return false;
    }
    seen.add(job.url);
    return true;
  });
}

function includesNormalized(values: string[], candidate: string): boolean {
  return values.some((value) => candidate.toLowerCase().includes(value.toLowerCase()));
}

function textFromPath(value: unknown, key: string): string | undefined {
  return isRecord(value) ? text(value[key]) : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
