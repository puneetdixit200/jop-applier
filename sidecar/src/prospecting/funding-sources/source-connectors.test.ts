import { describe, expect, it } from "vitest";
import { CrunchbaseSource } from "./crunchbase-source.js";
import { Inc42Source } from "./inc42-source.js";

describe("funding source connectors", () => {
  it("maps Inc42 RSS funding items into normalized funding events", async () => {
    const source = new Inc42Source({
      feedUrl: "https://inc42.example/feed",
      fetchText: async () => `
        <rss><channel>
          <item>
            <title>Setu raises $30M Series A led by Bharat Inclusion Fund</title>
            <link>https://inc42.example/setu</link>
            <pubDate>Sat, 23 May 2026 04:30:00 GMT</pubDate>
            <description>Setu is a fintech API platform using React and AWS.</description>
          </item>
        </channel></rss>
      `,
    });

    await expect(source.fetchFundingEvents()).resolves.toEqual([
      expect.objectContaining({
        companyName: "Setu",
        fundingAmount: 30_000_000,
        fundingStage: "series_a",
        leadInvestor: "Bharat Inclusion Fund",
        source: "inc42",
        sourceUrl: "https://inc42.example/setu",
        region: "india",
      }),
    ]);
  });

  it("maps Crunchbase API rounds into normalized funding events", async () => {
    const source = new CrunchbaseSource({
      apiKey: "cb-key",
      fetchJson: async (url, headers) => {
        expect(url).toContain("funding_rounds");
        expect(headers.Authorization).toBe("Bearer cb-key");
        return {
          entities: [
            {
              company_name: "OrbitWorks",
              website: "https://orbit.example",
              linkedin_url: "https://linkedin.example/company/orbit",
              funding_type: "series_b",
              money_raised_usd: 42_000_000,
              announced_on: "2026-05-20",
              investors: ["Accel", "Sequoia"],
              lead_investor: "Accel",
              permalink: "https://crunchbase.example/orbit",
              short_description: "Developer workflow automation",
            },
          ],
        };
      },
    });

    await expect(source.fetchFundingEvents()).resolves.toEqual([
      expect.objectContaining({
        companyName: "OrbitWorks",
        companyDomain: "orbit.example",
        companyLinkedIn: "https://linkedin.example/company/orbit",
        fundingStage: "series_b",
        fundingAmount: 42_000_000,
        investors: ["Accel", "Sequoia"],
        leadInvestor: "Accel",
        source: "crunchbase",
        region: "global",
      }),
    ]);
  });
});
