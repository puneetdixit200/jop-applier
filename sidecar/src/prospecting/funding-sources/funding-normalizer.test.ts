import { describe, expect, it } from "vitest";
import {
  dedupeFundingEvents,
  dedupeKey,
  normalizeCompanyDomain,
  normalizeFundingEvent,
} from "./funding-normalizer.js";
import type { NormalizedFundingEvent } from "../interfaces.js";

describe("funding normalizer", () => {
  it("normalizes source-specific funding records into the ProspectCave shape", () => {
    expect(
      normalizeFundingEvent({
        companyName: " Setu by Pine Labs ",
        companyDomain: "https://www.setu.co/",
        fundingStage: "Series A",
        fundingAmount: "30m",
        fundingCurrency: "USD",
        fundingDate: "2026-05-01",
        investors: "Bharat Inclusion Fund, Lightspeed",
        leadInvestor: "Bharat Inclusion Fund",
        source: "inc42",
        sourceUrl: "https://inc42.example/setu-series-a",
        region: "india",
        description: "API infrastructure for fintech teams",
        techStack: "Python, AWS, React",
      }),
    ).toMatchObject({
      companyName: "Setu by Pine Labs",
      companyDomain: "setu.co",
      fundingStage: "series_a",
      fundingAmount: 30_000_000,
      fundingCurrency: "USD",
      fundingDate: new Date("2026-05-01T00:00:00.000Z"),
      investors: ["Bharat Inclusion Fund", "Lightspeed"],
      leadInvestor: "Bharat Inclusion Fund",
      source: "inc42",
      sourceUrl: "https://inc42.example/setu-series-a",
      region: "india",
      description: "API infrastructure for fintech teams",
      techStack: ["Python", "AWS", "React"],
    });
  });

  it("deduplicates by cleaned domain first and normalized company name second", () => {
    const setu = fundingEvent({
      companyName: "Setu",
      companyDomain: "https://www.setu.co",
      source: "inc42",
      description: "Banking APIs",
    });
    const duplicate = fundingEvent({
      companyName: "Setu by Pine Labs",
      companyDomain: "setu.co/",
      source: "crunchbase",
      techStack: ["React"],
      aiSummary: "Fintech infrastructure startup",
    });
    const noDomain = fundingEvent({
      companyName: " Zolve Technologies Pvt Ltd ",
      companyDomain: null,
      source: "yourstory",
    });
    const noDomainDuplicate = fundingEvent({
      companyName: "zolve-technologies pvt. ltd.",
      companyDomain: null,
      source: "techcrunch",
      fundingAmount: 100_000_000,
    });

    expect(normalizeCompanyDomain("https://www.setu.co/jobs")).toBe("setu.co");
    expect(dedupeKey(setu)).toBe("setu.co");
    expect(dedupeKey(noDomain)).toBe("zolvetechnologiespvtltd");

    const deduped = dedupeFundingEvents([setu, duplicate, noDomain, noDomainDuplicate]);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]).toMatchObject({
      companyName: "Setu",
      source: "inc42",
      description: "Banking APIs",
      techStack: ["React"],
      aiSummary: "Fintech infrastructure startup",
    });
    expect(deduped[1]).toMatchObject({
      companyName: " Zolve Technologies Pvt Ltd ",
      source: "yourstory",
      fundingAmount: 100_000_000,
    });
  });
});

function fundingEvent(overrides: Partial<NormalizedFundingEvent>): NormalizedFundingEvent {
  return {
    companyName: "Example",
    companyDomain: "example.com",
    companyLinkedIn: null,
    fundingStage: "seed",
    fundingAmount: null,
    fundingCurrency: "USD",
    fundingDate: new Date("2026-05-01T00:00:00.000Z"),
    investors: [],
    leadInvestor: null,
    source: "test",
    sourceUrl: "https://source.example",
    region: "global",
    ...overrides,
  };
}
