import { describe, expect, it } from "vitest";
import { ApolloEnricher } from "./apollo-enricher.js";
import { HunterEnricher } from "./hunter-enricher.js";
import { SnovEnricher } from "./snov-enricher.js";
import { WebsiteEnricher } from "./website-enricher.js";
import type { ProspectCompanyForEnrichment } from "./enrichment-engine.js";

const company: ProspectCompanyForEnrichment = {
  id: "company-1",
  name: "Setu",
  domain: "setu.co",
  linkedin_url: "https://linkedin.example/company/setu",
  region: "india",
};

describe("enricher connectors", () => {
  it("maps Hunter domain-search results into prospect contacts", async () => {
    const enricher = new HunterEnricher({
      apiKey: "hunter-key",
      fetchJson: async (url) => {
        expect(url).toContain("domain=setu.co");
        expect(url).toContain("api_key=hunter-key");
        return {
          data: {
            emails: [
              {
                value: "PRIYA@SETU.CO",
                first_name: "Priya",
                last_name: "Sharma",
                position: "Talent Acquisition Partner",
                confidence: 93,
                linkedin: "https://linkedin.example/in/priya",
              },
            ],
          },
        };
      },
    });

    await expect(enricher.findContacts(company)).resolves.toEqual([
      {
        fullName: "Priya Sharma",
        email: "priya@setu.co",
        role: "talent_acquisition",
        confidence: 0.93,
        source: "hunter",
        linkedinUrl: "https://linkedin.example/in/priya",
      },
    ]);
  });

  it("posts Apollo people searches for hiring roles", async () => {
    const enricher = new ApolloEnricher({
      apiKey: "apollo-key",
      fetchJson: async (_url, init) => {
        expect(init.method).toBe("POST");
        expect(init.headers).toMatchObject({ "x-api-key": "apollo-key" });
        expect(JSON.parse(String(init.body))).toMatchObject({ q_organization_domains: "setu.co" });
        return {
          people: [
            {
              name: "Aman Founder",
              email: "aman@setu.co",
              title: "Founder",
              email_status: "verified",
            },
          ],
        };
      },
    });

    await expect(enricher.findContacts(company)).resolves.toEqual([
      expect.objectContaining({
        fullName: "Aman Founder",
        email: "aman@setu.co",
        role: "founder",
        confidence: 0.85,
        source: "apollo",
      }),
    ]);
  });

  it("maps Snov domain emails with bearer auth", async () => {
    const enricher = new SnovEnricher({
      accessToken: "snov-token",
      fetchJson: async (url, init) => {
        expect(url).toContain("domain=setu.co");
        expect(init.headers).toMatchObject({ authorization: "Bearer snov-token" });
        return {
          emails: [
            {
              email: "hr@setu.co",
              firstName: "Hiring",
              lastName: "Team",
              position: "HR Manager",
              status: "valid",
            },
          ],
        };
      },
    });

    await expect(enricher.findContacts(company)).resolves.toEqual([
      expect.objectContaining({
        fullName: "Hiring Team",
        email: "hr@setu.co",
        role: "hr_manager",
        source: "snov",
      }),
    ]);
  });

  it("extracts contacts from website team markup", async () => {
    const enricher = new WebsiteEnricher({
      pages: ["/team"],
      fetchText: async () => `
        <section>
          <h2>Priya Sharma</h2>
          <p>Talent Acquisition</p>
          <a href="mailto:priya@setu.co">priya@setu.co</a>
        </section>
      `,
    });

    await expect(enricher.findContacts(company)).resolves.toEqual([
      expect.objectContaining({
        email: "priya@setu.co",
        role: "talent_acquisition",
        source: "website",
      }),
    ]);
  });
});
