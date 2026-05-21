import { describe, expect, it } from "vitest";
import {
  allowedApplicationTransitions,
  assertApplicationTransition,
  type ApplicationWorkflowContext,
} from "./application-workflow.js";

const reviewContext: ApplicationWorkflowContext = {
  reviewBeforeSubmit: true,
  retryCount: 0,
  maxRetries: 3,
};

describe("application workflow transitions", () => {
  it("follows the resume generation sequence before form filling", () => {
    expect(allowedApplicationTransitions("queued", reviewContext)).toEqual(["preparing"]);
    expect(allowedApplicationTransitions("preparing", reviewContext)).toEqual(["resume_generated"]);
    expect(allowedApplicationTransitions("resume_generated", reviewContext)).toEqual(["cover_letter_generated"]);
    expect(allowedApplicationTransitions("cover_letter_generated", reviewContext)).toEqual(["form_filling"]);
  });

  it("routes form filling through review only when review is enabled", () => {
    expect(allowedApplicationTransitions("form_filling", reviewContext)).toEqual(["review_pending"]);
    expect(allowedApplicationTransitions("form_filling", { ...reviewContext, reviewBeforeSubmit: false })).toEqual([
      "submitting",
    ]);
  });

  it("allows retries until max retries are exhausted", () => {
    expect(allowedApplicationTransitions("failed", { ...reviewContext, retryCount: 2, maxRetries: 3 })).toEqual([
      "queued",
    ]);
    expect(allowedApplicationTransitions("failed", { ...reviewContext, retryCount: 3, maxRetries: 3 })).toEqual([
      "permanently_failed",
    ]);
  });

  it("rejects invalid or terminal transitions", () => {
    expect(() => assertApplicationTransition("submitted", "queued", reviewContext)).toThrow(
      "Cannot transition application from submitted to queued",
    );
    expect(() => assertApplicationTransition("review_pending", "submitted", reviewContext)).toThrow(
      "Cannot transition application from review_pending to submitted",
    );
  });
});
