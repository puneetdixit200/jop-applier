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

const gmailOAuthAccount = {
  provider: "gmail",
  authType: "oauth2",
  fromName: "Asha Rao",
  fromEmail: "asha@gmail.example",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "asha@gmail.example",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true,
  imapUser: "asha@gmail.example",
  oauthClientId: "google-client-id",
  oauthClientSecret: "google-client-secret",
  oauthRefreshToken: "google-refresh-token",
  signature: "Asha",
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
          account: gmailOAuthAccount,
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
    expect(readerConfigs).toEqual([gmailOAuthAccount]);
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
          account: { ...gmailOAuthAccount, signature: null },
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

  it("matches inbound replies to outreach message ids", async () => {
    const createEmailReader: EmailReaderFactory = () => ({
      fetchUnread: async () => [
        {
          id: "<reply-outreach@setu.example>",
          uid: 103,
          from: "Priya <priya@setu.co>",
          subject: "Re: Congrats on Series A",
          body: "Open to chat next week.",
          receivedAt: "2026-05-29T10:00:00.000Z",
          inReplyTo: "<smtp-outreach-1@cluelyy>",
        },
      ],
    });

    const dependencies = createEmailCheckDependenciesFromWorkflowInput(
      {
        emailCheck: {
          account: { ...gmailOAuthAccount, signature: null },
          outreachContext: {
            emails: [
              {
                id: "outreach-email-1",
                messageId: "smtp-outreach-1@cluelyy",
                contactId: "contact-1",
                campaignId: "campaign-1",
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

    const [message] = await dependencies!.fetchResponses();
    await expect(dependencies?.recordOutreachReply?.(message)).resolves.toEqual({
      emailId: "outreach-email-1",
      contactId: "contact-1",
      campaignId: "campaign-1",
      messageId: "<reply-outreach@setu.example>",
      from: "Priya <priya@setu.co>",
      subject: "Re: Congrats on Series A",
      receivedAt: "2026-05-29T10:00:00.000Z",
    });
  });
});
