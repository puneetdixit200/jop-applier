import { describe, expect, it } from "vitest";
import {
  runEnrichmentPipeline,
  type ContactEnricher,
  type ProspectCompanyForEnrichment,
  type ProspectContactUpsert,
} from "./enrichment-engine.js";

describe("enrichment engine", () => {
  it("merges enrichers, verifies emails, prioritizes hiring roles, and stores top contacts", async () => {
    const stored: ProspectContactUpsert[] = [];
    const statusUpdates: Array<{ companyId: string; status: string }> = [];

    const result = await runEnrichmentPipeline(
      {
        enrichers: [
          enricher("hunter", [
            {
              fullName: "Priya Sharma",
              email: "PRIYA@SETU.CO",
              role: "hr_manager",
              confidence: 0.9,
              source: "hunter",
            },
            {
              fullName: "Dev Lead",
              email: "dev@setu.co",
              role: "engineering_manager",
              confidence: 0.7,
              source: "hunter",
            },
          ]),
          enricher("website", [
            {
              fullName: "Priya S.",
              email: "priya@setu.co",
              role: "recruiter",
              confidence: 0.65,
              source: "website",
            },
            {
              fullName: "Bad Address",
              email: "bad-address",
              role: "founder",
              confidence: 0.95,
              source: "website",
            },
            {
              fullName: "Aman Founder",
              email: "aman@setu.co",
              role: "founder",
              confidence: 0.8,
              source: "website",
            },
          ]),
        ],
        verifyEmail: async (email) => ({
          status: email.includes("bad") ? "invalid" : "valid",
          confidenceMultiplier: email.startsWith("dev") ? 0.75 : 1,
        }),
        saveContacts: async (contacts) => {
          stored.push(...contacts);
          return contacts.map((contact, index) => ({ id: `contact-${index + 1}`, email: contact.email }));
        },
        updateCompanyStatus: async (companyId, status) => {
          statusUpdates.push({ companyId, status });
        },
      },
      company(),
      { maxContacts: 2 },
    );

    expect(result).toEqual({
      companyId: "company-1",
      discovered: 5,
      stored: 2,
      status: "enriched",
    });
    expect(stored).toEqual([
      expect.objectContaining({
        company_id: "company-1",
        full_name: "Priya Sharma",
        email: "priya@setu.co",
        email_status: "valid",
        role: "hr_manager",
        source: "hunter",
      }),
      expect.objectContaining({
        company_id: "company-1",
        full_name: "Aman Founder",
        email: "aman@setu.co",
        role: "founder",
      }),
    ]);
    expect(statusUpdates).toEqual([{ companyId: "company-1", status: "enriched" }]);
  });

  it("marks companies without domains as no_domain and skips contact discovery", async () => {
    const statusUpdates: Array<{ companyId: string; status: string }> = [];

    const result = await runEnrichmentPipeline(
      {
        enrichers: [
          enricher("hunter", [
            {
              fullName: "Unused",
              email: "unused@example.com",
              role: "recruiter",
              confidence: 0.8,
              source: "hunter",
            },
          ]),
        ],
        verifyEmail: async () => ({ status: "valid", confidenceMultiplier: 1 }),
        saveContacts: async () => {
          throw new Error("contacts should not be saved without a domain");
        },
        updateCompanyStatus: async (companyId, status) => {
          statusUpdates.push({ companyId, status });
        },
      },
      { ...company(), domain: null },
    );

    expect(result).toEqual({
      companyId: "company-1",
      discovered: 0,
      stored: 0,
      status: "no_domain",
    });
    expect(statusUpdates).toEqual([{ companyId: "company-1", status: "no_domain" }]);
  });
});

function company(): ProspectCompanyForEnrichment {
  return {
    id: "company-1",
    name: "Setu",
    domain: "setu.co",
    linkedin_url: "https://linkedin.example/company/setu",
    region: "india",
  };
}

function enricher(id: string, contacts: Awaited<ReturnType<ContactEnricher["findContacts"]>>): ContactEnricher {
  return {
    id,
    findContacts: async () => contacts,
  };
}
