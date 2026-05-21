import { describe, expect, it } from "vitest";
import { createSidecarRuntime } from "./index.js";
import type { BrowserSession } from "./browser/browser-manager.js";
import type { BrowserSessionHealthTarget } from "./browser/session-health.js";
import type { CareerEventMap } from "./orchestrator/events.js";
import type { PersistedScheduledTaskRunUpdate } from "./orchestrator/scheduled-task-persistence.js";

describe("sidecar runtime", () => {
  it("registers and runs the session-health workflow with browser session dependencies", async () => {
    const checkedAt = new Date("2026-05-28T10:00:00Z");
    const openedPlatforms: string[] = [];
    const closedPlatforms: string[] = [];
    const healthyEvents: Array<CareerEventMap["browser.session.healthy"]> = [];
    const targets: BrowserSessionHealthTarget[] = [
      { platform: "LinkedIn", isEnabled: true },
      { platform: "Wellfound", isEnabled: false },
    ];

    const runtime = createSidecarRuntime({
      browserSessionHealth: {
        targets,
        openSession: async (platform): Promise<BrowserSession> => {
          openedPlatforms.push(platform);
          return {
            close: async () => {
              closedPlatforms.push(platform);
            },
          };
        },
        validateSession: async (target) => ({
          ok: true,
          message: `${target.platform} session is usable`,
        }),
      },
      now: () => checkedAt,
    });

    runtime.eventBus.on("browser.session.healthy", (event) => healthyEvents.push(event));

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("session-health");
    await expect(runtime.workflowEngine.run("session-health")).resolves.toEqual({
      checked: 1,
      healthy: 1,
      unhealthy: 0,
      skipped: 1,
      results: [
        {
          platform: "LinkedIn",
          ok: true,
          message: "LinkedIn session is usable",
        },
      ],
    });

    expect(openedPlatforms).toEqual(["LinkedIn"]);
    expect(closedPlatforms).toEqual(["LinkedIn"]);
    expect(healthyEvents).toEqual([
      {
        platform: "LinkedIn",
        checkedAt,
        message: "LinkedIn session is usable",
      },
    ]);
  });

  it("runs due persisted scheduled tasks through registered runtime workflows", async () => {
    const checkedAt = new Date("2026-05-28T10:00:00Z");
    const openedPlatforms: string[] = [];
    const updates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      browserSessionHealth: {
        targets: [{ platform: "LinkedIn", isEnabled: true }],
        openSession: async (platform): Promise<BrowserSession> => {
          openedPlatforms.push(platform);
          return { close: async () => {} };
        },
      },
      now: () => checkedAt,
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "session-health-task",
            name: "Session Health",
            type: "session_health",
            cron_expression: "0 */2 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-28T10:00:00.000Z",
            config: {
              cadence: { kind: "interval", minutes: 120 },
            },
            created_at: "2026-05-28T08:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          updates.push({ id, update });
        },
      },
    });

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(openedPlatforms).toEqual(["LinkedIn"]);
    expect(updates).toEqual([
      {
        id: "session-health-task",
        update: {
          last_run: "2026-05-28T10:00:00.000Z",
          next_run: "2026-05-28T12:00:00.000Z",
        },
      },
    ]);
  });
});
