import type { EventBus } from "../../orchestrator/event-bus.js";
import type { CareerEventMap } from "../../orchestrator/events.js";
import { renderUnsubscribeFooter } from "./email-content-validator.js";

export type OutreachFollowUpEmail = {
  id: string;
  campaignId: string;
  contactId: string;
  sequenceStep: number;
  subject: string;
  bodyHtml: string;
  status: string;
  scheduledAt: string | null;
  sentAt: string | null;
};

export type OutreachFollowUpThread = {
  campaignId: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  optedOut: boolean;
  companyId: string;
  companyName: string;
  fundingLabel: string;
  companySummary: string | null;
  unsubscribeBaseUrl: string;
  emails: OutreachFollowUpEmail[];
};

export type OutreachFollowUpDraft = {
  campaign_id: string;
  contact_id: string;
  sequence_step: number;
  subject: string;
  body_html: string;
  status: "pending" | "queued";
  scheduled_at: string;
  sent_at: null;
  message_id: null;
};

export type OutreachFollowUpDependencies = {
  listThreads(): Promise<OutreachFollowUpThread[]>;
  generateFollowUpEmail?: (
    thread: OutreachFollowUpThread,
    step: 2 | 3,
  ) => Promise<{ subject: string; bodyHtml: string }>;
};

export type OutreachFollowUpOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
  reviewBeforeSend?: boolean;
};

export type OutreachFollowUpResult = {
  scanned: number;
  queued: number;
  skipped: number;
  drafts: OutreachFollowUpDraft[];
};

const sequenceDelays = new Map<number, number>([
  [2, 3],
  [3, 7],
]);

export async function runOutreachFollowUpWorker(
  dependencies: OutreachFollowUpDependencies,
  options: OutreachFollowUpOptions,
): Promise<OutreachFollowUpResult> {
  const threads = await dependencies.listThreads();
  const result: OutreachFollowUpResult = {
    scanned: threads.length,
    queued: 0,
    skipped: 0,
    drafts: [],
  };

  for (const thread of threads) {
    const nextStep = dueFollowUpStep(thread, options.now);
    if (nextStep === null || thread.optedOut) {
      result.skipped += 1;
      continue;
    }

    const generated = dependencies.generateFollowUpEmail
      ? await dependencies.generateFollowUpEmail(thread, nextStep)
      : defaultFollowUpEmail(thread, nextStep);
    const unsubscribeUrl = `${thread.unsubscribeBaseUrl}?token=${Buffer.from(thread.contactEmail.toLowerCase()).toString("base64url")}`;
    const draft: OutreachFollowUpDraft = {
      campaign_id: thread.campaignId,
      contact_id: thread.contactId,
      sequence_step: nextStep,
      subject: generated.subject,
      body_html: `${generated.bodyHtml}${renderUnsubscribeFooter(unsubscribeUrl)}`,
      status: options.reviewBeforeSend === false ? "queued" : "pending",
      scheduled_at: options.now.toISOString(),
      sent_at: null,
      message_id: null,
    };
    result.drafts.push(draft);
    result.queued += 1;
    options.eventBus?.emit("outreach.follow_up_queued", {
      campaignId: thread.campaignId,
      contactId: thread.contactId,
      companyId: thread.companyId,
      companyName: thread.companyName,
      sequenceStep: nextStep,
      queuedAt: options.now,
    });
  }

  return result;
}

function dueFollowUpStep(thread: OutreachFollowUpThread, now: Date): 2 | 3 | null {
  if (thread.emails.some((email) => email.status === "replied" || email.status === "bounced" || email.status === "cancelled")) {
    return null;
  }

  const sent = thread.emails
    .filter((email) => ["sent", "opened"].includes(email.status) && email.sentAt)
    .sort((left, right) => left.sequenceStep - right.sequenceStep);
  const firstSent = sent.find((email) => email.sequenceStep === 1);
  if (!firstSent?.sentAt) {
    return null;
  }

  const completedSteps = new Set(sent.map((email) => email.sequenceStep));
  const blockedSteps = new Set(
    thread.emails
      .filter((email) => ["pending", "queued"].includes(email.status))
      .map((email) => email.sequenceStep),
  );

  for (const step of [2, 3] as const) {
    if (completedSteps.has(step) || blockedSteps.has(step)) {
      continue;
    }
    const delayDays = sequenceDelays.get(step) ?? 0;
    const dueAt = new Date(firstSent.sentAt).getTime() + delayDays * 24 * 60 * 60 * 1000;
    if (Number.isFinite(dueAt) && now.getTime() >= dueAt) {
      return step;
    }
  }

  return null;
}

function defaultFollowUpEmail(thread: OutreachFollowUpThread, step: 2 | 3) {
  const firstName = thread.contactName.split(/\s+/)[0] || thread.contactName;
  if (step === 2) {
    return {
      subject: `Re: ${baseSubject(thread)}`,
      bodyHtml: [
        `<p>Hi ${escapeHtml(firstName)},</p>`,
        `<p>Following up on my note about ${escapeHtml(thread.companyName)} and the ${escapeHtml(thread.fundingLabel)} round.</p>`,
        `<p>${escapeHtml(thread.companySummary ?? "I would be glad to share relevant work and see if there is a fit.")}</p>`,
        "<p>Would a brief conversation be useful?</p>",
      ].join(""),
    };
  }

  return {
    subject: `Final note: ${thread.companyName}`,
    bodyHtml: [
      `<p>Hi ${escapeHtml(firstName)},</p>`,
      `<p>One final follow-up from my side. If full-time roles are not active yet, I would also be open to contract, internship, or referral conversations around ${escapeHtml(thread.companyName)}.</p>`,
      "<p>Should I close the loop here?</p>",
    ].join(""),
  };
}

function baseSubject(thread: OutreachFollowUpThread) {
  return thread.emails.find((email) => email.sequenceStep === 1)?.subject ?? `${thread.companyName} ${thread.fundingLabel}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
