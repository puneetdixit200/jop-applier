import { describe, expect, it, vi } from "vitest";
import {
  runApplicationReviewControl,
  type ApplicationReviewControlDependencies,
} from "./application-review-control";
import type { Application } from "./tauri-api";

describe("application review control", () => {
  it("persists approval for desktop review-pending applications", async () => {
    const updated = application({ status: "submitting", error_message: null });
    const dependencies = desktopDependencies({
      updateApplicationWorkflowState: vi.fn(async () => updated),
    });

    await expect(
      runApplicationReviewControl(
        application({ status: "review_pending", error_message: "Manual review required" }),
        { id: "approve_review", label: "Approve Submit", nextStatus: "submitting" },
        dependencies,
      ),
    ).resolves.toEqual({
      ok: true,
      workflowStatus: "review approved; submitting application",
      application: updated,
    });
    expect(dependencies.updateApplicationWorkflowState).toHaveBeenCalledWith("app-1", {
      status: "submitting",
      error_message: null,
    });
  });

  it("updates browser preview records without calling desktop APIs", async () => {
    const dependencies = desktopDependencies({
      isDesktopRuntime: () => false,
      updateApplicationWorkflowState: vi.fn(async () => {
        throw new Error("desktop API should not run");
      }),
    });

    await expect(
      runApplicationReviewControl(
        application({ status: "review_pending", error_message: "Manual review required" }),
        { id: "cancel_review", label: "Cancel", nextStatus: "cancelled" },
        dependencies,
      ),
    ).resolves.toMatchObject({
      ok: true,
      workflowStatus: "review cancelled",
      application: {
        id: "app-1",
        status: "cancelled",
        error_message: null,
      },
    });
    expect(dependencies.updateApplicationWorkflowState).not.toHaveBeenCalled();
  });

  it("rejects review actions when the application is not pending review", async () => {
    const dependencies = desktopDependencies();

    await expect(
      runApplicationReviewControl(
        application({ status: "queued" }),
        { id: "approve_review", label: "Approve Submit", nextStatus: "submitting" },
        dependencies,
      ),
    ).resolves.toEqual({
      ok: false,
      workflowStatus: "application is not waiting for review",
      application: null,
    });
    expect(dependencies.updateApplicationWorkflowState).not.toHaveBeenCalled();
  });
});

function desktopDependencies(
  overrides: Partial<ApplicationReviewControlDependencies> = {},
): ApplicationReviewControlDependencies {
  return {
    isDesktopRuntime: () => true,
    updateApplicationWorkflowState: vi.fn(async () => application({ status: "submitting" })),
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    job_id: "job-1",
    job_title: "Frontend Engineer",
    company_name: "Northstar Labs",
    status: "review_pending",
    mode: "semi-auto",
    resume_path: "/docs/resume.pdf",
    cover_letter_path: "/docs/cover.pdf",
    last_follow_up: null,
    follow_up_count: 0,
    next_follow_up: null,
    response_date: null,
    response_type: null,
    response_notes: null,
    submitted_at: null,
    submission_url: "https://ats.example/review",
    confirmation_id: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    notes: null,
    tags: [],
    ...overrides,
  };
}
