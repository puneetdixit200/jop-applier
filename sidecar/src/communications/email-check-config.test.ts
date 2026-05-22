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

  it("matches inbound recruiter emails to stored contacts and applications", async () => {
    const createEmailReader: EmailReaderFactory = () => ({
      fetchUnread: async () => [
        {
          id: "<reply-2@northstar.example>",
          uid: 102,
          from: "Mira Recruiter <mira@northstar.example>",
          subject: "Interview availability",
          body: "Can you share availability this week?",
          receivedAt: "2026-05-29T09:30:00.000Z",
        },
      ],
    });

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
            signature: null,
          },
          matchContext: {
            applications: [
              {
                id: "app-1",
                jobId: "job-1",
                companyName: "Northstar Labs",
                status: "submitted",
              },
            ],
            contacts: [
              {
                id: "contact-1",
                name: "Mira Recruiter",
                email: "mira@northstar.example",
                companyName: "Northstar Labs",
              },
            ],
          },
        },
      },
      {
        fallback,
        createEmailReader,
      },
    );

    await expect(dependencies?.fetchResponses()).resolves.toEqual([
      {
        id: "<reply-2@northstar.example>",
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        contactId: "contact-1",
        from: "Mira Recruiter <mira@northstar.example>",
        subject: "Interview availability",
        body: "Can you share availability this week?",
        receivedAt: "2026-05-29T09:30:00.000Z",
        responseType: "interview",
      },
    ]);
  });
});
