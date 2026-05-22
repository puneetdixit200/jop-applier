import { describe, expect, it } from "vitest";
import {
  createEmailCheckDependenciesFromWorkflowInput,
  type EmailReaderFactory,
} from "./email-check-config.js";
import type { EmailResponseWorkerDependencies } from "./email-response-worker.js";

const fallback: EmailResponseWorkerDependencies = {
  fetchResponses: async () => [],
  saveCommunication: async () => ({ communicationId: null }),
  updateApplicationResponse: async () => undefined,
  markResponseProcessed: async () => undefined,
};

describe("email check config", () => {
  it("builds email-check dependencies from workflow SMTP and IMAP settings", async () => {
    const readerConfigs: unknown[] = [];
    const fetchOptions: unknown[] = [];
    const createEmailReader: EmailReaderFactory = (config) => {
      readerConfigs.push(config);
      return {
        fetchUnread: async (options) => {
          fetchOptions.push(options);
          return [
            {
              id: "<reply-1@northstar.example>",
              uid: 101,
              from: "Mira <mira@northstar.example>",
              subject: "Interview availability",
              body: "Can you share availability this week?",
              receivedAt: "2026-05-29T09:00:00.000Z",
            },
          ];
        },
      };
    };

    const dependencies = createEmailCheckDependenciesFromWorkflowInput(
      {
        emailCheck: {
          account: {
            provider: "gmail",
            fromName: "Asha Rao",
            fromEmail: "asha@gmail.example",
            smtpHost: "smtp.gmail.com",
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: "asha@gmail.example",
            smtpPass: "app-password",
            imapHost: "imap.gmail.com",
            imapPort: 993,
            imapSecure: true,
            imapUser: "asha@gmail.example",
            imapPass: "app-password",
            signature: "Asha",
          },
          fetch: {
            mailbox: "Replies",
            limit: 25,
            markSeen: true,
          },
        },
      },
      {
        fallback,
        createEmailReader,
      },
    );

    expect(dependencies).not.toBeNull();
    await expect(dependencies?.fetchResponses()).resolves.toEqual([
      {
        id: "<reply-1@northstar.example>",
        applicationId: null,
        jobId: null,
        companyName: null,
        contactId: null,
        from: "Mira <mira@northstar.example>",
        subject: "Interview availability",
        body: "Can you share availability this week?",
        receivedAt: "2026-05-29T09:00:00.000Z",
        responseType: "interview",
      },
    ]);
    expect(readerConfigs).toEqual([
      {
        provider: "gmail",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.example",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.example",
        smtpPass: "app-password",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.example",
        imapPass: "app-password",
        signature: "Asha",
      },
    ]);
    expect(fetchOptions).toEqual([
      {
        mailbox: "Replies",
        limit: 25,
        markSeen: true,
      },
    ]);
  });
});
