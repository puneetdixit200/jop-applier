import type { OutboundEmail, SentEmailResult } from "../../communications/email-adapter.js";
import type { EventBus } from "../../orchestrator/event-bus.js";
import type { CareerEventMap } from "../../orchestrator/events.js";
import { evaluateOutreachCompliance } from "./compliance-checker.js";

export type OutreachSendTarget = {
  id: string;
  campaignId: string;
  contactId: string;
  contactEmail: string;
  contactName: string;
  companyId: string;
  companyName: string;
  subject: string;
  bodyHtml: string;
  sequenceStep: number;
  status: "queued";
  scheduledAt: string | null;
  maxEmailsPerDay: number;
  optedOut: boolean;
  sentCountToday: number;
  companyContactedCount: number;
  recentContactedAt: string | null;
  bounceCountLast7Days: number;
};

export type OutreachSendUpdate = {
  id: string;
  status: "sent" | "failed";
  sentAt: string | null;
  messageId: string | null;
  reason?: string;
};

export type OutreachSendDependencies = {
  listQueuedEmails(): Promise<OutreachSendTarget[]>;
  sendEmail?: (email: OutboundEmail) => Promise<SentEmailResult>;
};

export type OutreachSendOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
  maxEmails?: number;
  recipientTimezoneOffsetMinutes?: number;
};

export type OutreachSendResult = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  updates: OutreachSendUpdate[];
};

export async function runOutreachSendWorker(
  dependencies: OutreachSendDependencies,
  options: OutreachSendOptions,
): Promise<OutreachSendResult> {
  const targets = await dependencies.listQueuedEmails();
  const result: OutreachSendResult = {
    scanned: targets.length,
    sent: 0,
    skipped: 0,
    failed: 0,
    updates: [],
  };
  const maxEmails = options.maxEmails ?? targets.length;
  let attempted = 0;

  for (const target of targets) {
    if (attempted >= maxEmails) {
      result.skipped += 1;
      continue;
    }
    if (!isDue(target, options.now)) {
      result.skipped += 1;
      continue;
    }

    const compliance = evaluateOutreachCompliance({
      now: options.now,
      recipientTimezoneOffsetMinutes: options.recipientTimezoneOffsetMinutes ?? 330,
      email: target.contactEmail,
      companyId: target.companyId,
      dailySentCount: target.sentCountToday,
      companyContactedCount: target.companyContactedCount,
      recentContactedAt: target.recentContactedAt,
      bounceCountLast7Days: target.bounceCountLast7Days,
      optedOutEmails: target.optedOut ? new Set([target.contactEmail.toLowerCase()]) : new Set(),
      dailyHardCap: target.maxEmailsPerDay,
      perCompanyCap: 3,
    });
    if (!compliance.allowed) {
      result.skipped += 1;
      continue;
    }

    attempted += 1;
    if (!dependencies.sendEmail) {
      fail(result, target, "email_sender_not_configured", options);
      continue;
    }

    try {
      const sent = await dependencies.sendEmail({
        to: target.contactEmail,
        subject: target.subject,
        body: htmlToText(target.bodyHtml),
        html: target.bodyHtml,
      });
      const sentAt = options.now.toISOString();
      result.sent += 1;
      result.updates.push({
        id: target.id,
        status: "sent",
        sentAt,
        messageId: sent.messageId,
      });
      options.eventBus?.emit("outreach.email_sent", {
        emailId: target.id,
        campaignId: target.campaignId,
        contactId: target.contactId,
        companyId: target.companyId,
        companyName: target.companyName,
        subject: target.subject,
        sentAt: options.now,
      });
    } catch (error) {
      fail(
        result,
        target,
        error instanceof Error ? error.message : String(error),
        options,
      );
    }
  }

  return result;
}

function fail(
  result: OutreachSendResult,
  target: OutreachSendTarget,
  reason: string,
  options: OutreachSendOptions,
) {
  result.failed += 1;
  result.updates.push({
    id: target.id,
    status: "failed",
    sentAt: null,
    messageId: null,
    reason,
  });
  options.eventBus?.emit("outreach.email_failed", {
    emailId: target.id,
    campaignId: target.campaignId,
    contactId: target.contactId,
    companyId: target.companyId,
    companyName: target.companyName,
    subject: target.subject,
    reason,
    failedAt: options.now,
  });
}

function isDue(target: OutreachSendTarget, now: Date) {
  if (!target.scheduledAt) {
    return true;
  }
  const scheduledAt = new Date(target.scheduledAt);
  return Number.isFinite(scheduledAt.getTime()) && scheduledAt <= now;
}

function htmlToText(value: string) {
  return decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .split("\n")
      .map((line) => line.replace(/\s+/g, " ").replace(/\s+([.,!?;:])/g, "$1").trim())
      .filter(Boolean)
      .join("\n\n"),
  );
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
