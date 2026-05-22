import { describe, expect, it } from "vitest";
import {
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
          company({ id: "zolve", name: "Zolve", relevance_score: 82, region: "india", status: "queued" }),
          company({ id: "groww", name: "Groww", relevance_score: 58, region: "india", status: "draft" }),
          company({ id: "setu", name: "Setu", relevance_score: 91, region: "india", status: "review" }),
        ],
        contacts: [
          contact({ id: "c1", company_id: "setu" }),
          contact({ id: "c2", company_id: "setu" }),
          contact({ id: "c3", company_id: "zolve" }),
        ],
      },
      { region: "india", minScore: 70 },
    );

    expect(dashboard.rows.map((row) => [row.companyName, row.score, row.contacts, row.statusLabel])).toEqual([
      ["Setu", 91, 2, "Review"],
      ["Zolve", 82, 1, "Queued"],
    ]);
    expect(dashboard.summary).toEqual({
      companies: 2,
      contacts: 3,
      averageScore: 87,
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
