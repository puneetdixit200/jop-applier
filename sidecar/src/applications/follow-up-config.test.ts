import { describe, expect, it } from "vitest";
import type { EmailSenderFactory } from "../communications/cold-email-config.js";
import {
  createFollowUpDependenciesFromWorkflowInput,
} from "./follow-up-config.js";
import type { FollowUpWorkerDependencies } from "./follow-up-worker.js";

const fallback: FollowUpWorkerDependencies = {
  listApplications: async () => [],
  sendFollowUp: async () => ({ communicationId: null }),
  updateApplicationFollowUp: async () => undefined,
};

describe("follow-up config", () => {
  it("builds an SMTP sender and application list from configured workflow input", async () => {
    const senderConfigs: unknown[] = [];
    const sentMessages: unknown[] = [];
    const createEmailSender: EmailSenderFactory = (config) => {
      senderConfigs.push(config);
      return {
        sendEmail: async (message) => {
          sentMessages.push(message);
          return { messageId: "smtp-follow-up-1" };
        },
      };
    };

    const dependencies = createFollowUpDependenciesFromWorkflowInput(
      {
        followUp: {
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
          applications: [
            {
              id: "app-1",
              jobId: "job-1",
              jobTitle: "Frontend Engineer Intern",
              companyName: "Northstar Labs",
              status: "submitted",
              submittedAt: "2026-05-20T10:00:00Z",
              nextFollowUp: "2026-05-28T08:00:00Z",
              lastFollowUp: null,
              followUpCount: 0,
              responseDate: null,
              responseType: null,
              contactId: "contact-1",
              contactName: "Mira Recruiter",
              contactEmail: "mira@northstar.example",
            },
          ],
        },
      },
      {
        fallback,
        createEmailSender,
      },
    );

    expect(dependencies).not.toBeNull();
    const applications = await dependencies?.listApplications();
    expect(applications).toEqual([
      {
        id: "app-1",
        jobId: "job-1",
        jobTitle: "Frontend Engineer Intern",
        companyName: "Northstar Labs",
        status: "submitted",
        submittedAt: "2026-05-20T10:00:00Z",
        nextFollowUp: "2026-05-28T08:00:00Z",
        lastFollowUp: null,
        followUpCount: 0,
        responseDate: null,
        responseType: null,
        contactId: "contact-1",
        contactName: "Mira Recruiter",
        contactEmail: "mira@northstar.example",
      },
    ]);

    const application = applications?.[0];
    if (!application) {
      throw new Error("expected configured follow-up application");
    }

    await expect(dependencies?.sendFollowUp(application)).resolves.toEqual({
      communicationId: null,
      emailId: "smtp-follow-up-1",
      subject: "Following up on Frontend Engineer Intern at Northstar Labs",
      body: "Hi Mira Recruiter,\n\nI wanted to follow up on my application for the Frontend Engineer Intern role at Northstar Labs.\n\nThank you.",
      contactId: "contact-1",
      contactName: "Mira Recruiter",
      contactEmail: "mira@northstar.example",
    });
    expect(senderConfigs).toEqual([
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
    expect(sentMessages).toEqual([
      {
        to: "mira@northstar.example",
        subject: "Following up on Frontend Engineer Intern at Northstar Labs",
        body: "Hi Mira Recruiter,\n\nI wanted to follow up on my application for the Frontend Engineer Intern role at Northstar Labs.\n\nThank you.",
      },
    ]);
  });
});
