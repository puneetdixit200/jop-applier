import type { CompanyForEmail, ProfileForContent } from "../ai/provider-interface.js";
import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type ColdEmailTarget = {
  applicationId: string | null;
  jobId: string | null;
  companyName: string;
  companyDomain?: string | null;
  companyIndustry?: string | null;
  contactId: string | null;
  contactName: string | null;
  role: string | null;
  context: string | null;
};

export type ColdEmailCommunication = {
  applicationId: string | null;
  contactId: string | null;
  direction: "sent";
  type: "cold_email";
  subject: string;
  body: string;
  emailId: null;
  sentAt: string;
  readAt: null;
};

export type ColdEmailResultRecord = {
  applicationId: string | null;
  jobId: string | null;
  companyName: string;
  contactId: string | null;
  contactName: string | null;
  communicationId: string | null;
  subject: string;
  body: string;
  sentAt: string;
};

export type ColdEmailWorkerDependencies = {
  loadProfile: () => Promise<ProfileForContent | null>;
  listTargets: () => Promise<ColdEmailTarget[]>;
  generateColdEmail: (profile: ProfileForContent, company: CompanyForEmail) => Promise<string>;
  saveCommunication: (
    communication: ColdEmailCommunication,
  ) => Promise<{ communicationId: string | null }>;
};

export type ColdEmailWorkerOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
  maxEmails?: number;
};

export type ColdEmailWorkerResult = {
  scanned: number;
  generated: number;
  sent: number;
  failed: number;
  skipped: number;
  coldEmails: ColdEmailResultRecord[];
};

export async function runColdEmailWorker(
  dependencies: ColdEmailWorkerDependencies,
  options: ColdEmailWorkerOptions,
): Promise<ColdEmailWorkerResult> {
  const [profile, targets] = await Promise.all([
    dependencies.loadProfile(),
    dependencies.listTargets(),
  ]);
  const limitedTargets = targets.slice(0, options.maxEmails ?? targets.length);
  const result: ColdEmailWorkerResult = {
    scanned: targets.length,
    generated: 0,
    sent: 0,
    failed: 0,
    skipped: targets.length - limitedTargets.length,
    coldEmails: [],
  };

  if (profile === null) {
    result.skipped += limitedTargets.length;
    return result;
  }

  for (const target of limitedTargets) {
    const companyName = target.companyName.trim();
    if (companyName.length === 0) {
      result.skipped += 1;
      continue;
    }

    try {
      const generated = await dependencies.generateColdEmail(profile, companyForTarget(target, companyName));
      result.generated += 1;
      const email = emailParts(generated, companyName);
      const sentAt = options.now.toISOString();
      const saved = await dependencies.saveCommunication({
        applicationId: target.applicationId,
        contactId: target.contactId,
        direction: "sent",
        type: "cold_email",
        subject: email.subject,
        body: email.body,
        emailId: null,
        sentAt,
        readAt: null,
      });
      const record: ColdEmailResultRecord = {
        applicationId: target.applicationId,
        jobId: target.jobId,
        companyName,
        contactId: target.contactId,
        contactName: target.contactName,
        communicationId: saved.communicationId,
        subject: email.subject,
        body: email.body,
        sentAt,
      };

      result.sent += 1;
      result.coldEmails.push(record);
      options.eventBus?.emit("cold_email.sent", {
        applicationId: target.applicationId,
        jobId: target.jobId,
        companyName,
        contactId: target.contactId,
        contactName: target.contactName,
        communicationId: saved.communicationId,
        subject: email.subject,
        sentAt: options.now,
      });
    } catch (error) {
      result.failed += 1;
      options.eventBus?.emit("cold_email.failed", {
        applicationId: target.applicationId,
        jobId: target.jobId,
        companyName,
        contactId: target.contactId,
        reason: error instanceof Error ? error.message : String(error),
        failedAt: options.now,
      });
    }
  }

  return result;
}

function companyForTarget(target: ColdEmailTarget, companyName: string): CompanyForEmail {
  return {
    name: companyName,
    ...(target.contactName ? { contactName: target.contactName } : {}),
    ...(target.companyDomain ? { domain: target.companyDomain } : {}),
    ...(target.companyIndustry ? { industry: target.companyIndustry } : {}),
    ...(target.context ? { context: target.context } : {}),
  };
}

function emailParts(generated: string, companyName: string) {
  const trimmed = generated.trim();
  const lines = trimmed.split(/\r?\n/);
  const subjectIndex = lines.findIndex((line) => /^subject:\s*\S/i.test(line));

  if (subjectIndex === -1) {
    return {
      subject: `Intro to ${companyName}`,
      body: trimmed,
    };
  }

  const subject = lines[subjectIndex].replace(/^subject:\s*/i, "").trim();
  const body = lines
    .filter((_, index) => index !== subjectIndex)
    .join("\n")
    .trim();

  return {
    subject,
    body: body.length > 0 ? body : trimmed,
  };
}
