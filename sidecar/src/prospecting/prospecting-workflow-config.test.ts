import { describe, expect, it } from "vitest";
import type { AIEngine } from "../ai/ai-engine.js";
import { createProspectingDependenciesFromWorkflowInput } from "./prospecting-workflow-config.js";

describe("prospecting workflow config", () => {
  it("builds funding sources, AI scoring, and enrichment from workflow input", async () => {
    const configured = createProspectingDependenciesFromWorkflowInput(
      {
        prospectingScan: {
          profile: {
            targetRole: "Frontend Engineer",
            skills: ["React", "TypeScript"],
            summary: "Builds web apps",
          },
          minRelevanceScore: 65,
          sources: {
            inc42: true,
            rssSources: [
              {
                id: "custom-feed",
                feedUrl: "https://funding.example/feed",
                region: "india",
              },
            ],
          },
          enrichment: {
            includeWebsite: true,
            maxContacts: 2,
          },
        },
      },
      {
        aiEngine: {
          complete: async () => JSON.stringify({ score: 88, summary: "Strong fit" }),
        } as unknown as AIEngine,
      },
    );

    expect(configured?.profile).toEqual({
      targetRole: "Frontend Engineer",
      skills: ["React", "TypeScript"],
      summary: "Builds web apps",
    });
    expect(configured?.minRelevanceScore).toBe(65);
    expect(configured?.dependencies.sources.map((source) => source.id)).toEqual([
      "inc42",
      "custom-feed",
    ]);
    await expect(
      configured?.dependencies.scoreCompany(
        {
          companyName: "Setu",
          companyDomain: "setu.co",
          companyLinkedIn: null,
          fundingStage: "seed",
          fundingAmount: 1_000_000,
          fundingCurrency: "USD",
          fundingDate: new Date("2026-05-23T00:00:00Z"),
          investors: [],
          leadInvestor: null,
          source: "inc42",
          sourceUrl: "https://inc42.example/setu",
          region: "india",
          description: "React fintech API team",
          techStack: ["React"],
          headcount: null,
          aiSummary: null,
          relevanceScore: null,
        },
        configured.profile,
      ),
    ).resolves.toEqual({ score: 88, summary: "Strong fit" });
  });
});
