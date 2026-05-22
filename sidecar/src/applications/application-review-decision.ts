import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { assertApplicationTransition } from "./application-workflow.js";
import type {
  ApplicationProcessingApplication,
  ApplicationProcessingUpdate,
  ApplicationSubmissionResult,
  ApplicationSubmissionVerification,
  ApplicationWorkerDependencies,
} from "./application-worker.js";

export type ApplicationReviewDecision = "approve" | "cancel";

export type ApplicationReviewDecisionDependencies = Pick<
  ApplicationWorkerDependencies,
  "submitApplication" | "updateApplication" | "verifySubmission"
>;

export type ApplicationReviewDecisionOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
};

export type ApplicationReviewDecisionResult =
  | {
      status: "submitted";
      confirmationId: string | null;
    }
  | {
      status: "cancelled";
    }
  | {
      status: "failed";
      reason: string;
    };

export async function runApplicationReviewDecision(
  application: ApplicationProcessingApplication,
  decision: ApplicationReviewDecision,
  dependencies: ApplicationReviewDecisionDependencies,
  options: ApplicationReviewDecisionOptions,
): Promise<ApplicationReviewDecisionResult> {
  if (decision === "cancel") {
    await transitionReviewedApplication(
      application,
      "cancelled",
      {
        status: "cancelled",
        errorMessage: null,
      },
      dependencies,
    );

    return { status: "cancelled" };
  }

  let current = await transitionReviewedApplication(
    application,
    "submitting",
    {
      status: "submitting",
      errorMessage: null,
    },
    dependencies,
  );
  let submission: ApplicationSubmissionResult;
  let verification: ApplicationSubmissionVerification;
  try {
    submission = await dependencies.submitApplication(current);
    verification = await verifySubmission(dependencies, current, submission);
    if (!verification.ok) {
      throw new Error(`Submission verification failed: ${verification.message}`);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await markReviewSubmissionFailed(current, dependencies, reason, options);

    return {
      status: "failed",
      reason,
    };
  }
  const confirmationId = verification.confirmationId ?? submission.confirmationId;

  current = await transitionReviewedApplication(
    current,
    "submitted",
    {
      status: "submitted",
      confirmationId,
      submittedAt: options.now.toISOString(),
      errorMessage: null,
    },
    dependencies,
  );
  options.eventBus?.emit("application.submitted", {
    applicationId: current.id,
    jobId: current.jobId,
    companyName: current.companyName,
    confirmationId,
    submittedAt: options.now,
  });

  return {
    status: "submitted",
    confirmationId,
  };
}

async function markReviewSubmissionFailed(
  application: ApplicationProcessingApplication,
  dependencies: Pick<ApplicationReviewDecisionDependencies, "updateApplication">,
  reason: string,
  options: ApplicationReviewDecisionOptions,
): Promise<void> {
  const retryCount = application.retryCount + 1;
  await transitionReviewedApplication(
    application,
    "failed",
    {
      status: "failed",
      retryCount,
      errorMessage: reason,
    },
    dependencies,
  );
  options.eventBus?.emit("application.failed", {
    applicationId: application.id,
    jobId: application.jobId,
    companyName: application.companyName,
    status: "failed",
    reason,
    failedAt: options.now,
  });
}

async function transitionReviewedApplication(
  application: ApplicationProcessingApplication,
  to: ApplicationProcessingApplication["status"],
  update: ApplicationProcessingUpdate & { status: ApplicationProcessingApplication["status"] },
  dependencies: Pick<ApplicationReviewDecisionDependencies, "updateApplication">,
): Promise<ApplicationProcessingApplication> {
  assertApplicationTransition(application.status, to, {
    reviewBeforeSubmit: true,
    retryCount: application.retryCount,
    maxRetries: application.maxRetries,
  });
  await dependencies.updateApplication(application.id, update);

  return {
    ...application,
    status: to,
  };
}

async function verifySubmission(
  dependencies: Pick<ApplicationReviewDecisionDependencies, "verifySubmission">,
  application: ApplicationProcessingApplication,
  submission: ApplicationSubmissionResult,
): Promise<ApplicationSubmissionVerification> {
  if (dependencies.verifySubmission) {
    return dependencies.verifySubmission(application, submission);
  }

  return {
    ok: true,
    confirmationId: submission.confirmationId,
    message: "submission verification skipped",
  };
}
