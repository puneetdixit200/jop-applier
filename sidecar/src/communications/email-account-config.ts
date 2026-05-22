import type { EmailAccountConfig, EmailProvider } from "./email-adapter.js";

export function emailAccountConfig(value: unknown): EmailAccountConfig | null {
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
