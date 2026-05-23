import { BaseEnricher } from "./base-enricher.js";
import type {
  DiscoveredProspectContact,
  ProspectCompanyForEnrichment,
} from "./enrichment-engine.js";
import { contactFromCandidate, uniqueContacts } from "./contact-mapper.js";

export type HunterEnricherOptions = {
  apiKey?: string | null;
  baseUrl?: string;
  limit?: number;
  fetchJson?: (url: string) => Promise<unknown>;
};

export class HunterEnricher extends BaseEnricher {
  private readonly apiKey: string | null;
  private readonly baseUrl: string;
  private readonly limit: number;
  private readonly fetchJson: (url: string) => Promise<unknown>;

  constructor(options: HunterEnricherOptions = {}) {
    super("hunter");
    this.apiKey = options.apiKey?.trim() || null;
    this.baseUrl = options.baseUrl ?? "https://api.hunter.io/v2/domain-search";
    this.limit = options.limit ?? 10;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  findContacts = async (company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]> => {
    if (!this.apiKey || !company.domain) {
      return [];
    }

    const url = new URL(this.baseUrl);
    url.searchParams.set("domain", company.domain);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("limit", String(this.limit));

    const payload = await this.fetchJson(url.toString());
    return uniqueContacts(hunterEmails(payload).flatMap((item) => contactFromCandidate({
      firstName: text(item.first_name),
      lastName: text(item.last_name),
      email: text(item.value) ?? text(item.email),
      title: text(item.position) ?? text(item.department),
      confidence: numberValue(item.confidence),
      source: this.id,
      linkedinUrl: text(item.linkedin),
    }) ?? []));
  };
}

function hunterEmails(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.emails)) {
    return [];
  }
  return payload.data.emails.filter(isRecord);
}

async function defaultFetchJson(url: string) {
  const response = await fetch(url);
  return response.json();
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
