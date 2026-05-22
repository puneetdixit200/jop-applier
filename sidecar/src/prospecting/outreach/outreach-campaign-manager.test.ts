import { describe, expect, it } from "vitest";
import {
  createOutreachCampaign,
  type GeneratedOutreachEmail,
  type OutreachCampaignDraft,
  type OutreachEmailDraft,
} from "./outreach-campaign-manager.js";

describe("outreach campaign manager", () => {
  it("generates review-gated campaign emails with unsubscribe links and the default sequence", async () => {
    const campaigns: OutreachCampaignDraft[] = [];
    const emails: OutreachEmailDraft[] = [];
    const generatedContexts: unknown[] = [];

    const result = await createOutreachCampaign(
      {
        generateEmail: async (context): Promise<GeneratedOutreachEmail> => {
          generatedContexts.push(context);
          return {
            subject: "Congrats on the Series A",
            bodyText: "Hi Priya, saw Setu raised a Series A. I build payment APIs. Open to a quick chat?",
            bodyHtml: "<p>Hi Priya, saw Setu raised a Series A. I build payment APIs. Open to a quick chat?</p>",
          };
        },
        saveCampaign: async (campaign) => {
          campaigns.push(campaign);
          return { id: "campaign-1" };
        },
        saveEmails: async (drafts) => {
          emails.push(...drafts);
          return drafts.map((email, index) => ({ id: `email-${index + 1}`, status: email.status }));
        },
      },
      {
        company: {
          id: "company-1",
          name: "Setu",
          description: "Banking APIs",
          techStack: ["React", "AWS"],
          fundingStage: "series_a",
          fundingAmount: "$30M",
          fundingDate: "12 days ago",
          investors: ["Bharat Inclusion Fund"],
          leadInvestor: "Bharat Inclusion Fund",
        },
        contacts: [
          {
            id: "contact-1",
            fullName: "Priya Sharma",
            email: "priya@setu.co",
            role: "hr_manager",
          },
        ],
        user: {
          name: "Asha Rao",
          skills: ["payment APIs", "React"],
          experience: "Two years building fintech APIs.",
          targetRole: "Backend Engineer",
          portfolioUrl: "https://asha.example",
        },
        autoApprove: false,
        unsubscribeBaseUrl: "https://app.local/unsubscribe",
        now: new Date("2026-05-23T04:30:00.000Z"),
      },
    );

    expect(result).toEqual({
      campaignId: "campaign-1",
      generated: 1,
      queued: 0,
      pendingReview: 1,
      rejected: 0,
    });
    expect(campaigns[0]).toMatchObject({
      company_id: "company-1",
      campaign_type: "hr_outreach",
      status: "draft",
      auto_approve: false,
      max_emails_per_day: 30,
    });
    expect(campaigns[0].sequence_json).toContain('"step":1');
    expect(emails).toEqual([
      expect.objectContaining({
        campaign_id: "campaign-1",
        contact_id: "contact-1",
        sequence_step: 1,
        subject: "Congrats on the Series A",
        status: "pending",
        scheduled_at: "2026-05-23T04:30:00.000Z",
      }),
    ]);
    expect(emails[0].body_html).toContain("unsubscribe?token=");
    expect(generatedContexts).toEqual([
      expect.objectContaining({
        contactName: "Priya Sharma",
        contactRole: "hr_manager",
        companyName: "Setu",
        fundingStage: "series_a",
        sequenceStep: 1,
        userName: "Asha Rao",
      }),
    ]);
  });
});
