import type { AIEngine } from "../ai/ai-engine.js";
import type { FundingRegion, FundingSource, NormalizedFundingEvent } from "./interfaces.js";
import { runEnrichmentPipeline, type ContactEnricher, type ProspectContactUpsert } from "./enrichment/enrichment-engine.js";
import { verifyEmailAddress } from "./enrichment/email-verifier.js";
import { ApolloEnricher } from "./enrichment/apollo-enricher.js";
import { HunterEnricher } from "./enrichment/hunter-enricher.js";
import { LinkedInEnricher } from "./enrichment/linkedin-enricher.js";
import { SnovEnricher } from "./enrichment/snov-enricher.js";
import { WebsiteEnricher } from "./enrichment/website-enricher.js";
import { CrunchbaseSource } from "./funding-sources/crunchbase-source.js";
import { CustomRssSource } from "./funding-sources/custom-rss-source.js";
import { EntrackrSource } from "./funding-sources/entrackr-source.js";
import { Inc42Source } from "./funding-sources/inc42-source.js";
import { TechCrunchSource } from "./funding-sources/techcrunch-source.js";
import { TracxnSource } from "./funding-sources/tracxn-source.js";
import { VcCircleSource } from "./funding-sources/vccircle-source.js";
import { YourStorySource } from "./funding-sources/yourstory-source.js";
import type {
  ProspectingProfile,
  ProspectingScanContact,
  ProspectingScanDependencies,
  StoredProspectingCompany,
  ProspectingCompanyUpsert,
} from "./prospecting-manager.js";

export type ProspectingWorkflowConfigOptions = {
  aiEngine: AIEngine;
};

type ProspectingScanInput = {
  profile: ProspectingProfile;
  minRelevanceScore?: number;
};

export function createProspectingDependenciesFromWorkflowInput(
  input: unknown,
  options: ProspectingWorkflowConfigOptions,
): { dependencies: ProspectingScanDependencies; profile: ProspectingProfile; minRelevanceScore?: number } | null {
  const config = prospectingScanInput(input);
  if (!config) {
    return null;
  }

  const sources = sourcesFromConfig(config);
  const enrichers = enrichersFromConfig(config);
  const enrichment = isRecord(config.enrichment) ? config.enrichment : {};
  const maxContacts = positiveInteger(enrichment.maxContacts) ?? 3;

  return {
    profile: profileFromConfig(config.profile),
    minRelevanceScore: positiveNumber(config.minRelevanceScore),
    dependencies: {
      sources,
      scoreCompany: (company, profile) => scoreProspectingCompany(options.aiEngine, company, profile),
      saveCompanies: async (companies) => companies.map((company, index) => ({
        id: company.domain ?? `prospect-${index + 1}`,
        name: company.name,
        domain: company.domain,
        status: company.status,
        relevance_score: company.relevance_score,
      })),
      enrichCompany: enrichers.length > 0
        ? (company, upsert) => enrichStoredCompany(company, upsert, enrichers, maxContacts)
        : undefined,
    },
  };
}

function prospectingScanInput(input: unknown): Record<string, unknown> | null {
  if (!isRecord(input)) {
    return null;
  }
  const config = isRecord(input.prospectingScan)
    ? input.prospectingScan
    : isRecord(input.prospecting)
      ? input.prospecting
      : null;
  return config;
}

function sourcesFromConfig(config: Record<string, unknown>): FundingSource[] {
  const sourceConfig = isRecord(config.sources) ? config.sources : {};
  const sources: FundingSource[] = [];

  if (booleanValue(sourceConfig.inc42, false)) {
    sources.push(new Inc42Source());
  }
  if (booleanValue(sourceConfig.yourstory, false)) {
    sources.push(new YourStorySource());
  }
  if (booleanValue(sourceConfig.techcrunch, false)) {
    sources.push(new TechCrunchSource());
  }
  if (booleanValue(sourceConfig.entrackr, false)) {
    sources.push(new EntrackrSource());
  }
  if (booleanValue(sourceConfig.vccircle, false)) {
    sources.push(new VcCircleSource());
  }

  const crunchbaseApiKey = stringValue(sourceConfig.crunchbaseApiKey);
  if (crunchbaseApiKey) {
    sources.push(new CrunchbaseSource({ apiKey: crunchbaseApiKey }));
  }
  const tracxnApiKey = stringValue(sourceConfig.tracxnApiKey);
  if (tracxnApiKey) {
    sources.push(new TracxnSource({ apiKey: tracxnApiKey }));
  }

  const rssSources = Array.isArray(sourceConfig.rssSources) ? sourceConfig.rssSources : [];
  for (const rssSource of rssSources) {
    if (!isRecord(rssSource)) {
      continue;
    }
    const id = stringValue(rssSource.id);
    const feedUrl = stringValue(rssSource.feedUrl) ?? stringValue(rssSource.url);
    const region = fundingRegion(rssSource.region);
    if (id && feedUrl && region) {
      sources.push(new CustomRssSource({ id, feedUrl, region }));
    }
  }

  return sources;
}

