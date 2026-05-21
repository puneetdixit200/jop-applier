import { describe, expect, it } from "vitest";
import { runScheduleControl, type ScheduleControlDependencies } from "./schedule-control";
import type { ScheduledTask } from "./tauri-api";

describe("schedule control", () => {
  it("does not run scheduled tasks in browser preview mode", async () => {
    const dependencies: ScheduleControlDependencies = {
      isDesktopRuntime: () => false,
      runDueScheduledTasks: async () => {
        throw new Error("should not run scheduled tasks outside desktop runtime");
      },
      listScheduledTasks: async () => [],
    };

    await expect(runScheduleControl(dependencies)).resolves.toEqual({
      workflowStatus: "Browser preview",
    });
  });

  it("runs due scheduled tasks and reloads dashboard schedule summaries", async () => {
    const calls: string[] = [];
    const dependencies: ScheduleControlDependencies = {
      isDesktopRuntime: () => true,
      runDueScheduledTasks: async () => {
        calls.push("runDueScheduledTasks");
        return { scanned: 2, due: 1, completed: 1, failed: 0, skipped: 1 };
      },
      listScheduledTasks: async () => {
        calls.push("listScheduledTasks");
        return [
          scheduledTask({
            id: "discovery",
            name: "Job Discovery",
            next_run: "2026-05-29T12:00:00Z",
          }),
        ];
      },
    };

    await expect(runScheduleControl(dependencies)).resolves.toEqual({
      workflowStatus: "Scheduled tasks: 1/1 completed",
      schedules: [{ id: "discovery", name: "Job Discovery", nextRunLabel: "May 29 12:00 UTC" }],
    });
    expect(calls).toEqual(["runDueScheduledTasks", "listScheduledTasks"]);
  });
});

function scheduledTask(overrides: Partial<ScheduledTask>): ScheduledTask {
  return {
    id: "task",
    name: "Task",
    type: "discovery",
    cron_expression: "0 8-20/4 * * *",
    is_enabled: true,
    last_run: null,
    next_run: null,
    config: {},
    created_at: "2026-05-29T08:00:00Z",
    ...overrides,
  };
}
