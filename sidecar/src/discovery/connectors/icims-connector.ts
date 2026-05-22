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

type IcimsConnectorConfig = {
  searchUrl?: string;
  customerId?: string;
  portal?: string;
  company?: string;
  apiBaseUrl?: string;
  username?: string;
  password?: string;
  authorization?: string;
  fetch?: FetchLike;
};

type IcimsSearchResult = Record<string, unknown>;

type ParsedIcimsDetails = {
  title?: string;
  location?: string;
  description: string;
  requirements: string[];
  rawHtml: string;
};

export class IcimsConnector implements JobConnector {
  readonly name: string;
  readonly platform = "icims";
  readonly rateLimit = { requests: 20, perSeconds: 60 };

  private readonly fetchClient: FetchLike;
  private readonly searchUrl: string | undefined;
  private readonly customerId: string | undefined;
  private readonly portal: string;
  private readonly company: string;
  private readonly apiBaseUrl: string;
  private readonly authorization: string | undefined;
  private readonly detailsByUrl = new Map<string, ParsedIcimsDetails>();

  constructor(config: IcimsConnectorConfig) {
    if (!config.searchUrl && !config.customerId) {
      throw new Error("iCIMS connector requires either searchUrl or customerId");
    }

    this.fetchClient = config.fetch ?? fetch;
    this.searchUrl = config.searchUrl;
    this.customerId = config.customerId;
    this.portal = config.portal ?? "jobs";
    this.company = config.company ?? config.customerId ?? "iCIMS";
    this.apiBaseUrl = trimTrailingSlash(config.apiBaseUrl ?? "https://api.icims.com");
    this.authorization =
      config.authorization ??
      (config.username && config.password
        ? `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`
        : undefined);
    this.name = `iCIMS ${this.company}`;
  }

  async *search(query: SearchQuery): AsyncGenerator<RawJobListing> {
    const results = await this.fetchSearchResults(query);

    for (const result of results) {
      const url = resultUrl(result);
      if (!url) {
        continue;
      }
      const details = await this.fetchDetails(url);
      const listing = this.toListing(result, url, details);
      if (listing && matchesQuery(listing, query)) {
        yield listing;
      }
    }
  }

  async getJobDetails(url: string): Promise<RawJobDetails> {
    const details = await this.fetchDetails(url);

    return {
      url,
      description: details.description,
      requirements: details.requirements,
      rawHtml: details.rawHtml,
    };
  }

  async login(_credentials: Credentials): Promise<Session> {
    return { connector: this.platform, authenticatedAt: new Date() };
  }

  async isLoggedIn(): Promise<boolean> {
    return true;
  }

  async healthCheck(): Promise<ConnectorHealth> {
    const results = await this.fetchSearchResults({ keywords: [] });
    return {
      ok: true,
      message: `iCIMS ${this.company} returned ${results.length} jobs`,
    };
  }

  private async fetchSearchResults(query: SearchQuery): Promise<IcimsSearchResult[]> {
    if (this.searchUrl) {
      return this.fetchPublicSearchResults(query);
    }

    return this.fetchPortalApiResults();
  }

  private async fetchPublicSearchResults(query: SearchQuery): Promise<IcimsSearchResult[]> {
    const response = await this.fetchClient(publicSearchUrl(this.searchUrl ?? "", query));
    if (!response.ok) {
      throw new Error(`iCIMS public search fetch failed with HTTP ${response.status}`);
    }
    const html = await response.text();

    return icimsLinksFromHtml(html, this.searchUrl ?? "");
  }

  private async fetchPortalApiResults(): Promise<IcimsSearchResult[]> {
    const response = await this.fetchClient(
      `${this.apiBaseUrl}/customers/${encodeURIComponent(this.customerId ?? "")}/search/portals/${encodeURIComponent(this.portal)}`,
      { headers: this.requestHeaders() },
    );
    if (!response.ok) {
      throw new Error(`iCIMS portal search fetch failed with HTTP ${response.status}`);
    }
    const payload = (await response.json()) as unknown;
    if (!isRecord(payload) || !Array.isArray(payload.searchResults)) {
      return [];
    }

    return payload.searchResults.filter(isRecord);
  }

  private requestHeaders(): Record<string, string> {
    return {
      Accept: "application/json",
      ...(this.authorization ? { Authorization: this.authorization } : {}),
    };
  }

  private async fetchDetails(url: string): Promise<ParsedIcimsDetails> {
    const cached = this.detailsByUrl.get(url);
    if (cached) {
      return cached;
    }

    const response = await this.fetchClient(url);
    if (!response.ok) {
      throw new Error(`iCIMS job detail fetch failed with HTTP ${response.status}`);
    }
    const rawHtml = await response.text();
    const details = detailsFromHtml(rawHtml, url);
    this.detailsByUrl.set(url, details);

    return details;
  }

