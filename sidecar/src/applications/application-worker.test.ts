import { describe, expect, it } from "vitest";
import {
  runApplicationWorker,
  type ApplicationProcessingApplication,
  type ApplicationProcessingUpdate,
  type ApplicationWorkerDependencies,
} from "./application-worker.js";

describe("application worker", () => {
  it("verifies full-auto submissions before marking applications submitted", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];
    const verified: string[] = [];

    const result = await runApplicationWorker(
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        fillApplicationForm: async () => ({
          submissionUrl: "https://jobs.lever.co/northstar/42",
          requiredMissing: [],
        }),
        submitApplication: async () => ({
          confirmationId: null,
          receiptText: "Thanks for applying. Confirmation CONF-42",
        }),
        verifySubmission: async (application, submission) => {
          verified.push(`${application.id}:${submission.receiptText}`);
          return {
            ok: true,
            confirmationId: "CONF-42",
            message: "confirmation receipt detected",
          };
        },
      }),
      {
        now: new Date("2026-05-28T12:00:00Z"),
        reviewBeforeSubmit: false,
      },
    );

    expect(result).toMatchObject({
      processed: 1,
      reviewPending: 0,
      failed: 0,
      submitted: 1,
    });
    expect(verified).toEqual(["app-1:Thanks for applying. Confirmation CONF-42"]);
    expect(updates.at(-1)).toEqual({
      applicationId: "app-1",
      update: {
        status: "submitted",
        confirmationId: "CONF-42",
        submittedAt: "2026-05-28T12:00:00.000Z",
        errorMessage: null,
      },
    });
  });

  it("fails full-auto submissions when post-submit verification does not pass", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];

    const result = await runApplicationWorker(
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        fillApplicationForm: async () => ({
          submissionUrl: "https://jobs.lever.co/northstar/42",
          requiredMissing: [],
        }),
        submitApplication: async () => ({ confirmationId: "CONF-42" }),
        verifySubmission: async () => ({
          ok: false,
          confirmationId: null,
          message: "success banner not found",
        }),
      }),
      {
        now: new Date("2026-05-28T12:00:00Z"),
        reviewBeforeSubmit: false,
      },
    );

    expect(result).toMatchObject({
      processed: 0,
      reviewPending: 0,
      failed: 1,
      submitted: 0,
    });
    expect(updates.at(-1)).toEqual({
      applicationId: "app-1",
      update: {
        status: "failed",
        retryCount: 1,
        errorMessage: "Submission verification failed: success banner not found",
      },
    });
  });

  it("routes semi-auto applications with missing required form fields to manual review", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];

    const result = await runApplicationWorker(
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        fillApplicationForm: async () => ({
          submissionUrl: "https://jobs.lever.co/northstar/42",
          requiredMissing: ["Portfolio URL"],
        }),
      }),
      {
        now: new Date("2026-05-28T12:00:00Z"),
        reviewBeforeSubmit: true,
      },
    );

    expect(result).toMatchObject({
      processed: 1,
      reviewPending: 1,
      failed: 0,
      submitted: 0,
    });
    expect(updates.at(-1)).toEqual({
      applicationId: "app-1",
      update: {
        status: "review_pending",
        submissionUrl: "https://jobs.lever.co/northstar/42",
        errorMessage: "Manual review required for required fields: Portfolio URL",
      },
    });
  });

  it("fails full-auto applications instead of submitting when required form fields are missing", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];
    const submitted: string[] = [];

    const result = await runApplicationWorker(
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        fillApplicationForm: async () => ({
          submissionUrl: "https://jobs.lever.co/northstar/42",
          requiredMissing: ["Portfolio URL", "Work authorization"],
        }),
        submitApplication: async (application) => {
          submitted.push(application.id);
          return { confirmationId: "confirmation-app-1" };
        },
      }),
      {
        now: new Date("2026-05-28T12:00:00Z"),
        reviewBeforeSubmit: false,
      },
    );

    expect(result).toMatchObject({
      processed: 0,
      reviewPending: 0,
      failed: 1,
      submitted: 0,
    });
    expect(submitted).toEqual([]);
    expect(updates.at(-1)).toEqual({
      applicationId: "app-1",
      update: {
        status: "failed",
        retryCount: 1,
        errorMessage:
          "Application form is missing required fields before submission: Portfolio URL, Work authorization",
      },
    });
  });
});

function dependencies(
  overrides: Partial<ApplicationWorkerDependencies> = {},
): ApplicationWorkerDependencies {
  return {
    listApplications: async () => [application()],
    prepareApplication: async () => undefined,
    generateResume: async () => ({ resumePath: "/tmp/app-1-resume.pdf" }),
    generateCoverLetter: async () => ({ coverLetterPath: "/tmp/app-1-cover-letter.pdf" }),
    fillApplicationForm: async () => ({ submissionUrl: "https://jobs.example/app-1" }),
    submitApplication: async () => ({ confirmationId: "confirmation-app-1" }),
    updateApplication: async () => undefined,
    ...overrides,
  };
}

function application(overrides: Partial<ApplicationProcessingApplication> = {}): ApplicationProcessingApplication {
  return {
    id: "app-1",
    jobId: "job-1",
    companyName: "Northstar Labs",
    status: "queued",
    mode: "semi_auto",
    resumePath: null,
    coverLetterPath: null,
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}
