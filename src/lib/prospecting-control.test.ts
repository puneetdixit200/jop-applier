import { describe, expect, it, vi } from "vitest";
import {
  buildFindMoreProspectContactsDraft,
  buildManualProspectingCompanyDraft,
  buildProspectingOutreachDraft,
  runProspectingScanControl,
  type ProspectingControlDependencies,
} from "./prospecting-control";
import type { FundedCompany, ProspectContact, SidecarRuntimeStatus } from "./tauri-api";
import type { ProspectingCompanyDetail } from "./prospecting-dashboard";

function desktopDependencies(overrides: Partial<ProspectingControlDependencies> = {}): ProspectingControlDependencies {
  return {
    isDesktopRuntime: () => true,
    getSidecarStatus: vi.fn(async () => runtimeStatus),
    runSidecarWorkflow: vi.fn(async () => ({ sources: 1, discovered: 1, stored: 1 })),
    listFundedCompanies: vi.fn(async () => [fundedCompany]),
    listProspectContacts: vi.fn(async () => [prospectContact]),
    ...overrides,
  };
}

const runtimeStatus: SidecarRuntimeStatus = {
  status: "ready",
  workflows: ["prospecting-scan"],
  provider: {
    provider: "ollama",
    model: "qwen2.5:0.5b",
    local: true,
  },
};

const fundedCompany: FundedCompany = {
  id: "setu",
  name: "Setu",
  domain: "setu.co",
  description: "API infrastructure",
  industry: "Fintech",
  tech_stack: ["TypeScript"],
  funding_stage: "series_a",
  funding_amount: 30_000_000,
  funding_currency: "USD",
  funding_date: "2026-05-01T00:00:00.000Z",
  investors: ["Lightspeed"],
  lead_investor: "Lightspeed",
  source: "inc42",
  source_url: "https://inc42.example/setu",
  region: "india",
  relevance_score: 91,
  ai_summary: "Strong API fit",
  status: "discovered",
  created_at: "2026-05-23T04:30:00.000Z",
  updated_at: "2026-05-23T04:30:00.000Z",
};

const prospectContact: ProspectContact = {
  id: "setu-priya",
  company_id: "setu",
  full_name: "Priya Sharma",
  email: "priya@setu.co",
  email_confidence: 0.91,
  email_status: "valid",
  role: "hr_manager",
  linkedin_url: null,
  source: "hunter",
  opted_out: false,
  created_at: "2026-05-23T04:30:00.000Z",
};

