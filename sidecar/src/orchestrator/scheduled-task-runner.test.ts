import { describe, expect, it } from "vitest";
import { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";
import {
  runDueScheduledTasks,
  type ScheduledTask,
  type ScheduledTaskRunUpdate,
} from "./scheduled-task-runner.js";

const baseTask: ScheduledTask = {
  id: "task-1",
  name: "Follow-up Check",
  type: "follow_up",
  cronExpression: "0 9 * * *",
  isEnabled: true,
  lastRun: null,
  nextRun: "2026-05-27T08:59:00Z",
  config: {},
};

describe("scheduled task runner", () => {
  it("runs enabled due tasks through mapped workflows and records the next run", async () => {
    const bus = new EventBus<CareerEventMap>();
    const workflowRuns: string[] = [];
    const updates: Array<{ taskId: string; update: ScheduledTaskRunUpdate }> = [];
    const events: string[] = [];

    bus.on("scheduled_task.started", (event) => {
      events.push(`start:${event.taskId}:${event.workflowId}`);
    });
    bus.on("scheduled_task.completed", (event) => {
      events.push(`done:${event.taskId}:${event.nextRun}`);
    });

    const result = await runDueScheduledTasks(
      {
        listScheduledTasks: async () => [
          baseTask,
          { ...baseTask, id: "disabled", isEnabled: false },
          { ...baseTask, id: "future", nextRun: "2026-05-27T10:00:00Z" },
        ],
        runWorkflow: async (workflowId) => {
          workflowRuns.push(workflowId);
        },
        updateScheduledTaskRun: async (taskId, update) => {
          updates.push({ taskId, update });
        },
        calculateNextRun: (task, now) =>
          task.type === "follow_up" ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString() : null,
      },
      {
        now: new Date("2026-05-27T09:00:00Z"),
        workflowsByTaskType: {
          follow_up: "follow-up-check",
        },
        eventBus: bus,
      },
    );

    expect(result).toEqual({
      scanned: 3,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 2,
    });
    expect(workflowRuns).toEqual(["follow-up-check"]);
    expect(updates).toEqual([
      {
        taskId: "task-1",
        update: {
          lastRun: "2026-05-27T09:00:00.000Z",
          nextRun: "2026-05-28T09:00:00.000Z",
        },
      },
    ]);
    expect(events).toEqual([
      "start:task-1:follow-up-check",
      "done:task-1:2026-05-28T09:00:00.000Z",
    ]);
  });
});
