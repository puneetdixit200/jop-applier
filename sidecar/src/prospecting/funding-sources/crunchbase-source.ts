import type { NormalizedFundingEvent, RawFundingEvent } from "../interfaces.js";
import { normalizeFundingEvent } from "./funding-normalizer.js";
import { BaseFundingSource, type FetchJson } from "./base-funding-source.js";

export type CrunchbaseSourceOptions = {
  apiKey: string;
  apiUrl?: string;
  fetchJson?: FetchJson;
};

export class CrunchbaseSource extends BaseFundingSource {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly fetchJson: FetchJson;

  constructor(options: CrunchbaseSourceOptions) {
    super("crunchbase");
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? "https://api.crunchbase.com/api/v4/searches/funding_rounds";
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  async fetchFundingEvents(): Promise<NormalizedFundingEvent[]> {
    const payload = await this.fetchJson(this.apiUrl, {
      Authorization: `Bearer ${this.apiKey}`,
    });
    return crunchbaseEntities(payload).map((entity) => normalizeFundingEvent(rawFromCrunchbase(entity)));
  }
}

type CrunchbaseEntity = Record<string, unknown>;

function crunchbaseEntities(payload: unknown): CrunchbaseEntity[] {
  if (!isRecord(payload) || !Array.isArray(payload.entities)) {
    return [];
  }
  return payload.entities.filter(isRecord);
}

function rawFromCrunchbase(entity: CrunchbaseEntity): RawFundingEvent {
  return {
    companyName: stringField(entity.company_name) ?? "Unknown company",
    companyDomain: stringField(entity.website),
    companyLinkedIn: stringField(entity.linkedin_url),
    fundingStage: stringField(entity.funding_type),
    fundingAmount: numberField(entity.money_raised_usd),
    fundingCurrency: "USD",
    fundingDate: stringField(entity.announced_on) ?? new Date(0).toISOString(),
    investors: stringArrayField(entity.investors),
    leadInvestor: stringField(entity.lead_investor),
    source: "crunchbase",
    sourceUrl: stringField(entity.permalink) ?? "https://crunchbase.com",
    region: "global",
    description: stringField(entity.short_description),
  };
}

async function defaultFetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberField(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayField(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
