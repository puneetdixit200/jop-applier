import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type EmailResponseType = "positive" | "negative" | "interview" | "offer" | "other";

export type EmailResponseMessage = {
  id: string;
  applicationId: string | null;
  jobId: string | null;
  companyName: string | null;
  contactId: string | null;
  from: string;
  subject: string | null;
  body: string | null;
  receivedAt: string;
  responseType: EmailResponseType;
  inReplyTo?: string | null;
  references?: string[];
};

export type OutreachReplyUpdate = {
  emailId: string;
  contactId: string;
  campaignId: string;
  messageId: string;
  from: string;
  subject: string | null;
  receivedAt: string;
};

export type EmailResponseCommunication = {
  applicationId: string;
  contactId: string | null;
  direction: "received";
  type: "response";
  subject: string | null;
  body: string | null;
  emailId: string;
  sentAt: string;
  readAt: string | null;
};

export type EmailResponseApplicationUpdate = {
  status: "response_received";
  responseDate: string;
  responseType: EmailResponseType;
  responseNotes: string | null;
};

export type EmailResponseWorkerDependencies = {
  fetchResponses: () => Promise<EmailResponseMessage[]>;
  saveCommunication: (
    communication: EmailResponseCommunication,
  ) => Promise<{ communicationId: string | null }>;
  updateApplicationResponse: (
    applicationId: string,
    update: EmailResponseApplicationUpdate,
  ) => Promise<void>;
  markResponseProcessed: (messageId: string) => Promise<void>;
  recordOutreachReply?: (message: EmailResponseMessage) => Promise<OutreachReplyUpdate | null>;
};

export type EmailResponseWorkerOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
  maxResponses?: number;
};

export type EmailResponseWorkerResult = {
  scanned: number;
  matched: number;
  recorded: number;
  failed: number;
  skipped: number;
  responses?: EmailResponseMessage[];
  outreachReplies?: OutreachReplyUpdate[];
};

export async function runEmailResponseWorker(
  dependencies: EmailResponseWorkerDependencies,
  options: EmailResponseWorkerOptions,
): Promise<EmailResponseWorkerResult> {
  const responses = await dependencies.fetchResponses();
  const limitedResponses = responses.slice(0, options.maxResponses ?? responses.length);
  const result: EmailResponseWorkerResult = {
    scanned: responses.length,
    matched: 0,
    recorded: 0,
    failed: 0,
    skipped: responses.length - limitedResponses.length,
  };
  if (limitedResponses.length > 0) {
    result.responses = limitedResponses;
  }

  for (const response of limitedResponses) {
    if (response.applicationId === null) {
      const outreachReply = await dependencies.recordOutreachReply?.(response);
      if (outreachReply) {
        result.matched += 1;
        result.recorded += 1;
        (result.outreachReplies ??= []).push(outreachReply);
        await dependencies.markResponseProcessed(response.id);
        options.eventBus?.emit("outreach.reply_detected", {
          emailId: outreachReply.emailId,
          contactId: outreachReply.contactId,
          campaignId: outreachReply.campaignId,
          subject: outreachReply.subject,
          receivedAt: new Date(outreachReply.receivedAt),
        });
        continue;
      }
      result.skipped += 1;
      continue;
    }

    result.matched += 1;
    try {
      const saved = await dependencies.saveCommunication({
        applicationId: response.applicationId,
        contactId: response.contactId,
        direction: "received",
        type: "response",
        subject: response.subject,
        body: response.body,
        emailId: response.id,
        sentAt: response.receivedAt,
        readAt: null,
      });
      await dependencies.updateApplicationResponse(response.applicationId, {
        status: "response_received",
        responseDate: response.receivedAt,
        responseType: response.responseType,
        responseNotes: response.subject,
      });
      await dependencies.markResponseProcessed(response.id);

      result.recorded += 1;
      options.eventBus?.emit("response.received", {
        applicationId: response.applicationId,
        jobId: response.jobId,
        companyName: response.companyName,
        communicationId: saved.communicationId,
        responseType: response.responseType,
        subject: response.subject,
        receivedAt: new Date(response.receivedAt),
      });
    } catch (error) {
      result.failed += 1;
      options.eventBus?.emit("email_check.failed", {
        messageId: response.id,
        applicationId: response.applicationId,
        reason: error instanceof Error ? error.message : String(error),
        failedAt: options.now,
      });
    }
  }

  return result;
}
