import { describe, expect, it } from "vitest";
import { EventBus } from "../../orchestrator/event-bus.js";
import type { CareerEventMap } from "../../orchestrator/events.js";
import { runOutreachSendWorker, type OutreachSendTarget } from "./outreach-send-worker.js";

describe("outreach send worker", () => {
  it("sends due queued outreach through SMTP input and records sent updates", async () => {
    const sentEmails: unknown[] = [];
    const bus = new EventBus<CareerEventMap>();
    const events: Array<CareerEventMap["outreach.email_sent"]> = [];
    bus.on("outreach.email_sent", (event) => events.push(event));

    const result = await runOutreachSendWorker(
      {
        listQueuedEmails: async () => [
          target({
            bodyHtml: "<p>Hi Priya,</p><p>Would you be open to a quick call?</p><p><a href=\"https://app.local/unsubscribe?token=abc\">unsubscribe</a></p>",
          }),
        ],
        sendEmail: async (email) => {
          sentEmails.push(email);
          return { messageId: "smtp-1" };
        },
      },
      {
        now: new Date("2026-05-27T05:00:00.000Z"),
        eventBus: bus,
      },
    );

    expect(result).toEqual({
      scanned: 1,
      sent: 1,
      skipped: 0,
      failed: 0,
      updates: [
        {
          id: "email-1",
          status: "sent",
          sentAt: "2026-05-27T05:00:00.000Z",
          messageId: "smtp-1",
        },
      ],
    });
    expect(sentEmails).toEqual([
      {
        to: "priya@setu.co",
        subject: "Congrats on Series A",
        body: "Hi Priya,\n\nWould you be open to a quick call?\n\nunsubscribe",
        html: "<p>Hi Priya,</p><p>Would you be open to a quick call?</p><p><a href=\"https://app.local/unsubscribe?token=abc\">unsubscribe</a></p>",
      },
    ]);
    expect(events).toEqual([
      expect.objectContaining({
        emailId: "email-1",
        campaignId: "campaign-1",
        contactId: "contact-1",
        companyName: "Setu",
        sentAt: new Date("2026-05-27T05:00:00.000Z"),
      }),
    ]);
  });

  it("skips opted-out, future, and outside-window messages before SMTP", async () => {
    const sentEmails: unknown[] = [];

    const result = await runOutreachSendWorker(
      {
        listQueuedEmails: async () => [
          target({ id: "future", scheduledAt: "2026-05-28T05:00:00.000Z" }),
          target({ id: "opted-out", optedOut: true }),
          target({ id: "night", scheduledAt: "2026-05-27T00:00:00.000Z" }),
        ],
        sendEmail: async (email) => {
          sentEmails.push(email);
          return { messageId: "smtp-unexpected" };
        },
      },
      {
        now: new Date("2026-05-27T00:30:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      scanned: 3,
      sent: 0,
      skipped: 3,
      failed: 0,
      updates: [],
    });
    expect(sentEmails).toEqual([]);
  });

  it("marks due messages failed when SMTP is unavailable", async () => {
    const result = await runOutreachSendWorker(
      {
        listQueuedEmails: async () => [target()],
      },
      {
        now: new Date("2026-05-27T05:00:00.000Z"),
      },
    );

    expect(result).toMatchObject({
      scanned: 1,
      sent: 0,
      skipped: 0,
      failed: 1,
      updates: [
        {
          id: "email-1",
          status: "failed",
          sentAt: null,
          messageId: null,
          reason: "email_sender_not_configured",
        },
      ],
    });
  });
});

function target(overrides: Partial<OutreachSendTarget> = {}): OutreachSendTarget {
  return {
    id: "email-1",
    campaignId: "campaign-1",
    contactId: "contact-1",
    contactEmail: "priya@setu.co",
    contactName: "Priya Sharma",
    companyId: "company-1",
    companyName: "Setu",
    subject: "Congrats on Series A",
    bodyHtml: "<p>Hello</p><p><a href=\"https://app.local/unsubscribe?token=abc\">unsubscribe</a></p>",
    sequenceStep: 1,
    status: "queued",
    scheduledAt: "2026-05-27T04:30:00.000Z",
    maxEmailsPerDay: 30,
    optedOut: false,
    sentCountToday: 0,
    companyContactedCount: 0,
    recentContactedAt: null,
    bounceCountLast7Days: 0,
    ...overrides,
  };
}
