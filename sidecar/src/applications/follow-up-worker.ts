import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { followUpEmailDraft } from "./follow-up-message.js";
import {
  dueFollowUpApplications,
  scheduleNextFollowUp,
  type FollowUpApplication,
  type FollowUpScheduleOptions,
  type FollowUpUpdate,
} from "./follow-up-scheduler.js";

export type FollowUpSendResult = {
  communicationId: string | null;
  emailId?: string | null;
  subject?: string | null;
  body?: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

export type FollowUpWorkerDependencies = {
  listApplications: () => Promise<FollowUpApplication[]>;
  sendFollowUp: (application: FollowUpApplication) => Promise<FollowUpSendResult>;
  updateApplicationFollowUp: (applicationId: string, update: FollowUpUpdate) => Promise<void>;
};

export type FollowUpWorkerOptions = FollowUpScheduleOptions & {
  eventBus?: EventBus<CareerEventMap>;
};

export type FollowUpWorkerResult = {
  scanned: number;
  due: number;
  sent: number;
  failed: number;
  ghosted: number;
  followUps: FollowUpResultRecord[];
};

export type FollowUpResultRecord = {
  applicationId: string;
  jobId: string;
  companyName: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail?: string | null;
  communicationId: string | null;
  emailId: string | null;
  subject: string;
  body: string;
  sentAt: string;
  status: "follow_up_sent" | "ghosted";
  followUpCount: number;
  nextFollowUp: string | null;
};

export async function runFollowUpWorker(
  dependencies: FollowUpWorkerDependencies,
  options: FollowUpWorkerOptions,
): Promise<FollowUpWorkerResult> {
  const applications = await dependencies.listApplications();
  const dueApplications = dueFollowUpApplications(applications, options);
  const result: FollowUpWorkerResult = {
    scanned: applications.length,
    due: dueApplications.length,
    sent: 0,
    failed: 0,
    ghosted: 0,
    followUps: [],
  };

  for (const application of dueApplications) {
    try {
      const sendResult = await dependencies.sendFollowUp(application);
      const update = scheduleNextFollowUp(application, options);
      await dependencies.updateApplicationFollowUp(application.id, update);

      result.sent += 1;
      if (update.status === "ghosted") {
        result.ghosted += 1;
      }
      result.followUps.push(followUpRecord(application, sendResult, update, options.now));

      options.eventBus?.emit("follow_up.sent", {
        applicationId: application.id,
        jobId: application.jobId,
        companyName: application.companyName,
        status: update.status,
        followUpCount: update.followUpCount,
        nextFollowUp: update.nextFollowUp,
        communicationId: sendResult.communicationId,
        sentAt: options.now,
      });
    } catch (error) {
      result.failed += 1;
      options.eventBus?.emit("follow_up.failed", {
        applicationId: application.id,
        jobId: application.jobId,
        companyName: application.companyName,
        reason: error instanceof Error ? error.message : String(error),
        failedAt: options.now,
      });
    }
  }

  return result;
}

function followUpRecord(
  application: FollowUpApplication,
  sendResult: FollowUpSendResult,
  update: FollowUpUpdate,
  sentAt: Date,
): FollowUpResultRecord {
  const draft = followUpEmailDraft(application);
  const contactEmail = sendResult.contactEmail ?? application.contactEmail ?? null;

  return {
    applicationId: application.id,
    jobId: application.jobId,
    companyName: application.companyName,
    contactId: sendResult.contactId ?? application.contactId ?? null,
    contactName: sendResult.contactName ?? application.contactName ?? null,
    ...(contactEmail ? { contactEmail } : {}),
    communicationId: sendResult.communicationId,
    emailId: sendResult.emailId ?? null,
    subject: sendResult.subject ?? draft.subject,
    body: sendResult.body ?? draft.body,
    sentAt: sentAt.toISOString(),
    status: update.status,
    followUpCount: update.followUpCount,
    nextFollowUp: update.nextFollowUp,
  };
}
