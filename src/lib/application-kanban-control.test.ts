import { describe, expect, it, vi } from "vitest";
import {
  runApplicationKanbanMove,
  statusForKanbanColumn,
  type ApplicationKanbanControlDependencies,
} from "./application-kanban-control";
import type { Application } from "./tauri-api";

describe("application kanban control", () => {
  it("maps tracker columns to persisted workflow statuses", () => {
    expect(statusForKanbanColumn("queued")).toBe("queued");
    expect(statusForKanbanColumn("applying")).toBe("form_filling");
    expect(statusForKanbanColumn("applied")).toBe("submitted");
    expect(statusForKanbanColumn("response")).toBe("responseReceived");
    expect(statusForKanbanColumn("closed")).toBe("cancelled");
  });

  it("persists desktop moves through workflow state updates", async () => {
    const updated = application({ status: "submitted", error_message: null });
    const dependencies = desktopDependencies({
      updateApplicationWorkflowState: vi.fn(async () => updated),
    });

    await expect(
      runApplicationKanbanMove(application({ status: "review_pending" }), "applied", dependencies),
    ).resolves.toEqual({
      ok: true,
      workflowStatus: "application moved to Applied",
      application: updated,
    });
    expect(dependencies.updateApplicationWorkflowState).toHaveBeenCalledWith("app-1", {
      status: "submitted",
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
      runApplicationKanbanMove(application({ status: "queued" }), "closed", dependencies),
    ).resolves.toMatchObject({
      ok: true,
      workflowStatus: "application moved to Closed",
      application: {
        id: "app-1",
        status: "cancelled",
        error_message: null,
      },
    });
    expect(dependencies.updateApplicationWorkflowState).not.toHaveBeenCalled();
  });

  it("skips moves that would leave the application in the same status", async () => {
    const dependencies = desktopDependencies();

    await expect(
      runApplicationKanbanMove(application({ status: "submitted" }), "applied", dependencies),
    ).resolves.toEqual({
      ok: true,
      workflowStatus: "application already in Applied",
      application: null,
    });
    expect(dependencies.updateApplicationWorkflowState).not.toHaveBeenCalled();
  });
});

function desktopDependencies(
  overrides: Partial<ApplicationKanbanControlDependencies> = {},
): ApplicationKanbanControlDependencies {
  return {
    isDesktopRuntime: () => true,
    updateApplicationWorkflowState: vi.fn(async () => application({ status: "submitted" })),
    ...overrides,
  };
}

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    job_id: "job-1",
    job_title: "Frontend Engineer",
    company_name: "Northstar Labs",
    status: "queued",
    mode: "semi-auto",
    resume_path: null,
    cover_letter_path: null,
    last_follow_up: null,
    follow_up_count: 0,
    next_follow_up: null,
    response_date: null,
    response_type: null,
    response_notes: null,
    submitted_at: null,
    submission_url: null,
    confirmation_id: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    notes: null,
    tags: [],
    ...overrides,
  };
}
