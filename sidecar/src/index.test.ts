import { describe, expect, it } from "vitest";
import { createSidecarRuntime } from "./index.js";
import type { BrowserSession } from "./browser/browser-manager.js";
import type { BrowserSessionHealthTarget } from "./browser/session-health.js";
import type { CareerEventMap } from "./orchestrator/events.js";

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
});
