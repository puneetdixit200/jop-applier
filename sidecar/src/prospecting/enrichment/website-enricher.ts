import { BaseEnricher } from "./base-enricher.js";
import type {
  DiscoveredProspectContact,
  ProspectCompanyForEnrichment,
} from "./enrichment-engine.js";
import { contactFromCandidate, roleFromTitle, uniqueContacts } from "./contact-mapper.js";

export type WebsiteEnricherOptions = {
  pages?: string[];
  fetchText?: (url: string) => Promise<string>;
  maxPages?: number;
};

export class WebsiteEnricher extends BaseEnricher {
  private readonly pages: string[];
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly maxPages: number;

  constructor(options: WebsiteEnricherOptions = {}) {
    super("website");
    this.pages = options.pages ?? ["/", "/team", "/about", "/company", "/careers", "/contact"];
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.maxPages = options.maxPages ?? 6;
  }

  findContacts = async (company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]> => {
    if (!company.domain) {
      return [];
    }

    const contacts: DiscoveredProspectContact[] = [];
    for (const url of websiteUrls(company.domain, this.pages).slice(0, this.maxPages)) {
      try {
        contacts.push(...contactsFromHtml(await this.fetchText(url)));
      } catch {
        continue;
      }
    }

    return uniqueContacts(contacts);
  };
}

function contactsFromHtml(html: string): DiscoveredProspectContact[] {
  const text = htmlToText(html);
  const explicit = mailtoMatches(html).flatMap((match) => contactFromCandidate({
    fullName: nearbyName(text, match.email),
    email: match.email,
    title: nearbyTitle(text, match.email),
    confidence: 0.7,
    source: "website",
  }) ?? []);
  const emailMatches = [...text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
    .map((match) => match[0])
    .flatMap((email) => contactFromCandidate({
      fullName: nearbyName(text, email),
      email,
      role: roleFromTitle(nearbyTitle(text, email) ?? ""),
      confidence: 0.62,
      source: "website",
    }) ?? []);

  return uniqueContacts([...explicit, ...emailMatches]);
}

function websiteUrls(domain: string, paths: string[]): string[] {
  const normalizedDomain = domain.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
  return paths.map((path) => `https://${normalizedDomain}${path.startsWith("/") ? path : `/${path}`}`);
}

function mailtoMatches(html: string): Array<{ email: string }> {
  return [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((match) => ({ email: decodeURIComponent(match[1]) }));
}

function nearbyName(text: string, email: string): string | null {
  const index = text.toLowerCase().indexOf(email.toLowerCase());
  if (index === -1) {
    return null;
  }
  const before = text.slice(Math.max(0, index - 100), index);
  const match = before.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\s*(?:,|-|–)?\s*$/);
  return match?.[1]?.trim() ?? null;
}

function nearbyTitle(text: string, email: string): string | null {
  const index = text.toLowerCase().indexOf(email.toLowerCase());
  if (index === -1) {
    return null;
  }
  const windowText = text.slice(Math.max(0, index - 120), Math.min(text.length, index + email.length + 120));
  return windowText.match(/\b(Talent Acquisition|Recruiter|HR Manager|People Ops|Founder|CEO|CTO|Engineering Manager|Head of Engineering)\b/i)?.[1] ?? null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function defaultFetchText(url: string) {
  const response = await fetch(url);
  return response.text();
}
