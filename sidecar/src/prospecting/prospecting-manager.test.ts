import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  runProspectingScan,
  type ProspectingCompanyUpsert,
} from "./prospecting-manager.js";
import type { FundingSource, NormalizedFundingEvent } from "./interfaces.js";

describe("prospecting manager", () => {
  it("scans funding sources, deduplicates companies, scores relevance, and persists prospects", async () => {
    const bus = new EventBus<CareerEventMap>();
    const discoveredEvents: Array<CareerEventMap["prospecting.company_discovered"]> = [];
    const saved: ProspectingCompanyUpsert[] = [];

    bus.on("prospecting.company_discovered", (event) => discoveredEvents.push(event));

    const result = await runProspectingScan(
      {
        sources: [
          source("inc42", [
            event({ companyName: "Setu", companyDomain: "setu.co", source: "inc42" }),
            event({ companyName: "Zolve", companyDomain: null, source: "inc42" }),
          ]),
          source("crunchbase", [
            event({
              companyName: "Setu by Pine Labs",
              companyDomain: "https://www.setu.co",
              source: "crunchbase",
              fundingAmount: 30_000_000,
            }),
          ]),
        ],
        scoreCompany: async (company, profile) => ({
          score: company.companyName.includes("Setu") ? 91 : 62,
          summary: `${company.companyName} matches ${profile.targetRole}`,
        }),
        saveCompanies: async (companies) => {
          saved.push(...companies);
          return companies.map((company, index) => ({
            id: `company-${index + 1}`,
            name: company.name,
            domain: company.domain,
            status: company.status,
            relevance_score: company.relevance_score,
          }));
        },
      },
      {
        profile: {
          targetRole: "Backend Engineer",
          skills: ["APIs", "Fintech"],
          summary: "Builds payment APIs",
        },
        minRelevanceScore: 70,
        eventBus: bus,
      },
    );

    expect(result).toEqual({
      sources: 2,
      discovered: 3,
      deduped: 2,
      qualified: 1,
      stored: 2,
      companies: [
        expect.objectContaining({
          name: "Setu",
          domain: "setu.co",
          funding_amount: 30_000_000,
          status: "discovered",
          relevance_score: 91,
        }),
        expect.objectContaining({
          name: "Zolve",
          domain: null,
          status: "no_domain",
          relevance_score: 62,
        }),
      ],
    });
    expect(saved).toEqual([
      expect.objectContaining({
        name: "Setu",
        domain: "setu.co",
        funding_amount: 30_000_000,
        status: "discovered",
        relevance_score: 91,
        ai_summary: "Setu matches Backend Engineer",
      }),
      expect.objectContaining({
        name: "Zolve",
        domain: null,
        status: "no_domain",
        relevance_score: 62,
      }),
    ]);
    expect(discoveredEvents).toEqual([
      {
        companyId: "company-1",
        companyName: "Setu",
        domain: "setu.co",
        relevanceScore: 91,
        source: "inc42",
        discoveredAt: new Date("2026-05-23T02:30:00.000Z"),
      },
      {
        companyId: "company-2",
        companyName: "Zolve",
        domain: null,
        relevanceScore: 62,
        source: "inc42",
        discoveredAt: new Date("2026-05-23T02:30:00.000Z"),
      },
    ]);
  });
});

function source(id: string, events: NormalizedFundingEvent[]): FundingSource {
  return {
    id,
    fetchFundingEvents: async () => events,
  };
}

function event(overrides: Partial<NormalizedFundingEvent>): NormalizedFundingEvent {
  return {
    companyName: "Example",
    companyDomain: "example.com",
    companyLinkedIn: null,
    fundingStage: "seed",
    fundingAmount: null,
    fundingCurrency: "USD",
    fundingDate: new Date("2026-05-23T02:30:00.000Z"),
    investors: [],
    leadInvestor: null,
    source: "test",
    sourceUrl: "https://source.example",
    region: "india",
    description: null,
    techStack: [],
    headcount: null,
    aiSummary: null,
    relevanceScore: null,
    ...overrides,
  };
}
