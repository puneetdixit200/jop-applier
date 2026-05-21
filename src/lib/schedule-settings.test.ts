import { describe, expect, it } from "vitest";
import {
  buildDefaultScheduledTasks,
  loadOrSeedScheduledTasks,
  scheduledTaskSummaries,
} from "./schedule-settings";
import type { ScheduledTask, UpsertScheduledTask } from "./tauri-api";

describe("schedule settings", () => {
  it("builds the architecture default scheduled tasks with initial next runs", () => {
    const tasks = buildDefaultScheduledTasks(new Date("2026-05-29T07:30:00.000Z"));

    expect(tasks.map(({ name, type, cron_expression, next_run }) => ({ name, type, cron_expression, next_run }))).toEqual([
      {
        name: "Job Discovery",
        type: "discovery",
        cron_expression: "0 8-20/4 * * *",
        next_run: "2026-05-29T08:00:00.000Z",
      },
      {
        name: "Application Processing",
        type: "apply",
        cron_expression: "*/30 * * * *",
        next_run: "2026-05-29T08:00:00.000Z",
      },
      {
        name: "Follow-up Check",
        type: "follow_up",
        cron_expression: "0 9 * * *",
        next_run: "2026-05-29T09:00:00.000Z",
      },
      {
        name: "Email Check",
        type: "email_check",
        cron_expression: "*/15 * * * *",
        next_run: "2026-05-29T07:45:00.000Z",
      },
      {
        name: "Analytics Refresh",
        type: "analytics",
        cron_expression: "0 0 * * *",
        next_run: "2026-05-30T00:00:00.000Z",
      },
      {
        name: "Export Sync",
        type: "export",
        cron_expression: "0 */6 * * *",
        next_run: "2026-05-29T13:30:00.000Z",
      },
      {
        name: "Session Health",
        type: "session_health",
        cron_expression: "0 */2 * * *",
        next_run: "2026-05-29T09:30:00.000Z",
      },
      {
        name: "Cleanup",
        type: "cleanup",
        cron_expression: "0 3 * * 0",
        next_run: "2026-05-31T03:00:00.000Z",
      },
    ]);
  });

  it("seeds defaults only when no scheduled tasks exist", async () => {
    const savedTasks: UpsertScheduledTask[] = [];
    const seeded = await loadOrSeedScheduledTasks(
      {
        listScheduledTasks: async () => [],
        saveScheduledTask: async (task) => {
          savedTasks.push(task);
          return persistedTask(task, `saved-${savedTasks.length}`);
        },
      },
      new Date("2026-05-29T07:30:00.000Z"),
    );

    expect(seeded).toHaveLength(8);
    expect(savedTasks).toHaveLength(8);

    const existing = [persistedTask(buildDefaultScheduledTasks(new Date("2026-05-29T07:30:00.000Z"))[0], "existing")];
    const loaded = await loadOrSeedScheduledTasks(
      {
        listScheduledTasks: async () => existing,
        saveScheduledTask: async () => {
          throw new Error("should not save defaults when tasks already exist");
        },
      },
      new Date("2026-05-29T07:30:00.000Z"),
    );

    expect(loaded).toEqual(existing);
  });

  it("summarizes enabled upcoming tasks for the dashboard", () => {
    const tasks = [
      persistedTask(
        {
          ...buildDefaultScheduledTasks(new Date("2026-05-29T07:30:00.000Z"))[0],
          name: "Disabled",
          is_enabled: false,
          next_run: "2026-05-29T07:31:00.000Z",
        },
        "disabled",
      ),
      persistedTask(
        {
          ...buildDefaultScheduledTasks(new Date("2026-05-29T07:30:00.000Z"))[0],
          name: "Job Discovery",
          next_run: "2026-05-29T08:00:00.000Z",
        },
        "discovery",
      ),
      persistedTask(
        {
          ...buildDefaultScheduledTasks(new Date("2026-05-29T07:30:00.000Z"))[3],
          name: "Email Check",
          next_run: "2026-05-29T07:45:00.000Z",
        },
        "email",
      ),
    ];

    expect(scheduledTaskSummaries(tasks)).toEqual([
      { id: "email", name: "Email Check", nextRunLabel: "May 29 07:45 UTC" },
      { id: "discovery", name: "Job Discovery", nextRunLabel: "May 29 08:00 UTC" },
    ]);
  });
});

function persistedTask(task: UpsertScheduledTask, id: string): ScheduledTask {
  return {
    id,
    created_at: "2026-05-29T07:00:00.000Z",
    ...task,
  };
}
