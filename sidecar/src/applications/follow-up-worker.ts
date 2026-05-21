import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  dueFollowUpApplications,
  scheduleNextFollowUp,
  type FollowUpApplication,
  type FollowUpScheduleOptions,
  type FollowUpUpdate,
} from "./follow-up-scheduler.js";

export type FollowUpSendResult = {
  communicationId: string | null;
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
