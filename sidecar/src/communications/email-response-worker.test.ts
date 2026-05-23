import { describe, expect, it } from "vitest";
import { runEmailResponseWorker } from "./email-response-worker.js";

describe("email response worker", () => {
  it("records outreach replies for unmatched application emails", async () => {
    const processed: string[] = [];
    const result = await runEmailResponseWorker(
      {
        fetchResponses: async () => [
          {
            id: "<reply@setu.example>",
            applicationId: null,
            jobId: null,
            companyName: null,
            contactId: null,
            from: "Priya <priya@setu.co>",
            subject: "Re: Congrats",
            body: "Sounds good.",
            receivedAt: "2026-05-29T10:00:00.000Z",
            responseType: "positive",
            inReplyTo: "<smtp-outreach-1>",
          },
        ],
        saveCommunication: async () => ({ communicationId: null }),
        updateApplicationResponse: async () => undefined,
        markResponseProcessed: async (messageId) => {
          processed.push(messageId);
        },
        recordOutreachReply: async (message) => ({
          emailId: "outreach-email-1",
          contactId: "contact-1",
          campaignId: "campaign-1",
          messageId: message.id,
          from: message.from,
          subject: message.subject,
          receivedAt: message.receivedAt,
        }),
      },
      { now: new Date("2026-05-29T10:01:00Z") },
    );

    expect(result).toEqual({
      scanned: 1,
      matched: 1,
      recorded: 1,
      failed: 0,
      skipped: 0,
      responses: [
        {
          id: "<reply@setu.example>",
          applicationId: null,
          jobId: null,
          companyName: null,
          contactId: null,
          from: "Priya <priya@setu.co>",
          subject: "Re: Congrats",
          body: "Sounds good.",
          receivedAt: "2026-05-29T10:00:00.000Z",
          responseType: "positive",
          inReplyTo: "<smtp-outreach-1>",
        },
      ],
      outreachReplies: [
        {
          emailId: "outreach-email-1",
          contactId: "contact-1",
          campaignId: "campaign-1",
          messageId: "<reply@setu.example>",
          from: "Priya <priya@setu.co>",
          subject: "Re: Congrats",
          receivedAt: "2026-05-29T10:00:00.000Z",
        },
      ],
    });
    expect(processed).toEqual(["<reply@setu.example>"]);
  });
});
