import {
  createImapEmailReader,
  type EmailAccountConfig,
  type EmailProvider,
  type FetchUnreadOptions,
  type InboundEmail,
} from "./email-adapter.js";
import type {
  EmailResponseMessage,
  EmailResponseType,
  EmailResponseWorkerDependencies,
} from "./email-response-worker.js";

export type EmailReader = {
  fetchUnread(options?: FetchUnreadOptions): Promise<InboundEmail[]>;
};

export type EmailReaderFactory = (config: EmailAccountConfig) => EmailReader;

export type ConfiguredEmailCheckOptions = {
  fallback: EmailResponseWorkerDependencies;
  createEmailReader?: EmailReaderFactory;
};

export function createEmailCheckDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredEmailCheckOptions,
): EmailResponseWorkerDependencies | null {
  const emailCheck = isRecord(input) && isRecord(input.emailCheck) ? input.emailCheck : null;
  if (!emailCheck) {
    return null;
  }

  const account = emailAccountConfig(emailCheck.account);
  if (!account) {
    return null;
  }

  const createEmailReader = options.createEmailReader ?? ((config) => createImapEmailReader(config));
  const fetchOptions = fetchUnreadOptions(emailCheck.fetch);

  return {
    ...options.fallback,
    fetchResponses: async () => {
      const reader = createEmailReader(account);
      const messages = await reader.fetchUnread(fetchOptions);
      return messages.map(emailResponseMessageFromInbound);
    },
  };
}

function emailResponseMessageFromInbound(message: InboundEmail): EmailResponseMessage {
  return {
    id: message.id,
    applicationId: null,
    jobId: null,
    companyName: null,
    contactId: null,
    from: message.from ?? "",
    subject: message.subject,
    body: message.body,
    receivedAt: message.receivedAt ?? new Date(0).toISOString(),
    responseType: classifyResponse(message),
  };
}

function classifyResponse(message: Pick<InboundEmail, "subject" | "body">): EmailResponseType {
  const text = `${message.subject ?? ""}\n${message.body ?? ""}`.toLowerCase();
  if (/\b(interview|availability|schedule|calendar|call)\b/.test(text)) {
    return "interview";
  }
  if (/\b(offer|compensation|salary package)\b/.test(text)) {
    return "offer";
  }
  if (/\b(unfortunately|reject|rejected|not moving|passed on|decline)\b/.test(text)) {
    return "negative";
  }
  if (/\b(interested|great fit|next step|move forward|yes)\b/.test(text)) {
    return "positive";
  }
  return "other";
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

function fetchUnreadOptions(value: unknown): FetchUnreadOptions {
  if (!isRecord(value)) {
    return {};
  }
  const mailbox = nonEmptyString(value.mailbox);
  const limit = positiveInteger(value.limit);
  const markSeen = booleanValue(value.markSeen);

  return {
    ...(mailbox ? { mailbox } : {}),
    ...(limit ? { limit } : {}),
    ...(markSeen !== null ? { markSeen } : {}),
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
