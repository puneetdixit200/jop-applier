import { emailAccountConfig } from "../../communications/email-account-config.js";
import { createSmtpEmailSender } from "../../communications/email-adapter.js";
import type { EmailSenderFactory } from "../../communications/cold-email-config.js";
import type {
  OutreachFollowUpDependencies,
  OutreachFollowUpEmail,
  OutreachFollowUpThread,
} from "./outreach-follow-up-worker.js";
import type {
  OutreachSendDependencies,
  OutreachSendTarget,
} from "./outreach-send-worker.js";

export type ConfiguredOutreachOptions<T> = {
  fallback: T;
  createEmailSender?: EmailSenderFactory;
};

export function createOutreachSendDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredOutreachOptions<OutreachSendDependencies>,
): OutreachSendDependencies | null {
  const outreachSend = isRecord(input) && isRecord(input.outreachSend) ? input.outreachSend : null;
  if (!outreachSend) {
    return null;
  }

  const emails = outreachSendTargets(outreachSend.emails);
  const account = emailAccountConfig(outreachSend.account);
  const createEmailSender = options.createEmailSender ?? ((config) => createSmtpEmailSender(config));

  return {
    ...options.fallback,
    listQueuedEmails: emails.length > 0 ? async () => emails : options.fallback.listQueuedEmails,
    ...(account
      ? {
          sendEmail: async (email) => {
            const sender = createEmailSender(account);
            return sender.sendEmail(email);
          },
        }
      : {}),
  };
}

export function createOutreachFollowUpDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredOutreachOptions<OutreachFollowUpDependencies>,
): OutreachFollowUpDependencies | null {
  const outreachFollowUp = isRecord(input) && isRecord(input.outreachFollowUp) ? input.outreachFollowUp : null;
  if (!outreachFollowUp) {
    return null;
  }

  const threads = outreachFollowUpThreads(outreachFollowUp.threads);
  return {
    ...options.fallback,
    listThreads: threads.length > 0 ? async () => threads : options.fallback.listThreads,
  };
}

function outreachSendTargets(value: unknown): OutreachSendTarget[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => outreachSendTarget(item) ?? []);
}

function outreachSendTarget(value: unknown): OutreachSendTarget | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id);
  const campaignId = nonEmptyString(value.campaignId);
  const contactId = nonEmptyString(value.contactId);
  const contactEmail = nonEmptyString(value.contactEmail);
  const contactName = nonEmptyString(value.contactName);
  const companyId = nonEmptyString(value.companyId);
  const companyName = nonEmptyString(value.companyName);
  const subject = nonEmptyString(value.subject);
  const bodyHtml = nonEmptyString(value.bodyHtml);
  const sequenceStep = positiveInteger(value.sequenceStep);
  const maxEmailsPerDay = positiveInteger(value.maxEmailsPerDay);
  const sentCountToday = nonNegativeInteger(value.sentCountToday);
  const companyContactedCount = nonNegativeInteger(value.companyContactedCount);
  const bounceCountLast7Days = nonNegativeInteger(value.bounceCountLast7Days);

  if (
    !id ||
    !campaignId ||
    !contactId ||
    !contactEmail ||
    !contactName ||
    !companyId ||
    !companyName ||
    !subject ||
    !bodyHtml ||
    sequenceStep === null ||
    maxEmailsPerDay === null ||
    sentCountToday === null ||
    companyContactedCount === null ||
    bounceCountLast7Days === null
  ) {
    return null;
  }

  return {
    id,
    campaignId,
    contactId,
    contactEmail,
    contactName,
    companyId,
    companyName,
    subject,
    bodyHtml,
    sequenceStep,
    status: "queued",
    scheduledAt: nullableString(value.scheduledAt),
    maxEmailsPerDay,
    optedOut: value.optedOut === true,
    sentCountToday,
    companyContactedCount,
    recentContactedAt: nullableString(value.recentContactedAt),
    bounceCountLast7Days,
  };
}

function outreachFollowUpThreads(value: unknown): OutreachFollowUpThread[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => outreachFollowUpThread(item) ?? []);
}

function outreachFollowUpThread(value: unknown): OutreachFollowUpThread | null {
  if (!isRecord(value)) {
    return null;
  }

  const campaignId = nonEmptyString(value.campaignId);
  const contactId = nonEmptyString(value.contactId);
  const contactName = nonEmptyString(value.contactName);
  const contactEmail = nonEmptyString(value.contactEmail);
  const companyId = nonEmptyString(value.companyId);
  const companyName = nonEmptyString(value.companyName);
  const fundingLabel = nonEmptyString(value.fundingLabel);
  const unsubscribeBaseUrl = nonEmptyString(value.unsubscribeBaseUrl);
  const emails = outreachFollowUpEmails(value.emails);

  if (
    !campaignId ||
    !contactId ||
    !contactName ||
    !contactEmail ||
    !companyId ||
    !companyName ||
    !fundingLabel ||
    !unsubscribeBaseUrl ||
    emails.length === 0
  ) {
    return null;
  }

  return {
    campaignId,
    contactId,
    contactName,
    contactEmail,
    optedOut: value.optedOut === true,
    companyId,
    companyName,
    fundingLabel,
    companySummary: nullableString(value.companySummary),
    unsubscribeBaseUrl,
    emails,
  };
}

function outreachFollowUpEmails(value: unknown): OutreachFollowUpEmail[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = nonEmptyString(item.id);
    const campaignId = nonEmptyString(item.campaignId);
    const contactId = nonEmptyString(item.contactId);
    const sequenceStep = positiveInteger(item.sequenceStep);
    const subject = nonEmptyString(item.subject);
    const bodyHtml = nonEmptyString(item.bodyHtml);
    const status = nonEmptyString(item.status);
    if (!id || !campaignId || !contactId || sequenceStep === null || !subject || !bodyHtml || !status) {
      return [];
    }
    return [{
      id,
      campaignId,
      contactId,
      sequenceStep,
      subject,
      bodyHtml,
      status,
      scheduledAt: nullableString(item.scheduledAt),
      sentAt: nullableString(item.sentAt),
    }];
  });
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
