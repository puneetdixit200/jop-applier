import { describe, expect, it } from "vitest";
import {
  createColdEmailDependenciesFromWorkflowInput,
  type EmailSenderFactory,
} from "./cold-email-config.js";
import type { ColdEmailWorkerDependencies } from "./cold-email-worker.js";

const fallback: ColdEmailWorkerDependencies = {
  loadProfile: async () => null,
  listTargets: async () => [],
  generateColdEmail: async () => "",
  saveCommunication: async () => ({ communicationId: null }),
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

describe("cold email config", () => {
  it("builds an SMTP sender from configured workflow email account", async () => {
    const senderConfigs: unknown[] = [];
    const sentMessages: unknown[] = [];
    const createEmailSender: EmailSenderFactory = (config) => {
      senderConfigs.push(config);
      return {
        sendEmail: async (message) => {
          sentMessages.push(message);
          return { messageId: "smtp-message-1" };
        },
      };
    };

    const dependencies = createColdEmailDependenciesFromWorkflowInput(
      {
        coldEmail: {
          account: gmailOAuthAccount,
        },
      },
      {
        fallback,
        createEmailSender,
      },
    );

    expect(dependencies).not.toBeNull();
    await expect(
      dependencies?.sendEmail?.({
        to: "mira@northstar.example",
        subject: "Intro",
        body: "Hi Mira",
      }),
    ).resolves.toEqual({ messageId: "smtp-message-1" });
    expect(senderConfigs).toEqual([gmailOAuthAccount]);
    expect(sentMessages).toEqual([
      {
        to: "mira@northstar.example",
        subject: "Intro",
        body: "Hi Mira",
      },
    ]);
  });
});
