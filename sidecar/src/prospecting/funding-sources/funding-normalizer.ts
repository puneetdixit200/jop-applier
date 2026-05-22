import type {
  FundingRegion,
  FundingStage,
  NormalizedFundingEvent,
  RawFundingEvent,
} from "../interfaces.js";

const regionSet = new Set<FundingRegion>(["india", "global", "us", "eu", "sea"]);

export function normalizeFundingEvent(event: RawFundingEvent): NormalizedFundingEvent {
  return {
    companyName: event.companyName.trim(),
    companyDomain: normalizeCompanyDomain(event.companyDomain ?? null),
    companyLinkedIn: nullableText(event.companyLinkedIn),
    fundingStage: normalizeFundingStage(event.fundingStage),
    fundingAmount: normalizeFundingAmount(event.fundingAmount),
    fundingCurrency: nullableText(event.fundingCurrency) ?? "USD",
    fundingDate: normalizeFundingDate(event.fundingDate),
    investors: stringList(event.investors),
    leadInvestor: nullableText(event.leadInvestor),
    source: event.source,
    sourceUrl: event.sourceUrl,
    region: normalizeRegion(event.region),
    description: nullableText(event.description),
    techStack: stringList(event.techStack),
    headcount: Number.isFinite(event.headcount) ? event.headcount ?? null : null,
  };
}

export function dedupeFundingEvents(events: NormalizedFundingEvent[]): NormalizedFundingEvent[] {
  const byKey = new Map<string, NormalizedFundingEvent>();
  for (const event of events) {
    const key = dedupeKey(event);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeFundingEvents(existing, event) : { ...event });
  }
  return [...byKey.values()];
}

export function dedupeKey(event: Pick<NormalizedFundingEvent, "companyDomain" | "companyName">): string {
  const domain = normalizeCompanyDomain(event.companyDomain);
  if (domain) {
    return domain;
  }
  return event.companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function normalizeCompanyDomain(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/.*$/, "")
      .replace(/:.*$/, "") || null;
  }
}

function mergeFundingEvents(
  current: NormalizedFundingEvent,
  incoming: NormalizedFundingEvent,
): NormalizedFundingEvent {
  return {
    ...current,
    companyDomain: current.companyDomain ?? incoming.companyDomain,
    companyLinkedIn: current.companyLinkedIn ?? incoming.companyLinkedIn,
    fundingStage: current.fundingStage === "unknown" ? incoming.fundingStage : current.fundingStage,
    fundingAmount: current.fundingAmount ?? incoming.fundingAmount,
    fundingCurrency: current.fundingCurrency || incoming.fundingCurrency,
    fundingDate: current.fundingDate <= incoming.fundingDate ? current.fundingDate : incoming.fundingDate,
    investors: unionStrings(current.investors, incoming.investors),
    leadInvestor: current.leadInvestor ?? incoming.leadInvestor,
    description: current.description ?? incoming.description,
    techStack: unionStrings(current.techStack ?? [], incoming.techStack ?? []),
    headcount: current.headcount ?? incoming.headcount,
    aiSummary: current.aiSummary ?? incoming.aiSummary,
    relevanceScore: current.relevanceScore ?? incoming.relevanceScore,
  };
}

function normalizeFundingStage(value: string | null | undefined): FundingStage {
  const normalized = (value ?? "unknown").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "preseed" || normalized === "pre_seed") {
    return "pre_seed";
  }
  if (normalized === "series_a" || normalized === "series_b" || normalized === "series_c") {
    return normalized;
  }
  if (normalized === "series_d" || normalized === "series_e") {
    return normalized;
  }
  if (
    normalized === "seed" ||
    normalized === "growth" ||
    normalized === "private_equity"
  ) {
    return normalized;
  }
  return "unknown";
}

function normalizeFundingAmount(value: string | number | null | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = value?.trim().toLowerCase().replace(/[$,]/g, "");
  if (!text) {
    return null;
  }
  const match = text.match(/^(\d+(?:\.\d+)?)\s*([kmb])?$/);
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const multiplier = match[2] === "b" ? 1_000_000_000 : match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1_000 : 1;
  return amount * multiplier;
}

function normalizeFundingDate(value: string | Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function normalizeRegion(value: string | null | undefined): FundingRegion {
  const normalized = (value ?? "global").trim().toLowerCase();
  return regionSet.has(normalized as FundingRegion) ? (normalized as FundingRegion) : "global";
}

function stringList(value: string | string[] | null | undefined): string[] {
  const items = Array.isArray(value) ? value : (value ?? "").split(",");
  return items.map((item) => item.trim()).filter(Boolean);
}

function unionStrings(left: string[], right: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of [...left, ...right]) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function nullableText(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