function enrichersFromConfig(config: Record<string, unknown>): ContactEnricher[] {
  const enrichment: Record<string, unknown> = isRecord(config.enrichment) ? config.enrichment : {};
  const enrichers: ContactEnricher[] = [];
  const hunterApiKey = stringValue(enrichment.hunterApiKey);
  const apolloApiKey = stringValue(enrichment.apolloApiKey);
  const snovApiKey = stringValue(enrichment.snovApiKey) ?? stringValue(enrichment.snovAccessToken);

  if (hunterApiKey) {
    enrichers.push(new HunterEnricher({ apiKey: hunterApiKey }));
  }
  if (apolloApiKey) {
    enrichers.push(new ApolloEnricher({ apiKey: apolloApiKey }));
  }
  if (snovApiKey) {
    enrichers.push(new SnovEnricher({ apiKey: snovApiKey }));
  }
  if (booleanValue(enrichment.includeLinkedIn, false)) {
    enrichers.push(new LinkedInEnricher());
  }
  if (booleanValue(enrichment.includeWebsite, true)) {
    enrichers.push(new WebsiteEnricher());
  }

  return enrichers;
}

async function enrichStoredCompany(
  company: StoredProspectingCompany,
  upsert: ProspectingCompanyUpsert,
  enrichers: ContactEnricher[],
  maxContacts: number,
): Promise<ProspectingScanContact[]> {
  const storedContacts: ProspectContactUpsert[] = [];
  await runEnrichmentPipeline(
    {
      enrichers,
      verifyEmail: (email) => verifyEmailAddress(email),
      saveContacts: async (contacts) => {
        storedContacts.push(...contacts);
        return contacts.map((contact, index) => ({ id: `${company.id}-contact-${index + 1}`, email: contact.email }));
      },
      updateCompanyStatus: async (_companyId, status) => {
        upsert.status = status;
      },
    },
    {
      id: company.id,
      name: company.name,
      domain: company.domain,
      linkedin_url: null,
      region: upsert.region,
    },
    { maxContacts },
  );

  return storedContacts.map((contact) => ({
    companyDomain: upsert.domain,
    companyName: upsert.name,
    full_name: contact.full_name,
    email: contact.email,
    email_confidence: contact.email_confidence,
    email_status: contact.email_status,
    role: contact.role,
    linkedin_url: contact.linkedin_url,
    source: contact.source,
    opted_out: contact.opted_out,
  }));
}

async function scoreProspectingCompany(
  aiEngine: AIEngine,
  company: NormalizedFundingEvent,
  profile: ProspectingProfile,
) {
  const prompt = [
    "Score this recently funded company for candidate outreach as strict JSON.",
    `Company JSON: ${JSON.stringify(company)}`,
    `Candidate JSON: ${JSON.stringify(profile)}`,
    'Return {"score":number,"summary":string}.',
  ].join("\n");

  try {
    const parsed = JSON.parse(await aiEngine.complete(prompt, { temperature: 0.1 })) as Record<string, unknown>;
    const score = positiveNumber(parsed.score);
    const summary = stringValue(parsed.summary);
    if (score !== undefined && summary) {
      return { score: Math.max(0, Math.min(100, score)), summary };
    }
  } catch {
    // Fall through to a deterministic local score when no AI provider is configured.
  }

  const haystack = `${company.companyName} ${company.description ?? ""} ${(company.techStack ?? []).join(" ")}`.toLowerCase();
  const matches = profile.skills.filter((skill) => haystack.includes(skill.toLowerCase())).length;
  const score = Math.min(90, 55 + matches * 10 + (company.fundingAmount ? 10 : 0));
  return {
    score,
    summary: `${company.companyName} has ${company.fundingStage ?? "recent"} funding and ${matches} visible skill matches.`,
  };
}

function profileFromConfig(value: unknown): ProspectingProfile {
  if (!isRecord(value)) {
    return {
      targetRole: "Software Engineer",
      skills: [],
      summary: "",
    };
  }
  return {
    targetRole: stringValue(value.targetRole) ?? "Software Engineer",
    skills: Array.isArray(value.skills) ? value.skills.filter((skill): skill is string => typeof skill === "string") : [],
    summary: stringValue(value.summary) ?? "",
  };
}

function fundingRegion(value: unknown): FundingRegion | null {
  return value === "india" || value === "global" || value === "us" || value === "eu" || value === "sea"
    ? value
    : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function positiveNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