  private toListing(
    result: IcimsSearchResult,
    url: string,
    details: ParsedIcimsDetails,
  ): RawJobListing | null {
    const title =
      textFromKeys(result, ["title", "jobTitle", "jobtitle", "name"]) ??
      details.title ??
      titleFromUrl(url);
    if (!title) {
      return null;
    }

    return {
      sourceId: textFromKeys(result, ["id", "jobId", "jobid"]) ?? url,
      platform: this.platform,
      url,
      title,
      company: this.company,
      location:
        textFromKeys(result, ["location", "jobLocation", "joblocation"]) ??
        details.location ??
        "Location unknown",
      description: details.description,
      rawHtml: details.rawHtml,
      postedDate: parseDate(textFromKeys(result, ["updatedDate", "postedDate", "datePosted"])),
    };
  }
}

function publicSearchUrl(searchUrl: string, query: SearchQuery): string {
  const url = new URL(searchUrl);
  if (!url.searchParams.has("ss")) {
    url.searchParams.set("ss", "1");
  }
  if (query.keywords.length > 0 && !url.searchParams.has("searchKeyword")) {
    url.searchParams.set("searchKeyword", query.keywords.join(" "));
  }

  return url.toString();
}

function icimsLinksFromHtml(html: string, baseUrl: string): IcimsSearchResult[] {
  const results: IcimsSearchResult[] = [];
  for (const match of html.matchAll(/<a\b([^>]*)>(.*?)<\/a>/gis)) {
    const href = attribute(match[1] ?? "", "href");
    const title = stripHtml(match[2] ?? "");
    if (!href || !title || !looksLikeIcimsJobLink(href)) {
      continue;
    }
    const url = absoluteUrl(href, baseUrl);
    results.push({
      id: jobIdFromUrl(url) ?? url,
      portalUrl: url,
      title,
    });
  }

  return dedupeByUrl(results);
}

function detailsFromHtml(html: string, url: string): ParsedIcimsDetails {
  const jsonLdJob = jsonLdJobPosting(html);
  const rawDescription = text(jsonLdJob?.description) ?? html;
  const title = text(jsonLdJob?.title) ?? textFromTag(html, "h1") ?? textFromTag(html, "title");

  return {
    title: title ? stripTitleSuffix(title) : titleFromUrl(url) ?? undefined,
    location: jobLocation(jsonLdJob) ?? classText(html, "location"),
    description: stripHtml(rawDescription),
    requirements: listItems(rawDescription),
    rawHtml: html,
  };
}

function jsonLdJobPosting(html: string): Record<string, unknown> | null {
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gis)) {
    try {
      const parsed = JSON.parse(decodeEntities(match[1] ?? "")) as unknown;
      const posting = collectJobPosting(parsed);
      if (posting) {
        return posting;
      }
    } catch {
      continue;
    }
  }

  return null;
}

function collectJobPosting(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const posting = collectJobPosting(item);
      if (posting) {
        return posting;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return null;
  }
  if (isJobPosting(value)) {
    return value;
  }
  const graph = value["@graph"];
  return Array.isArray(graph) ? collectJobPosting(graph) : null;
}

function isJobPosting(value: Record<string, unknown>): boolean {
  const type = value["@type"];
  return Array.isArray(type) ? type.includes("JobPosting") : type === "JobPosting";
}

function jobLocation(record: Record<string, unknown> | null): string | undefined {
  if (!record) {
    return undefined;
  }
  const location = record.jobLocation;
  if (Array.isArray(location)) {
    return location.map(locationText).filter(Boolean).join("; ") || undefined;
  }

  return locationText(location) ?? undefined;
}

function locationText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (!isRecord(value)) {
    return null;
  }
  const address = isRecord(value.address) ? value.address : value;
  const parts = [
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.addressCountry),
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(", ") : textFromKeys(value, ["name"]);
}

function matchesQuery(listing: RawJobListing, query: SearchQuery): boolean {
  const haystack = [
    listing.title,
    listing.company,
    listing.location,
    listing.description ?? "",
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

  return true;
}

function resultUrl(result: IcimsSearchResult): string | null {
  return textFromKeys(result, ["portalUrl", "portalurl", "url", "jobUrl"]);
}

function looksLikeIcimsJobLink(href: string): boolean {
  return /\/jobs\/\d+\/[^/]+\/job\b/i.test(href);
}

function jobIdFromUrl(url: string): string | null {
  return url.match(/\/jobs\/(\d+)\//i)?.[1] ?? null;
}

function titleFromUrl(url: string): string | null {
  const slug = url.match(/\/jobs\/\d+\/([^/]+)\/job\b/i)?.[1];
  if (!slug) {
    return null;
  }

  return slug.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function textFromTag(html: string, tag: string): string | undefined {
  const match = html.match(new RegExp(`<${tag}\\b[^>]*>(.*?)</${tag}>`, "is"));
  return match ? stripHtml(match[1] ?? "") : undefined;
}

function classText(html: string, className: string): string | undefined {
  const match = html.match(
    new RegExp(`<[^>]+class=["'][^"']*${className}[^"']*["'][^>]*>(.*?)</[^>]+>`, "is"),
  );
  return match ? stripHtml(match[1] ?? "") : undefined;
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

function stripTitleSuffix(value: string): string {
  return value.split("|")[0]?.trim() ?? value;
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

function dedupeByUrl(results: IcimsSearchResult[]): IcimsSearchResult[] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const url = resultUrl(result);
    if (!url || seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

function parseDate(value: string | undefined | null): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
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

function text(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
