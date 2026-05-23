import { BaseEnricher } from "./base-enricher.js";
import type {
  DiscoveredProspectContact,
  ProspectCompanyForEnrichment,
} from "./enrichment-engine.js";
import { contactFromCandidate, uniqueContacts } from "./contact-mapper.js";

export type SnovEnricherOptions = {
  accessToken?: string | null;
  apiKey?: string | null;
  apiUrl?: string;
  limit?: number;
  fetchJson?: (url: string, init: RequestInit) => Promise<unknown>;
};

export class SnovEnricher extends BaseEnricher {
  private readonly accessToken: string | null;
  private readonly apiUrl: string;
  private readonly limit: number;
  private readonly fetchJson: (url: string, init: RequestInit) => Promise<unknown>;

  constructor(options: SnovEnricherOptions = {}) {
    super("snov");
    this.accessToken = options.accessToken?.trim() || options.apiKey?.trim() || null;
    this.apiUrl = options.apiUrl ?? "https://api.snov.io/v2/domain-emails-with-info";
    this.limit = options.limit ?? 5;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  findContacts = async (company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]> => {
    if (!this.accessToken || !company.domain) {
      return [];
    }

    const url = new URL(this.apiUrl);
    url.searchParams.set("domain", company.domain);
    url.searchParams.set("type", "all");
    url.searchParams.set("limit", String(this.limit));

    const payload = await this.fetchJson(url.toString(), {
      headers: {
        authorization: `Bearer ${this.accessToken}`,
      },
    });

    return uniqueContacts(snovEmails(payload).flatMap((item) => contactFromCandidate({
      fullName: text(item.name),
      firstName: text(item.firstName) ?? text(item.first_name),
      lastName: text(item.lastName) ?? text(item.last_name),
      email: text(item.email),
      title: text(item.position) ?? text(item.title),
      confidence: numberValue(item.confidence) ?? statusConfidence(item.status),
      source: this.id,
      linkedinUrl: text(item.linkedinUrl) ?? text(item.linkedin_url),
    }) ?? []));
  };
}

function snovEmails(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }
  const emails = Array.isArray(payload.emails)
    ? payload.emails
    : isRecord(payload.data) && Array.isArray(payload.data.emails)
      ? payload.data.emails
      : [];
  return emails.filter(isRecord);
}

async function defaultFetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  return response.json();
}

function statusConfidence(value: unknown): number {
  return value === "verified" || value === "valid" ? 0.85 : 0.7;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
