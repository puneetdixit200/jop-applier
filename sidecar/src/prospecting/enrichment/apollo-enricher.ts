import { BaseEnricher } from "./base-enricher.js";
import type {
  DiscoveredProspectContact,
  ProspectCompanyForEnrichment,
} from "./enrichment-engine.js";
import { contactFromCandidate, uniqueContacts } from "./contact-mapper.js";

export type ApolloEnricherOptions = {
  apiKey?: string | null;
  apiUrl?: string;
  limit?: number;
  fetchJson?: (url: string, init: RequestInit) => Promise<unknown>;
};

export class ApolloEnricher extends BaseEnricher {
  private readonly apiKey: string | null;
  private readonly apiUrl: string;
  private readonly limit: number;
  private readonly fetchJson: (url: string, init: RequestInit) => Promise<unknown>;

  constructor(options: ApolloEnricherOptions = {}) {
    super("apollo");
    this.apiKey = options.apiKey?.trim() || null;
    this.apiUrl = options.apiUrl ?? "https://api.apollo.io/api/v1/mixed_people/search";
    this.limit = options.limit ?? 10;
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  findContacts = async (company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]> => {
    if (!this.apiKey || !company.domain) {
      return [];
    }

    const payload = await this.fetchJson(this.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
      },
      body: JSON.stringify({
        q_organization_domains: company.domain,
        page: 1,
        per_page: this.limit,
        person_titles: [
          "recruiter",
          "talent acquisition",
          "people operations",
          "human resources",
          "founder",
          "engineering manager",
        ],
      }),
    });

    return uniqueContacts(apolloPeople(payload).flatMap((person) => contactFromCandidate({
      fullName: text(person.name),
      firstName: text(person.first_name),
      lastName: text(person.last_name),
      email: text(person.email),
      title: text(person.title),
      confidence: emailConfidence(person.email_status),
      source: this.id,
      linkedinUrl: text(person.linkedin_url),
    }) ?? []));
  };
}

function apolloPeople(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }
  const people = Array.isArray(payload.people) ? payload.people : payload.contacts;
  return Array.isArray(people) ? people.filter(isRecord) : [];
}

async function defaultFetchJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  return response.json();
}

function emailConfidence(value: unknown): number {
  if (value === "verified") {
    return 0.85;
  }
  if (value === "guessed" || value === "catch-all") {
    return 0.65;
  }
  return 0.75;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