describe("prospecting control", () => {
  it("runs the desktop prospecting scan workflow and reloads persisted companies and contacts", async () => {
    const dependencies = desktopDependencies();

    await expect(runProspectingScanControl(dependencies)).resolves.toEqual({
      workflowStatus: "prospecting-scan completed",
      runtimeStatus: {
        providerLabel: "ollama:qwen2.5:0.5b",
        runtimeStatus: "ready",
        statusMessage: "ready · 1 workflows",
        workflowCount: 1,
      },
      companies: [fundedCompany],
      contacts: [prospectContact],
    });
    expect(dependencies.runSidecarWorkflow).toHaveBeenCalledWith("prospecting-scan");
    expect(dependencies.listFundedCompanies).toHaveBeenCalledOnce();
    expect(dependencies.listProspectContacts).toHaveBeenCalledWith("setu");
  });

  it("does not call desktop APIs in browser preview mode", async () => {
    const dependencies = desktopDependencies({
      isDesktopRuntime: () => false,
    });

    await expect(runProspectingScanControl(dependencies)).resolves.toEqual({
      workflowStatus: "Browser preview",
      runtimeStatus: null,
      companies: null,
      contacts: null,
    });
    expect(dependencies.runSidecarWorkflow).not.toHaveBeenCalled();
    expect(dependencies.listFundedCompanies).not.toHaveBeenCalled();
  });

  it("builds a manual review outreach draft from the selected company detail", () => {
    expect(buildProspectingOutreachDraft(companyDetail, "2026-05-23T04:30:00.000Z")).toEqual({
      campaign: {
        company_id: "setu",
        campaign_type: "hr_outreach",
        status: "draft",
        sequence_json: "[{\"step\":1,\"delayDays\":0},{\"step\":2,\"delayDays\":3},{\"step\":3,\"delayDays\":7}]",
        auto_approve: false,
        max_emails_per_day: 30,
      },
      email: {
        contact_id: "setu-priya",
        sequence_step: 1,
        subject: "Congrats on Series A - $30M",
        body_html: "<p>Hi Priya,</p><p>Saw Setu&#39;s Series A - $30M funding. Strong fit for API and platform roles.</p><p>Your work around TypeScript, Rust lines up with my background. Would you be open to a quick conversation?</p>",
        status: "pending",
        scheduled_at: "2026-05-23T04:30:00.000Z",
        sent_at: null,
        message_id: null,
      },
      contactLabel: "Priya Recruiter <priya@setu.co>",
    });
    expect(buildProspectingOutreachDraft({ ...companyDetail, contacts: [] }, "2026-05-23T04:30:00.000Z")).toBeNull();
  });

  it("builds an enriched manual prospect from entered company and contact details", () => {
    expect(
      buildManualProspectingCompanyDraft(
        {
          name: "  Acme AI  ",
          domain: "https://www.acme.ai/careers",
          region: "India",
          fundingStage: "Series A",
          fundingAmount: "$12,500,000",
          industry: "Developer tools",
          techStack: "React, Rust, AI",
          sourceUrl: " https://news.example/acme-funding ",
          contactName: " Mira Patel ",
          contactEmail: " Mira@Acme.AI ",
          contactRole: "Talent Partner",
        },
        "2026-05-23T04:30:00.000Z",
      ),
    ).toEqual({
      company: {
        name: "Acme AI",
        domain: "acme.ai",
        description: "Manually added prospect for Acme AI.",
        industry: "Developer tools",
        tech_stack: ["React", "Rust", "AI"],
        funding_stage: "series_a",
        funding_amount: 12_500_000,
        funding_currency: "USD",
        funding_date: "2026-05-23T04:30:00.000Z",
        investors: [],
        lead_investor: null,
        source: "manual",
        source_url: "https://news.example/acme-funding",
        region: "india",
        relevance_score: 65,
        ai_summary: "Manual prospect added for targeted enrichment and outreach.",
        status: "enriched",
      },
      contact: {
        full_name: "Mira Patel",
        email: "mira@acme.ai",
        email_confidence: 0.72,
        email_status: "unknown",
        role: "talent_partner",
        linkedin_url: null,
        source: "manual",
        opted_out: false,
      },
      displayName: "Acme AI",
    });
  });

  it("requires manual prospect company name and domain before saving", () => {
    const draft = {
      name: "",
      domain: " ",
      region: "India",
      fundingStage: "",
      fundingAmount: "",
      industry: "",
      techStack: "",
      sourceUrl: "",
      contactName: "",
      contactEmail: "",
      contactRole: "Recruiter",
    };

    expect(buildManualProspectingCompanyDraft(draft, "2026-05-23T04:30:00.000Z")).toBeNull();
  });

  it("builds pattern-guessed contacts while skipping existing prospect emails", () => {
    expect(buildFindMoreProspectContactsDraft(companyDetail)).toEqual({
      companyId: "setu",
      contacts: [
        {
          full_name: "Setu Talent Team",
          email: "talent@setu.co",
          email_confidence: 0.55,
          email_status: "unknown",
          role: "talent_acquisition",
          linkedin_url: null,
          source: "pattern_guess",
          opted_out: false,
        },
        {
          full_name: "Setu Recruiting Team",
          email: "careers@setu.co",
          email_confidence: 0.5,
          email_status: "unknown",
          role: "recruiter",
          linkedin_url: null,
          source: "pattern_guess",
          opted_out: false,
        },
        {
          full_name: "Setu Founder Team",
          email: "founders@setu.co",
          email_confidence: 0.45,
          email_status: "unknown",
          role: "founder",
          linkedin_url: null,
          source: "pattern_guess",
          opted_out: false,
        },
      ],
    });

    expect(
      buildFindMoreProspectContactsDraft({
        ...companyDetail,
        contacts: [
          ...companyDetail.contacts,
          {
            id: "setu-talent",
            name: "Talent",
            email: "talent@setu.co",
            roleLabel: "Talent Acquisition",
            confidenceLabel: "55%",
            statusLabel: "Unknown",
            sourceLabel: "pattern_guess",
          },
        ],
      })?.contacts.map((contact) => contact.email),
    ).toEqual(["careers@setu.co", "founders@setu.co", "engineering@setu.co"]);
  });

  it("does not build pattern-guessed contacts without a company domain", () => {
    expect(buildFindMoreProspectContactsDraft({ ...companyDetail, domainLabel: "No domain" })).toBeNull();
  });
});

const companyDetail: ProspectingCompanyDetail = {
  id: "setu",
  companyName: "Setu",
  domainLabel: "setu.co",
  description: "API infrastructure for fintech teams.",
  fundingLabel: "Series A - $30M",
  sourceLabel: "inc42",
  sourceUrl: "https://inc42.example/setu",
  scoreLabel: "91",
  statusLabel: "Discovered",
  techStackLabel: "TypeScript, Rust",
  investorLabel: "Lightspeed",
  leadInvestorLabel: "Lightspeed",
  summary: "Strong fit for API and platform roles.",
  contacts: [
    {
      id: "setu-priya",
      name: "Priya Recruiter",
      email: "priya@setu.co",
      roleLabel: "Hr Manager",
      confidenceLabel: "91%",
      statusLabel: "Valid",
      sourceLabel: "hunter",
    },
  ],
};
