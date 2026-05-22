import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { FundingSource, NormalizedFundingEvent } from "./interfaces.js";
import { dedupeFundingEvents } from "./funding-sources/funding-normalizer.js";

export type ProspectingProfile = {
  targetRole: string;
  skills: string[];
  summary: string;
};

export type ProspectingScore = {
  score: number;
  summary: string;
};

export type ProspectingCompanyUpsert = {
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  tech_stack: string[];
  funding_stage: string | null;
  funding_amount: number | null;
  funding_currency: string;
  funding_date: string | null;
  investors: string[];
  lead_investor: string | null;
  source: string;
  source_url: string | null;
  region: string;
  relevance_score: number | null;
  ai_summary: string | null;
  status: string;
};

export type StoredProspectingCompany = {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  relevance_score: number | null;
};

export type ProspectingScanDependencies = {
  sources: FundingSource[];
  scoreCompany: (
    company: NormalizedFundingEvent,
    profile: ProspectingProfile,
  ) => Promise<ProspectingScore>;
  saveCompanies: (companies: ProspectingCompanyUpsert[]) => Promise<StoredProspectingCompany[]>;
};

export type ProspectingScanOptions = {
  profile: ProspectingProfile;
  minRelevanceScore?: number;
  eventBus?: EventBus<CareerEventMap>;
};

export type ProspectingScanResult = {
  sources: number;
  discovered: number;
  deduped: number;
  qualified: number;
  stored: number;
};

export async function runProspectingScan(
  dependencies: ProspectingScanDependencies,
  options: ProspectingScanOptions,
): Promise<ProspectingScanResult> {
  const events = (await Promise.all(dependencies.sources.map((source) => source.fetchFundingEvents()))).flat();
  const deduped = dedupeFundingEvents(events);
  const upserts: ProspectingCompanyUpsert[] = [];
  const threshold = options.minRelevanceScore ?? 0;
  let qualified = 0;

  for (const company of deduped) {
    const score = await dependencies.scoreCompany(company, options.profile);
    if (score.score >= threshold) {
      qualified += 1;
    }
    upserts.push(companyUpsert(company, score));
  }

  const stored = await dependencies.saveCompanies(upserts);
  for (const [index, company] of stored.entries()) {
    const source = deduped[index];
    options.eventBus?.emit("prospecting.company_discovered", {
      companyId: company.id,
      companyName: company.name,
      domain: company.domain,
      relevanceScore: company.relevance_score,
      source: source?.source ?? "unknown",
      discoveredAt: source?.fundingDate ?? new Date(),
    });
  }

  return {
    sources: dependencies.sources.length,
    discovered: events.length,
    deduped: deduped.length,
    qualified,
    stored: stored.length,
  };
}

function companyUpsert(
  event: NormalizedFundingEvent,
  score: ProspectingScore,
): ProspectingCompanyUpsert {
  return {
    name: event.companyName,
    domain: event.companyDomain,
    description: event.description ?? null,
    industry: null,
    tech_stack: event.techStack ?? [],
    funding_stage: event.fundingStage,
    funding_amount: event.fundingAmount,
    funding_currency: event.fundingCurrency,
    funding_date: event.fundingDate.toISOString(),
    investors: event.investors,
    lead_investor: event.leadInvestor,
    source: event.source,
    source_url: event.sourceUrl,
    region: event.region,
    relevance_score: score.score,
    ai_summary: score.summary,
    status: event.companyDomain ? "discovered" : "no_domain",
  };
}
