import { emailAccountConfig } from "../communications/email-account-config.js";
import { createSmtpEmailSender } from "../communications/email-adapter.js";
import type { EmailSenderFactory } from "../communications/cold-email-config.js";
import { followUpEmailDraft } from "./follow-up-message.js";
import type { FollowUpApplication } from "./follow-up-scheduler.js";
import type { FollowUpWorkerDependencies } from "./follow-up-worker.js";

export type ConfiguredFollowUpOptions = {
  fallback: FollowUpWorkerDependencies;
  createEmailSender?: EmailSenderFactory;
};

export function createFollowUpDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredFollowUpOptions,
): FollowUpWorkerDependencies | null {
  const followUp = isRecord(input) && isRecord(input.followUp) ? input.followUp : null;
  if (!followUp) {
    return null;
  }

  const account = emailAccountConfig(followUp.account);
  const applications = followUpApplications(followUp.applications);
  if (!account && applications.length === 0) {
    return null;
  }

  const createEmailSender = options.createEmailSender ?? ((config) => createSmtpEmailSender(config));

  return {
    ...options.fallback,
    listApplications: applications.length > 0 ? async () => applications : options.fallback.listApplications,
    sendFollowUp: async (application) => {
      if (!account || !application.contactEmail) {
        return options.fallback.sendFollowUp(application);
      }

      const sender = createEmailSender(account);

      const draft = followUpEmailDraft(application);
      const sent = await sender.sendEmail({
        to: application.contactEmail,
        subject: draft.subject,
        body: draft.body,
      });

      return {
        communicationId: null,
        emailId: sent.messageId,
        subject: draft.subject,
        body: draft.body,
        contactId: application.contactId ?? null,
        contactName: application.contactName ?? null,
        contactEmail: application.contactEmail,
      };
    },
  };
}

function followUpApplications(value: unknown): FollowUpApplication[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => followUpApplication(item) ?? []);
}

function followUpApplication(value: unknown): FollowUpApplication | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id);
  const jobId = nonEmptyString(value.jobId);
  const companyName = nonEmptyString(value.companyName);
  const status = nonEmptyString(value.status);
  const followUpCount = nonNegativeInteger(value.followUpCount);

  if (!id || !jobId || !companyName || !status || followUpCount === null) {
    return null;
  }

  return {
    id,
    jobId,
    companyName,
    status,
    submittedAt: nullableString(value.submittedAt),
    nextFollowUp: nullableString(value.nextFollowUp),
    lastFollowUp: nullableString(value.lastFollowUp),
    followUpCount,
    responseDate: nullableString(value.responseDate),
    responseType: nullableString(value.responseType),
    jobTitle: nullableString(value.jobTitle),
    contactId: nullableString(value.contactId),
    contactName: nullableString(value.contactName),
    contactEmail: nullableString(value.contactEmail),
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

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
