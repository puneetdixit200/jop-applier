import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  assertApplicationTransition,
  type ApplicationStatus,
  type ApplicationWorkflowContext,
} from "./application-workflow.js";

export type ApplicationProcessingApplication = {
  id: string;
  jobId: string;
  companyName: string;
  status: ApplicationStatus;
  mode: string;
  resumePath: string | null;
  coverLetterPath: string | null;
  retryCount: number;
  maxRetries: number;
};

export type ApplicationProcessingUpdate = {
  status?: ApplicationStatus;
  resumePath?: string | null;
  coverLetterPath?: string | null;
  submissionUrl?: string | null;
  confirmationId?: string | null;
  submittedAt?: string | null;
  retryCount?: number;
  errorMessage?: string | null;
};

export type ApplicationWorkerDependencies = {
  listApplications: () => Promise<ApplicationProcessingApplication[]>;
  prepareApplication: (application: ApplicationProcessingApplication) => Promise<void>;
  generateResume: (application: ApplicationProcessingApplication) => Promise<{ resumePath: string | null }>;
  generateCoverLetter: (
    application: ApplicationProcessingApplication,
  ) => Promise<{ coverLetterPath: string | null }>;
  fillApplicationForm: (application: ApplicationProcessingApplication) => Promise<{ submissionUrl: string | null }>;
  submitApplication: (application: ApplicationProcessingApplication) => Promise<{ confirmationId: string | null }>;
  updateApplication: (applicationId: string, update: ApplicationProcessingUpdate) => Promise<void>;
};

export type ApplicationWorkerOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
  maxApplications?: number;
  reviewBeforeSubmit?: boolean;
};

export type ApplicationWorkerResult = {
  scanned: number;
  queued: number;
  processed: number;
  failed: number;
  submitted: number;
  reviewPending: number;
};

type ApplicationProcessingOutcome = "review_pending" | "submitted";

export async function runApplicationWorker(
  dependencies: ApplicationWorkerDependencies,
  options: ApplicationWorkerOptions,
): Promise<ApplicationWorkerResult> {
  const applications = await dependencies.listApplications();
  const queuedApplications = applications
    .filter((application) => application.status === "queued")
    .slice(0, options.maxApplications ?? applications.length);
  const result: ApplicationWorkerResult = {
    scanned: applications.length,
    queued: queuedApplications.length,
    processed: 0,
    failed: 0,
    submitted: 0,
    reviewPending: 0,
  };

  for (const application of queuedApplications) {
    try {
      const outcome = await processQueuedApplication(application, dependencies, options);
      result.processed += 1;
      if (outcome === "submitted") {
        result.submitted += 1;
      } else {
        result.reviewPending += 1;
      }
    } catch (error) {
      result.failed += 1;
      await markApplicationFailed(application, dependencies, options, error);
    }
  }

  return result;
}

async function processQueuedApplication(
  application: ApplicationProcessingApplication,
  dependencies: ApplicationWorkerDependencies,
  options: ApplicationWorkerOptions,
): Promise<ApplicationProcessingOutcome> {
  const reviewBeforeSubmit = shouldReviewBeforeSubmit(application, options);
  let current = await transitionApplication(application, "preparing", { status: "preparing" }, dependencies, {
    reviewBeforeSubmit,
  });
  await dependencies.prepareApplication(current);

  const resume = await dependencies.generateResume(current);
  current = await transitionApplication(
    current,
    "resume_generated",
    { status: "resume_generated", resumePath: resume.resumePath },
    dependencies,
    { reviewBeforeSubmit },
  );

  const coverLetter = await dependencies.generateCoverLetter(current);
  current = await transitionApplication(
    current,
    "cover_letter_generated",
    {
      status: "cover_letter_generated",
      coverLetterPath: coverLetter.coverLetterPath,
    },
    dependencies,
    { reviewBeforeSubmit },
  );

  current = await transitionApplication(current, "form_filling", { status: "form_filling" }, dependencies, {
    reviewBeforeSubmit,
  });
  const form = await dependencies.fillApplicationForm(current);

  if (reviewBeforeSubmit) {
    await transitionApplication(
      current,
      "review_pending",
      { status: "review_pending", submissionUrl: form.submissionUrl },
      dependencies,
      { reviewBeforeSubmit },
    );
    return "review_pending";
  }

  current = await transitionApplication(
    current,
    "submitting",
    { status: "submitting", submissionUrl: form.submissionUrl },
    dependencies,
    { reviewBeforeSubmit },
  );
  const submission = await dependencies.submitApplication(current);
  await transitionApplication(
    current,
    "submitted",
    {
      status: "submitted",
      confirmationId: submission.confirmationId,
      submittedAt: options.now.toISOString(),
      errorMessage: null,
    },
    dependencies,
    { reviewBeforeSubmit },
  );
  options.eventBus?.emit("application.submitted", {
    applicationId: application.id,
    jobId: application.jobId,
    companyName: application.companyName,
    confirmationId: submission.confirmationId,
    submittedAt: options.now,
  });

  return "submitted";
}

async function transitionApplication(
  application: ApplicationProcessingApplication,
  to: ApplicationStatus,
  update: ApplicationProcessingUpdate & { status: ApplicationStatus },
  dependencies: Pick<ApplicationWorkerDependencies, "updateApplication">,
  context: Pick<ApplicationWorkflowContext, "reviewBeforeSubmit">,
): Promise<ApplicationProcessingApplication> {
  assertApplicationTransition(application.status, to, {
    reviewBeforeSubmit: context.reviewBeforeSubmit,
    retryCount: application.retryCount,
    maxRetries: application.maxRetries,
  });
  await dependencies.updateApplication(application.id, update);

  return {
    ...application,
    status: to,
    resumePath: update.resumePath ?? application.resumePath,
    coverLetterPath: update.coverLetterPath ?? application.coverLetterPath,
  };
}

async function markApplicationFailed(
  application: ApplicationProcessingApplication,
  dependencies: Pick<ApplicationWorkerDependencies, "updateApplication">,
  options: ApplicationWorkerOptions,
  error: unknown,
): Promise<void> {
  const reason = error instanceof Error ? error.message : String(error);
  const retryCount = application.retryCount + 1;
  const status: ApplicationStatus =
    retryCount >= application.maxRetries ? "permanently_failed" : "failed";
  await dependencies.updateApplication(application.id, {
    status,
    retryCount,
    errorMessage: reason,
  });
  options.eventBus?.emit("application.failed", {
    applicationId: application.id,
    jobId: application.jobId,
    companyName: application.companyName,
    status,
    reason,
    failedAt: options.now,
  });
}

function shouldReviewBeforeSubmit(
  application: ApplicationProcessingApplication,
  options: ApplicationWorkerOptions,
): boolean {
  if (options.reviewBeforeSubmit !== undefined) {
    return options.reviewBeforeSubmit;
  }

  return application.mode !== "full_auto";
}
