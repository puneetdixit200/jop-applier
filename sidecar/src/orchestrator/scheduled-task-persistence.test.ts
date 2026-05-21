import { describe, expect, it } from "vitest";
import { DEFAULT_WORKFLOWS_BY_TASK_TYPE } from "./default-schedules.js";
import { runDueScheduledTasks } from "./scheduled-task-runner.js";
import {
  createScheduledTaskRunnerDependencies,
  type PersistedScheduledTaskRunUpdate,
} from "./scheduled-task-persistence.js";

describe("scheduled task persistence adapter", () => {
  it("maps persisted Tauri scheduled tasks into the runner and writes run updates back", async () => {
    const workflowRuns: string[] = [];
    const updates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];

    const dependencies = createScheduledTaskRunnerDependencies(
      {
        listScheduledTasks: async () => [
          {
            id: "task-1",
            name: "Follow-up Check",
            type: "follow_up",
            cron_expression: "0 9 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-27T09:00:00Z",
            config: {
              cadence: { kind: "daily", hour: 9, minute: 0 },
            },
            created_at: "2026-05-21T09:00:00Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          updates.push({ id, update });
        },
      },
      async (workflowId) => {
        workflowRuns.push(workflowId);
      },
    );

    const result = await runDueScheduledTasks(dependencies, {
      now: new Date("2026-05-27T09:00:00Z"),
      workflowsByTaskType: DEFAULT_WORKFLOWS_BY_TASK_TYPE,
    });

    expect(result).toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(workflowRuns).toEqual(["follow-up-check"]);
    expect(updates).toEqual([
      {
        id: "task-1",
        update: {
          last_run: "2026-05-27T09:00:00.000Z",
          next_run: "2026-05-28T09:00:00.000Z",
        },
      },
    ]);
  });
});
