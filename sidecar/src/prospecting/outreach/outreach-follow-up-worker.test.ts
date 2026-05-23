import { describe, expect, it } from "vitest";
import { EventBus } from "../../orchestrator/event-bus.js";
import type { CareerEventMap } from "../../orchestrator/events.js";
import {
  runOutreachFollowUpWorker,
  type OutreachFollowUpThread,
} from "./outreach-follow-up-worker.js";

describe("outreach follow-up worker", () => {
  it("queues step two after three days without a reply and keeps manual review by default", async () => {
    const bus = new EventBus<CareerEventMap>();
    const events: Array<CareerEventMap["outreach.follow_up_queued"]> = [];
    bus.on("outreach.follow_up_queued", (event) => events.push(event));

    const result = await runOutreachFollowUpWorker(
      {
        listThreads: async () => [thread()],
      },
      {
        now: new Date("2026-05-27T05:00:00.000Z"),
        eventBus: bus,
      },
    );

    expect(result.scanned).toBe(1);
    expect(result.queued).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.drafts).toEqual([
      expect.objectContaining({
        campaign_id: "campaign-1",
        contact_id: "contact-1",
        sequence_step: 2,
        subject: "Re: Congrats on Series A",
        status: "pending",
        scheduled_at: "2026-05-27T05:00:00.000Z",
        sent_at: null,
        message_id: null,
      }),
    ]);
    expect(result.drafts[0].body_html).toContain("unsubscribe?token=");
    expect(result.drafts[0].body_html).toContain("Following up");
    expect(events).toEqual([
      expect.objectContaining({
        campaignId: "campaign-1",
        contactId: "contact-1",
        companyName: "Setu",
        sequenceStep: 2,
      }),
    ]);
  });

  it("queues step three after seven days when step two is sent", async () => {
    const result = await runOutreachFollowUpWorker(
      {
        listThreads: async () => [
          thread({
            emails: [
              email({ sequenceStep: 1, status: "sent", sentAt: "2026-05-20T05:00:00.000Z" }),
              email({ id: "email-2", sequenceStep: 2, status: "sent", sentAt: "2026-05-23T05:00:00.000Z" }),
            ],
          }),
        ],
      },
      {
        now: new Date("2026-05-27T05:00:00.000Z"),
        reviewBeforeSend: false,
      },
    );

    expect(result).toMatchObject({
      scanned: 1,
      queued: 1,
      skipped: 0,
      drafts: [
        {
          campaign_id: "campaign-1",
          contact_id: "contact-1",
          sequence_step: 3,
          subject: "Final note: Setu",
          status: "queued",
        },
      ],
    });
  });

  it("stops when there is a reply or an already pending follow-up", async () => {
    const result = await runOutreachFollowUpWorker(
      {
        listThreads: async () => [
          thread({ emails: [email({ status: "replied" })] }),
          thread({
            campaignId: "campaign-2",
            emails: [
              email({ campaignId: "campaign-2", status: "sent" }),
              email({ id: "pending-2", campaignId: "campaign-2", sequenceStep: 2, status: "pending", sentAt: null }),
            ],
          }),
        ],
      },
      {
        now: new Date("2026-05-27T05:00:00.000Z"),
      },
    );

    expect(result).toEqual({
      scanned: 2,
      queued: 0,
      skipped: 2,
      drafts: [],
    });
  });
});

function thread(overrides: Partial<OutreachFollowUpThread> = {}): OutreachFollowUpThread {
  return {
    campaignId: "campaign-1",
    contactId: "contact-1",
    contactName: "Priya Sharma",
    contactEmail: "priya@setu.co",
    optedOut: false,
    companyId: "company-1",
    companyName: "Setu",
    fundingLabel: "Series A - $30M",
    companySummary: "Setu is expanding platform API teams.",
    unsubscribeBaseUrl: "https://app.local/unsubscribe",
    emails: [
      email(),
    ],
    ...overrides,
  };
}

function email(overrides: Partial<OutreachFollowUpThread["emails"][number]> = {}): OutreachFollowUpThread["emails"][number] {
  return {
    id: "email-1",
    campaignId: "campaign-1",
    contactId: "contact-1",
    sequenceStep: 1,
    subject: "Congrats on Series A",
    bodyHtml: "<p>Initial email</p>",
    status: "sent",
    scheduledAt: "2026-05-23T04:30:00.000Z",
    sentAt: "2026-05-23T05:00:00.000Z",
    ...overrides,
  };
}
