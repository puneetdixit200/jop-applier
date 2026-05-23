import { describe, expect, it } from "vitest";
import {
  applyOutreachReviewDecision,
  buildOutreachCompanyAnalytics,
  buildOutreachDailyVolume,
  buildOutreachReviewPanel,
  buildProspectingFilterOptions,
  buildProspectingCompanyDetail,
  buildOutreachAnalytics,
  buildOutreachReviewQueue,
  buildProspectingDashboard,
} from "./prospecting-dashboard";
import type { FundedCompany, OutreachEmail, ProspectContact } from "./tauri-api";

describe("prospecting dashboard helpers", () => {
  it("sorts funded companies by relevance and filters dashboard rows", () => {
    const dashboard = buildProspectingDashboard(
      {
        companies: [
          company({ id: "zolve", name: "Zolve", funding_stage: "series_b", relevance_score: 82, region: "india", status: "queued" }),
          company({ id: "groww", name: "Groww", funding_stage: "series_e", relevance_score: 58, region: "india", status: "draft" }),
          company({ id: "setu", name: "Setu", funding_stage: "series_a", relevance_score: 91, region: "india", status: "review" }),
        ],
        contacts: [
          contact({ id: "c1", company_id: "setu" }),
          contact({ id: "c2", company_id: "setu" }),
          contact({ id: "c3", company_id: "zolve" }),
        ],
      },
      { region: "india", fundingStage: "series_a", minScore: 70 },
    );

    expect(dashboard.rows.map((row) => [row.companyName, row.score, row.contacts, row.statusLabel])).toEqual([
      ["Setu", 91, 2, "Review"],
    ]);
    expect(dashboard.summary).toEqual({
      companies: 1,
      contacts: 3,
      averageScore: 91,
    });
  });

  it("builds prospecting filter option labels from company data", () => {
    expect(
      buildProspectingFilterOptions([
        company({ region: "india", funding_stage: "series_a", status: "review" }),
        company({ region: "india", funding_stage: "seed", status: "draft" }),
        company({ region: "global", funding_stage: null, status: "review" }),
      ]),
    ).toEqual({
      regions: [
        { value: "global", label: "Global" },
        { value: "india", label: "India" },
      ],
      fundingStages: [
        { value: "seed", label: "Seed" },
        { value: "series_a", label: "Series A" },
      ],
      statuses: [
        { value: "draft", label: "Draft" },
        { value: "review", label: "Review" },
      ],
    });
  });

  it("builds review queue cards and outreach analytics from outreach emails", () => {
    const companies = [company({ id: "setu", name: "Setu" })];
    const contacts = [contact({ id: "contact-1", company_id: "setu", full_name: "Priya", email: "priya@setu.co" })];
    const emails = [
      email({ id: "pending-1", contact_id: "contact-1", status: "pending", scheduled_at: "2026-05-23T04:30:00.000Z" }),
      email({ id: "sent-1", contact_id: "contact-1", status: "sent", sent_at: "2026-05-22T04:30:00.000Z" }),
      email({ id: "opened-1", contact_id: "contact-1", status: "opened", sent_at: "2026-05-21T04:30:00.000Z" }),
      email({ id: "replied-1", contact_id: "contact-1", status: "replied", sent_at: "2026-05-20T04:30:00.000Z" }),
      email({ id: "bounced-1", contact_id: "contact-1", status: "bounced", sent_at: "2026-05-19T04:30:00.000Z" }),
    ];

    expect(buildOutreachReviewQueue({ companies, contacts, emails })).toEqual([
      {
        id: "pending-1",
        companyName: "Setu",
        contactLabel: "Priya <priya@setu.co>",
        subject: "Congrats on the Series A",
        bodyPreview: "Hi Priya, saw the funding news.",
        sequenceStep: 1,
        scheduledAt: "2026-05-23T04:30:00.000Z",
      },
    ]);
    expect(buildOutreachAnalytics(emails)).toEqual({
      sent: 4,
      opened: 1,
      replied: 1,
      bounced: 1,
      openRate: 25,
      replyRate: 25,
      bounceRate: 25,
    });
  });

  it("summarizes outreach analytics by sent day and company response", () => {
    const companies = [
      company({ id: "setu", name: "Setu" }),
      company({ id: "zolve", name: "Zolve" }),
      company({ id: "groww", name: "Groww" }),
    ];
    const contacts = [
      contact({ id: "setu-priya", company_id: "setu" }),
      contact({ id: "zolve-divya", company_id: "zolve" }),
      contact({ id: "groww-asha", company_id: "groww" }),
    ];
    const emails = [
      email({ id: "setu-replied", contact_id: "setu-priya", status: "replied", sent_at: "2026-05-21T04:30:00.000Z" }),
      email({ id: "setu-opened", contact_id: "setu-priya", status: "opened", sent_at: "2026-05-22T04:30:00.000Z" }),
      email({ id: "zolve-sent", contact_id: "zolve-divya", status: "sent", sent_at: "2026-05-22T05:30:00.000Z" }),
      email({ id: "groww-queued", contact_id: "groww-asha", status: "queued", scheduled_at: "2026-05-23T04:30:00.000Z" }),
      email({ id: "missing-contact", contact_id: "missing", status: "bounced", sent_at: "2026-05-23T04:30:00.000Z" }),
    ];

    expect(buildOutreachDailyVolume(emails)).toEqual([
      { dateLabel: "May 21", count: 1, widthPercent: 50 },
      { dateLabel: "May 22", count: 2, widthPercent: 100 },
      { dateLabel: "May 23", count: 1, widthPercent: 50 },
    ]);

    expect(buildOutreachCompanyAnalytics({ companies, contacts, emails })).toEqual([
      {
        companyName: "Setu",
        responseLabel: "Replied",
        responseTone: "green",
        sent: 2,
        opened: 1,
        replied: 1,
        bounced: 0,
        queued: 0,
        pending: 0,
      },
      {
        companyName: "Zolve",
        responseLabel: "Sent, no open",
        responseTone: "blue",
        sent: 1,
        opened: 0,
        replied: 0,
        bounced: 0,
        queued: 0,
        pending: 0,
      },
      {
        companyName: "Groww",
        responseLabel: "Queued",
        responseTone: "violet",
        sent: 0,
        opened: 0,
        replied: 0,
        bounced: 0,
        queued: 1,
        pending: 0,
      },
      {
        companyName: "Unknown company",
        responseLabel: "Bounced",
        responseTone: "red",
        sent: 1,
        opened: 0,
        replied: 0,
        bounced: 1,
        queued: 0,
        pending: 0,
      },
    ]);
  });

  it("builds a selected review panel and applies review decisions", () => {
    const companies = [company({ id: "setu", name: "Setu" })];
    const contacts = [contact({ id: "contact-1", company_id: "setu", full_name: "Priya", email: "priya@setu.co" })];
    const emails = [
      email({
        id: "pending-2",
        contact_id: "contact-1",
        subject: "Follow-up on API roles",
        body_html: "<p>Hi Priya,</p><p>Sharing one more relevant platform project.</p>",
        scheduled_at: "2026-05-24T04:30:00.000Z",
        sequence_step: 2,
      }),
      email({
        id: "pending-1",
        contact_id: "contact-1",
        body_html: "<p>Hi Priya,</p><p>Saw the funding news &amp; your API expansion.</p>",
        scheduled_at: "2026-05-23T04:30:00.000Z",
      }),
    ];

    expect(buildOutreachReviewPanel({ companies, contacts, emails, selectedEmailId: "pending-2" })).toEqual({
      id: "pending-2",
      companyName: "Setu",
      contactLabel: "Priya <priya@setu.co>",
      subject: "Follow-up on API roles",
      bodyPreview: "Hi Priya, Sharing one more relevant platform project.",
      bodyText: "Hi Priya,\n\nSharing one more relevant platform project.",
      sequenceStep: 2,
      scheduledAt: "2026-05-24T04:30:00.000Z",
      currentPosition: 2,
      total: 2,
      previousEmailId: "pending-1",
      nextEmailId: null,
    });
    expect(buildOutreachReviewPanel({ companies, contacts, emails, selectedEmailId: "missing" })?.id).toBe("pending-1");

    expect(applyOutreachReviewDecision(emails[0], "approve")).toMatchObject({ id: "pending-2", status: "queued" });
    expect(applyOutreachReviewDecision(emails[0], "reject")).toMatchObject({ id: "pending-2", status: "rejected" });
    expect(applyOutreachReviewDecision(email({ status: "sent" }), "approve")).toMatchObject({ status: "sent" });
  });

  it("builds a company detail view with ranked contacts and funding context", () => {
    const detail = buildProspectingCompanyDetail({
      companyId: "setu",
      companies: [
        company({
          id: "setu",
          name: "Setu",
          domain: "setu.co",
          description: "API infrastructure for fintech teams.",
          tech_stack: ["TypeScript", "Rust"],
          funding_stage: "series_a",
          funding_amount: 30_000_000,
          funding_currency: "USD",
          funding_date: "2026-05-01T00:00:00.000Z",
          investors: ["Lightspeed", "Accel"],
          lead_investor: "Lightspeed",
          source: "inc42",
          source_url: "https://inc42.example/setu-funding",
          relevance_score: 91,
          ai_summary: "Strong fit for API and platform roles.",
          status: "enriched",
        }),
      ],
      contacts: [
        contact({
          id: "founder",
          company_id: "setu",
          full_name: "Aman Founder",
          email: "aman@setu.co",
          email_confidence: 0.82,
          role: "founder",
          source: "linkedin",
        }),
        contact({
          id: "recruiter",
          company_id: "setu",
          full_name: "Priya Recruiter",
          email: "priya@setu.co",
          email_confidence: 0.91,
          role: "recruiter",
          source: "hunter",
        }),
      ],
    });

    expect(detail).toEqual({
      id: "setu",
      companyName: "Setu",
      domainLabel: "setu.co",
      description: "API infrastructure for fintech teams.",
      fundingLabel: "Series A - $30M",
      sourceLabel: "inc42",
      sourceUrl: "https://inc42.example/setu-funding",
      scoreLabel: "91",
      statusLabel: "Enriched",
      techStackLabel: "TypeScript, Rust",
      investorLabel: "Lightspeed, Accel",
      leadInvestorLabel: "Lightspeed",
      summary: "Strong fit for API and platform roles.",
      contacts: [
        {
          id: "recruiter",
          name: "Priya Recruiter",
          email: "priya@setu.co",
          roleLabel: "Recruiter",
          confidenceLabel: "91%",
          statusLabel: "Valid",
          sourceLabel: "hunter",
        },
        {
          id: "founder",
          name: "Aman Founder",
          email: "aman@setu.co",
          roleLabel: "Founder",
          confidenceLabel: "82%",
          statusLabel: "Valid",
          sourceLabel: "linkedin",
        },
      ],
    });
    expect(buildProspectingCompanyDetail({ companyId: "missing", companies: [], contacts: [] })).toBeNull();
  });
});

