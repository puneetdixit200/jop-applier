import type { NormalizedFundingEvent, RawFundingEvent } from "../interfaces.js";
import { normalizeFundingEvent } from "./funding-normalizer.js";
import { BaseFundingSource, type FetchJson } from "./base-funding-source.js";

export type TracxnSourceOptions = {
  apiKey: string;
  apiUrl?: string;
  fetchJson?: FetchJson;
};

export class TracxnSource extends BaseFundingSource {
  private readonly apiKey: string;
  private readonly apiUrl: string;
  private readonly fetchJson: FetchJson;

  constructor(options: TracxnSourceOptions) {
    super("tracxn");
    this.apiKey = options.apiKey;
    this.apiUrl = options.apiUrl ?? "https://platform.tracxn.com/api/2.2/companies/funding";
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  async fetchFundingEvents(): Promise<NormalizedFundingEvent[]> {
    const payload = await this.fetchJson(this.apiUrl, {
      Authorization: `Bearer ${this.apiKey}`,
    });
    return tracxnRows(payload).map((row) => normalizeFundingEvent(rawFromTracxn(row)));
  }
}

function tracxnRows(payload: unknown): Record<string, unknown>[] {
  if (typeof payload !== "object" || payload === null || !("results" in payload)) {
    return [];
  }
  const results = (payload as { results?: unknown }).results;
  return Array.isArray(results)
    ? results.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
    : [];
}

function rawFromTracxn(row: Record<string, unknown>): RawFundingEvent {
  return {
    companyName: text(row.name) ?? "Unknown company",
    companyDomain: text(row.domain),
    fundingStage: text(row.stage),
    fundingAmount: typeof row.amountUsd === "number" ? row.amountUsd : null,
    fundingCurrency: "USD",
    fundingDate: text(row.date) ?? new Date(0).toISOString(),
    investors: Array.isArray(row.investors) ? row.investors.filter((item): item is string => typeof item === "string") : [],
    leadInvestor: text(row.leadInvestor),
    source: "tracxn",
    sourceUrl: text(row.url) ?? "https://tracxn.com",
    region: text(row.region) ?? "global",
    description: text(row.description),
  };
}

async function defaultFetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  return response.json();
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
