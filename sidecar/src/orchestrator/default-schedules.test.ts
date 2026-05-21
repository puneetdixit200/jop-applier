import { describe, expect, it } from "vitest";
import {
  DEFAULT_SCHEDULED_TASKS,
  DEFAULT_WORKFLOWS_BY_TASK_TYPE,
  calculateNextRunFromSchedule,
} from "./default-schedules.js";

describe("default schedules", () => {
  it("defines the architecture default scheduled tasks and workflow mappings", () => {
    expect(DEFAULT_SCHEDULED_TASKS.map(({ name, type, cronExpression }) => ({ name, type, cronExpression }))).toEqual([
      { name: "Job Discovery", type: "discovery", cronExpression: "0 8-20/4 * * *" },
      { name: "Application Processing", type: "apply", cronExpression: "*/30 * * * *" },
      { name: "Follow-up Check", type: "follow_up", cronExpression: "0 9 * * *" },
      { name: "Email Check", type: "email_check", cronExpression: "*/15 * * * *" },
      { name: "Analytics Refresh", type: "analytics", cronExpression: "0 0 * * *" },
      { name: "Export Sync", type: "export", cronExpression: "0 */6 * * *" },
      { name: "Session Health", type: "session_health", cronExpression: "0 */2 * * *" },
      { name: "Cleanup", type: "cleanup", cronExpression: "0 3 * * 0" },
    ]);
    expect(DEFAULT_WORKFLOWS_BY_TASK_TYPE).toMatchObject({
      follow_up: "follow-up-check",
      discovery: "job-discovery",
      apply: "application-processing",
    });
  });

  it("calculates next runs from interval, daily, and weekly schedule config", () => {
    const applicationProcessing = DEFAULT_SCHEDULED_TASKS.find((task) => task.type === "apply");
    const followUpCheck = DEFAULT_SCHEDULED_TASKS.find((task) => task.type === "follow_up");
    const cleanup = DEFAULT_SCHEDULED_TASKS.find((task) => task.type === "cleanup");

    expect(applicationProcessing).toBeDefined();
    expect(followUpCheck).toBeDefined();
    expect(cleanup).toBeDefined();
    expect(calculateNextRunFromSchedule(applicationProcessing!, new Date("2026-05-27T09:10:00Z"))).toBe(
      "2026-05-27T09:40:00.000Z",
    );
    expect(calculateNextRunFromSchedule(followUpCheck!, new Date("2026-05-27T09:00:00Z"))).toBe(
      "2026-05-28T09:00:00.000Z",
    );
    expect(calculateNextRunFromSchedule(cleanup!, new Date("2026-05-24T03:00:00Z"))).toBe(
      "2026-05-31T03:00:00.000Z",
    );
  });
});
