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

export type JobPortalPlatform = "linkedin" | "indeed" | "internshala" | "naukri" | "wellfound";

export type JobPortalSource = {
  platform: JobPortalPlatform;
  name?: string;
  searchUrl?: string;
  headers?: Record<string, string>;
  fetch?: FetchLike;
};

type ParsedPortalJob = RawJobListing & {
  detailUrl: string;
};

export class JobPortalConnector implements JobConnector {
  readonly name: string;
  readonly platform: JobPortalPlatform;
  readonly rateLimit = { requests: 10, perSeconds: 60 };

  private readonly fetchClient: FetchLike;
  private readonly detailsByUrl = new Map<string, RawJobDetails>();

  constructor(private readonly source: JobPortalSource) {
    this.name = source.name ?? portalDisplayName(source.platform);
    this.platform = source.platform;
    this.fetchClient = source.fetch ?? fetch;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    const response = await this.fetchClient(searchUrlForPortal(this.source, query), {
      headers: this.source.headers ?? {},
    });
    if (!response.ok) {
      throw new Error(`${this.name} search fetch failed with HTTP ${response.status}`);
    }
    const html = await response.text();
    const jobs = parsePortalJobs(this.source, html);

    for (const job of jobs) {
      if (!matchesQuery(job, query)) {
        continue;
      }
      this.detailsByUrl.set(job.url, {
        url: job.url,
        description: job.description ?? job.title,
        requirements: listItems(job.rawHtml ?? ""),
        rawHtml: job.rawHtml,
      });
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
    const cached = this.detailsByUrl.get(url);
    if (cached?.rawHtml) {
      return cached;
    }

    const response = await this.fetchClient(url, { headers: this.source.headers ?? {} });
    if (!response.ok) {
      throw new Error(`${this.name} detail fetch failed with HTTP ${response.status}`);
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
    return {
      ok: true,
      message: `${this.name} connector is configured`,
    };
  }
}

export function searchUrlForPortal(source: JobPortalSource, query: SearchQuery): string {
  if (source.searchUrl) {
    return applySearchTemplate(source.searchUrl, query);
  }

  const keywords = query.keywords.join(" ");
  const location = query.location ?? "";
  if (source.platform === "linkedin") {
    const url = new URL("https://www.linkedin.com/jobs/search/");
    setParam(url, "keywords", keywords);
    setParam(url, "location", location);
    if (query.remote) {
      url.searchParams.set("f_WT", "2");
    }
    return url.toString();
  }
  if (source.platform === "indeed") {
    const url = new URL("https://www.indeed.com/jobs");
    setParam(url, "q", keywords);
    setParam(url, "l", location);
    if (query.remote) {
      url.searchParams.set("remotejob", "1");
    }
    return url.toString();
  }
  if (source.platform === "internshala") {
    const keywordSlug = slug(keywords) || "jobs";
    return `https://internshala.com/internships/keywords-${keywordSlug}/`;
  }
  if (source.platform === "naukri") {
    const keywordSlug = slug(keywords) || "jobs";
    const locationSlug = slug(location);
    return `https://www.naukri.com/${keywordSlug}-jobs${locationSlug ? `-in-${locationSlug}` : ""}`;
  }

  const url = new URL("https://wellfound.com/jobs");
  setParam(url, "query", keywords);
  setParam(url, "location", location);
  return url.toString();
}

function parsePortalJobs(source: JobPortalSource, html: string): ParsedPortalJob[] {
  const jsonLdJobs = jobsFromJsonLd(source, html);
  return jsonLdJobs.length > 0 ? jsonLdJobs : jobsFromLinks(source, html);
}

function jobsFromJsonLd(source: JobPortalSource, html: string): ParsedPortalJob[] {
  return jsonLdBlocks(html)
    .flatMap((block) => collectJobPostings(block))
    .map((record) => jobFromJsonLd(source, record))
    .filter((job): job is ParsedPortalJob => job !== null);
}

function jobFromJsonLd(
  source: JobPortalSource,
  record: Record<string, unknown>,
): ParsedPortalJob | null {
  const title = text(record.title);
  const url = absoluteUrl(text(record.url) ?? "", searchBaseUrl(source));
  if (!title || !url) {
    return null;
  }

  const description = stripHtml(text(record.description) ?? "");

  return {
    sourceId: sourceIdForPortalJob(source.platform, url, text(record.identifier) ?? undefined),
    platform: source.platform,
    url,
    detailUrl: url,
    title,
    company: hiringOrganization(record) ?? portalDisplayName(source.platform),
    location: jobLocation(record) ?? "Location unknown",
    description,
    rawHtml: text(record.description) ?? undefined,
    postedDate: parseDate(text(record.datePosted)),
  };
}

function jobsFromLinks(source: JobPortalSource, html: string): ParsedPortalJob[] {
  const jobs: ParsedPortalJob[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gis)) {
    const href = attribute(match[1] ?? "", "href");
    const title = stripHtml(match[2] ?? "");
    if (!href || !title || !looksLikePortalJobLink(source.platform, href)) {
      continue;
    }
    const url = absoluteUrl(href, searchBaseUrl(source));
    jobs.push({
      sourceId: sourceIdForPortalJob(source.platform, url),
      platform: source.platform,
      url,
      detailUrl: url,
      title,
      company: portalDisplayName(source.platform),
      location: "Location unknown",
      description: title,
    });
  }

  return dedupeByUrl(jobs);
}

function applySearchTemplate(template: string, query: SearchQuery): string {
  return template
    .replace(/{keywords}/g, encodeURIComponent(query.keywords.join(" ")))
    .replace(/{location}/g, encodeURIComponent(query.location ?? ""))
    .replace(/{remote}/g, query.remote ? "true" : "false")
    .replace(/{jobType}/g, encodeURIComponent(query.jobType ?? ""));
}

function searchBaseUrl(source: JobPortalSource): string {
  if (source.searchUrl) {
    return source.searchUrl;
  }

  return searchUrlForPortal(source, { keywords: [] });
}

function matchesQuery(job: ParsedPortalJob, query: SearchQuery): boolean {
  const haystack = [
    job.title,
    job.company,
    job.location,
    job.description ?? "",
  ].join(" ").toLowerCase();
  if (query.keywords.length > 0 && !query.keywords.every((keyword) => haystack.includes(keyword.toLowerCase()))) {
    return false;
  }
  if (query.location && !job.location.toLowerCase().includes(query.location.toLowerCase())) {
    return false;
  }
  if (query.remote && !job.location.toLowerCase().includes("remote")) {
    return false;
  }

  return true;
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
  return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
}

function sourceIdForPortalJob(
  platform: JobPortalPlatform,
  url: string,
  identifier?: string,
): string {
  const id = identifier ?? jobIdFromUrl(platform, url) ?? url;
  return `${platform}:${id}`;
}

function jobIdFromUrl(platform: JobPortalPlatform, url: string): string | null {
  if (platform === "linkedin") {
    return url.match(/\/jobs\/view\/(\d+)/i)?.[1] ?? null;
  }
  if (platform === "indeed") {
    return new URL(url).searchParams.get("jk") ?? url.match(/[?&]jk=([^&]+)/i)?.[1] ?? null;
  }
  if (platform === "internshala") {
    return url.match(/\/internship\/detail\/([^/?#]+)/i)?.[1] ?? null;
  }
  if (platform === "naukri") {
    return url.match(/-(\d+)(?:\?|$)/)?.[1] ?? null;
  }

  return url.match(/\/jobs\/(\d+)/i)?.[1] ?? null;
}

function looksLikePortalJobLink(platform: JobPortalPlatform, href: string): boolean {
  if (platform === "linkedin") {
    return /\/jobs\/view\//i.test(href);
  }
  if (platform === "indeed") {
    return /\/viewjob\b|[?&]jk=/i.test(href);
  }
  if (platform === "internshala") {
    return /\/internship\/detail\//i.test(href);
  }
  if (platform === "naukri") {
    return /job-listings|\/job-listing\//i.test(href);
  }

  return /\/jobs\/\d+/i.test(href);
}

function hiringOrganization(record: Record<string, unknown>): string | null {
  const organization = record.hiringOrganization;
  if (typeof organization === "string") {
    return organization.trim() || null;
  }

  return isRecord(organization) ? text(organization.name) : null;
}

function jobLocation(record: Record<string, unknown>): string | null {
  if (text(record.jobLocationType)?.toUpperCase() === "TELECOMMUTE") {
    return "Remote";
  }
  const location = record.jobLocation;
  if (typeof location === "string") {
    return location.trim() || null;
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

  return parts.length > 0 ? parts.join(", ") : text(value.name);
}

function portalDisplayName(platform: JobPortalPlatform): string {
  const names: Record<JobPortalPlatform, string> = {
    linkedin: "LinkedIn",
    indeed: "Indeed",
    internshala: "Internshala",
    naukri: "Naukri",
    wellfound: "Wellfound",
  };

  return names[platform];
}

function setParam(url: URL, name: string, value: string): void {
  if (value.trim()) {
    url.searchParams.set(name, value.trim());
  }
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function absoluteUrl(url: string, baseUrl: string): string {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(new RegExp(`\\b${name}=["']([^"']+)["']`, "i"));
  return match?.[1];
}

function dedupeByUrl(jobs: ParsedPortalJob[]): ParsedPortalJob[] {
  const seen = new Set<string>();
  return jobs.filter((job) => {
    if (seen.has(job.url)) {
      return false;
    }
    seen.add(job.url);
    return true;
  });
}

function stripHtml(value: string): string {
  return decodeEntities(value)
    .replace(/<script\b[^>]*>.*?<\/script>/gis, " ")
    .replace(/<style\b[^>]*>.*?<\/style>/gis, " ")
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
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
