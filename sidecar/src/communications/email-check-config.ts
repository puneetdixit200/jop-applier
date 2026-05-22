import {
  createImapEmailReader,
  type EmailAccountConfig,
  type FetchUnreadOptions,
  type InboundEmail,
} from "./email-adapter.js";
import { emailAccountConfig } from "./email-account-config.js";
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

type EmailMatchApplication = {
  id: string;
  jobId: string;
  companyName: string;
  status: string;
};

type EmailMatchContact = {
  id: string;
  name: string;
  email: string;
  companyId: string | null;
  companyName: string | null;
};

type EmailMatchContext = {
  applications: EmailMatchApplication[];
  contacts: EmailMatchContact[];
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
  const matchContext = emailMatchContext(emailCheck.matchContext);

  return {
    ...options.fallback,
    fetchResponses: async () => {
      const reader = createEmailReader(account);
      const messages = await reader.fetchUnread(fetchOptions);
      return messages.map((message) => emailResponseMessageFromInbound(message, matchContext));
    },
  };
}

function emailResponseMessageFromInbound(
  message: InboundEmail,
  matchContext: EmailMatchContext,
): EmailResponseMessage {
  const match = matchInboundEmail(message, matchContext);

  return {
    id: message.id,
    applicationId: match?.application.id ?? null,
    jobId: match?.application.jobId ?? null,
    companyName: match?.application.companyName ?? null,
    contactId: match?.contact.id ?? null,
    from: message.from ?? "",
    subject: message.subject,
    body: message.body,
    receivedAt: message.receivedAt ?? new Date(0).toISOString(),
    responseType: classifyResponse(message),
  };
}

function matchInboundEmail(message: InboundEmail, context: EmailMatchContext) {
  const sender = normalizedEmail(extractEmailAddress(message.from ?? ""));
  if (!sender) {
    return null;
  }

  const contact = context.contacts.find((candidate) => normalizedEmail(candidate.email) === sender);
  if (!contact?.companyName) {
    return null;
  }
  const contactCompanyName = contact.companyName;

  const application = context.applications.find(
    (candidate) => normalizedText(candidate.companyName) === normalizedText(contactCompanyName),
  );

  return application ? { application, contact } : null;
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

function emailMatchContext(value: unknown): EmailMatchContext {
  if (!isRecord(value)) {
    return { applications: [], contacts: [] };
  }

  return {
    applications: Array.isArray(value.applications)
      ? value.applications.flatMap((item) => emailMatchApplication(item) ?? [])
      : [],
    contacts: Array.isArray(value.contacts)
      ? value.contacts.flatMap((item) => emailMatchContact(item) ?? [])
      : [],
  };
}

function emailMatchApplication(value: unknown): EmailMatchApplication | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = nonEmptyString(value.id);
  const jobId = nonEmptyString(value.jobId);
  const companyName = nonEmptyString(value.companyName);
  const status = nonEmptyString(value.status);

  return id && jobId && companyName && status
    ? { id, jobId, companyName, status }
    : null;
}

function emailMatchContact(value: unknown): EmailMatchContact | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const email = nonEmptyString(value.email);

  return id && name && email
    ? {
        id,
        name,
        email,
        companyId: nullableString(value.companyId),
        companyName: nullableString(value.companyName),
      }
    : null;
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

function extractEmailAddress(value: string): string | null {
  const bracketed = value.match(/<([^<>@\s]+@[^<>@\s]+)>/);
  if (bracketed) {
    return bracketed[1];
  }
  return value.match(/[^\s<>@]+@[^\s<>@]+/)?.[0] ?? null;
}

function normalizedEmail(value: string | null): string | null {
  return value?.trim().toLowerCase() || null;
}

function normalizedText(value: string): string {
  return value.trim().toLowerCase();
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