function company(overrides: Partial<FundedCompany> = {}): FundedCompany {
  return {
    id: "company",
    name: "Company",
    domain: "company.example",
    description: "Company description",
    industry: "Fintech",
    tech_stack: [],
    funding_stage: "series_a",
    funding_amount: 30_000_000,
    funding_currency: "USD",
    funding_date: "2026-05-01T00:00:00.000Z",
    investors: [],
    lead_investor: null,
    source: "inc42",
    source_url: "https://source.example",
    region: "india",
    relevance_score: 70,
    ai_summary: "Relevant company",
    status: "discovered",
    created_at: "2026-05-23T04:30:00.000Z",
    updated_at: "2026-05-23T04:30:00.000Z",
    ...overrides,
  };
}

function contact(overrides: Partial<ProspectContact> = {}): ProspectContact {
  return {
    id: "contact",
    company_id: "company",
    full_name: "Priya",
    email: "priya@company.example",
    email_confidence: 0.9,
    email_status: "valid",
    role: "hr_manager",
    linkedin_url: null,
    source: "hunter",
    opted_out: false,
    created_at: "2026-05-23T04:30:00.000Z",
    ...overrides,
  };
}

function email(overrides: Partial<OutreachEmail> = {}): OutreachEmail {
  return {
    id: "email",
    campaign_id: "campaign",
    contact_id: "contact",
    sequence_step: 1,
    subject: "Congrats on the Series A",
    body_html: "<p>Hi Priya, saw the funding news.</p>",
    status: "pending",
    scheduled_at: "2026-05-23T04:30:00.000Z",
    sent_at: null,
    message_id: null,
    created_at: "2026-05-23T04:30:00.000Z",
    ...overrides,
  };
}
