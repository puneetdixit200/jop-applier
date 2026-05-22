import { describe, expect, it } from "vitest";
import { detectOutreachReply } from "./reply-detector.js";

describe("reply detector", () => {
  it("marks outreach emails as replied and cancels pending follow-ups by thread message id", async () => {
    const updates: string[] = [];

    const result = await detectOutreachReply(
      {
        findOutreachEmailByMessageId: async (messageId) =>
          messageId === "smtp-message-1"
            ? { id: "email-1", contactId: "contact-1", campaignId: "campaign-1" }
            : null,
        markOutreachEmailReplied: async (emailId, repliedAt) => {
          updates.push(`replied:${emailId}:${repliedAt}`);
        },
        cancelPendingFollowUps: async (contactId, campaignId) => {
          updates.push(`cancel:${contactId}:${campaignId}`);
        },
      },
      {
        inReplyTo: "smtp-message-1",
        subject: "Re: Congrats",
        receivedAt: new Date("2026-05-24T04:30:00.000Z"),
      },
    );

    expect(result).toEqual({ matched: true, emailId: "email-1" });
    expect(updates).toEqual([
      "replied:email-1:2026-05-24T04:30:00.000Z",
      "cancel:contact-1:campaign-1",
    ]);
  });
});
