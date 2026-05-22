import {
  createSmtpEmailSender,
  type EmailAccountConfig,
  type OutboundEmail,
  type SentEmailResult,
} from "./email-adapter.js";
import { emailAccountConfig } from "./email-account-config.js";
import type { ColdEmailWorkerDependencies } from "./cold-email-worker.js";

export type EmailSender = {
  sendEmail(email: OutboundEmail): Promise<SentEmailResult>;
};

export type EmailSenderFactory = (config: EmailAccountConfig) => EmailSender;

export type ConfiguredColdEmailOptions = {
  fallback: ColdEmailWorkerDependencies;
  createEmailSender?: EmailSenderFactory;
};

export function createColdEmailDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredColdEmailOptions,
): ColdEmailWorkerDependencies | null {
  const coldEmail = isRecord(input) && isRecord(input.coldEmail) ? input.coldEmail : null;
  if (!coldEmail) {
    return null;
  }

  const account = emailAccountConfig(coldEmail.account);
  if (!account) {
    return null;
  }

  const createEmailSender = options.createEmailSender ?? ((config) => createSmtpEmailSender(config));

  return {
    ...options.fallback,
    sendEmail: async (email) => {
      const sender = createEmailSender(account);
      return sender.sendEmail({
        to: email.to,
        subject: email.subject,
        body: email.body,
      });
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
