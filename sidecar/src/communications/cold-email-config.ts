import {
  createSmtpEmailSender,
  type EmailAccountConfig,
  type EmailProvider,
  type OutboundEmail,
  type SentEmailResult,
} from "./email-adapter.js";
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

function emailAccountConfig(value: unknown): EmailAccountConfig | null {
  if (!isRecord(value)) {
    return null;
  }
  const provider = emailProvider(value.provider);
  const smtpHost = nonEmptyString(value.smtpHost);
  const smtpPort = positiveInteger(value.smtpPort);
  const smtpSecure = booleanValue(value.smtpSecure);
  const smtpUser = nonEmptyString(value.smtpUser);
  const smtpPass = nonEmptyString(value.smtpPass);
  const imapHost = nonEmptyString(value.imapHost);
  const imapPort = positiveInteger(value.imapPort);
  const imapSecure = booleanValue(value.imapSecure);
  const imapUser = nonEmptyString(value.imapUser);
  const imapPass = nonEmptyString(value.imapPass);
  const fromName = nonEmptyString(value.fromName);
  const fromEmail = nonEmptyString(value.fromEmail);

  if (
    !provider ||
    !smtpHost ||
    !smtpPort ||
    smtpSecure === null ||
    !smtpUser ||
    !smtpPass ||
    !imapHost ||
    !imapPort ||
    imapSecure === null ||
    !imapUser ||
    !imapPass ||
    !fromName ||
    !fromEmail
  ) {
    return null;
  }

  return {
    provider,
    smtpHost,
    smtpPort,
    smtpSecure,
    smtpUser,
    smtpPass,
    imapHost,
    imapPort,
    imapSecure,
    imapUser,
    imapPass,
    fromName,
    fromEmail,
    signature: nullableString(value.signature),
  };
}

function emailProvider(value: unknown): EmailProvider | null {
  return value === "gmail" || value === "outlook" || value === "custom" ? value : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
