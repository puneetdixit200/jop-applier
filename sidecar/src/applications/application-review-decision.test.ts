import { describe, expect, it } from "vitest";
import {
  runApplicationReviewDecision,
  type ApplicationReviewDecisionDependencies,
} from "./application-review-decision.js";
import type { ApplicationProcessingApplication, ApplicationProcessingUpdate } from "./application-worker.js";

describe("application review decision", () => {
  it("submits a review-pending application after approval", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];
    const submitted: string[] = [];
    const verified: string[] = [];

    const result = await runApplicationReviewDecision(
      application(),
      "approve",
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        submitApplication: async (application) => {
          submitted.push(`${application.id}:${application.status}`);
          return {
            confirmationId: null,
            receiptText: "Thanks for applying. Confirmation REVIEW-42",
          };
        },
        verifySubmission: async (application, submission) => {
          verified.push(`${application.id}:${submission.receiptText}`);
          return {
            ok: true,
            confirmationId: "REVIEW-42",
            message: "confirmation receipt detected",
          };
        },
      }),
      { now: new Date("2026-05-28T13:00:00Z") },
    );

    expect(result).toEqual({
      status: "submitted",
      confirmationId: "REVIEW-42",
    });
    expect(submitted).toEqual(["app-1:submitting"]);
    expect(verified).toEqual(["app-1:Thanks for applying. Confirmation REVIEW-42"]);
    expect(updates).toEqual([
      {
        applicationId: "app-1",
        update: {
          status: "submitting",
          errorMessage: null,
        },
      },
      {
        applicationId: "app-1",
        update: {
          status: "submitted",
          confirmationId: "REVIEW-42",
          submittedAt: "2026-05-28T13:00:00.000Z",
          errorMessage: null,
        },
      },
    ]);
  });

  it("cancels a review-pending application after rejection", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];
    const submitted: string[] = [];

    const result = await runApplicationReviewDecision(
      application(),
      "cancel",
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        submitApplication: async (reviewedApplication) => {
          submitted.push(reviewedApplication.id);
          return { confirmationId: "should-not-submit" };
        },
      }),
      { now: new Date("2026-05-28T13:00:00Z") },
    );

    expect(result).toEqual({ status: "cancelled" });
    expect(submitted).toEqual([]);
    expect(updates).toEqual([
      {
        applicationId: "app-1",
        update: {
          status: "cancelled",
          errorMessage: null,
        },
      },
    ]);
  });

  it("marks approved submissions failed when review submission verification fails", async () => {
    const updates: Array<{ applicationId: string; update: ApplicationProcessingUpdate }> = [];

    const result = await runApplicationReviewDecision(
      application(),
      "approve",
      dependencies({
        updateApplication: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
        submitApplication: async () => ({ confirmationId: "CONF-42" }),
        verifySubmission: async () => ({
          ok: false,
          confirmationId: null,
          message: "success banner not found",
        }),
      }),
      { now: new Date("2026-05-28T13:00:00Z") },
    );

    expect(result).toEqual({
      status: "failed",
      reason: "Submission verification failed: success banner not found",
    });
    expect(updates).toEqual([
      {
        applicationId: "app-1",
        update: {
          status: "submitting",
          errorMessage: null,
        },
      },
      {
        applicationId: "app-1",
        update: {
          status: "failed",
          retryCount: 1,
          errorMessage: "Submission verification failed: success banner not found",
        },
      },
    ]);
  });

  it("rejects decisions for applications that are not waiting for review", async () => {
    const updates: ApplicationProcessingUpdate[] = [];

    await expect(
      runApplicationReviewDecision(
        application({ status: "queued" }),
        "approve",
        dependencies({
          updateApplication: async (_applicationId, update) => {
            updates.push(update);
          },
        }),
        { now: new Date("2026-05-28T13:00:00Z") },
      ),
    ).rejects.toThrow("Cannot transition application from queued to submitting");
    expect(updates).toEqual([]);
  });
});

function dependencies(
  overrides: Partial<ApplicationReviewDecisionDependencies> = {},
): ApplicationReviewDecisionDependencies {
  return {
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
    status: "review_pending",
    mode: "semi_auto",
    resumePath: "/tmp/app-1-resume.pdf",
    coverLetterPath: "/tmp/app-1-cover-letter.pdf",
    retryCount: 0,
    maxRetries: 3,
    ...overrides,
  };
}
