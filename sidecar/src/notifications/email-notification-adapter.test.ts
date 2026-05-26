import { describe, expect, it } from "vitest";
import { createEmailNotificationAdapter } from "./email-notification-adapter.js";
import type { OutboundEmail } from "../communications/email-adapter.js";
import type { NotificationDelivery } from "./notification-manager.js";

describe("email notification adapter", () => {
  it("sends notification deliveries through SMTP email settings", async () => {
    const sent: OutboundEmail[] = [];
    const adapter = createEmailNotificationAdapter({
      account: {
        provider: "custom",
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "sender@example.com",
        smtpPass: "secret",
        imapHost: "imap.example.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "sender@example.com",
        imapPass: "secret",
        fromName: "cluelyy",
        fromEmail: "sender@example.com",
      },
      to: ["beta@example.com", "owner@example.com"],
      sendEmail: async (email) => {
        sent.push(email);
        return { messageId: "message-1" };
      },
    });

    await adapter.send(notificationDelivery({
      type: "digest.daily",
      title: "Daily digest",
      body: "Found 4 new high-match jobs.",
      priority: "low",
      metadata: {
        jobsFound: 4,
        source: "scheduled-digest",
      },
    }));

    expect(sent).toEqual([
      {
        to: ["beta@example.com", "owner@example.com"],
        subject: "[low] Daily digest",
        body: [
          "Found 4 new high-match jobs.",
          "",
          "Type: digest.daily",
          "Priority: low",
          "Created: 2026-05-29T09:30:00.000Z",
          "jobsFound: 4",
          "source: scheduled-digest",
        ].join("\n"),
      },
    ]);
  });
});

function notificationDelivery(
  overrides: Partial<NotificationDelivery>,
): NotificationDelivery {
  return {
    type: "application.submitted",
    title: "Application submitted",
    body: "Application submitted.",
    channel: "email",
    priority: "medium",
    createdAt: new Date("2026-05-29T09:30:00Z"),
    ...overrides,
  } as NotificationDelivery;
}
