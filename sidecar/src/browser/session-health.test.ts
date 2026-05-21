import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { runBrowserSessionHealthCheck, type BrowserSessionHealthTarget } from "./session-health.js";

describe("browser session health", () => {
  it("checks enabled browser sessions, skips disabled targets, emits events, and closes opened sessions", async () => {
    const openedPlatforms: string[] = [];
    const closedPlatforms: string[] = [];
    const healthyEvents: Array<CareerEventMap["browser.session.healthy"]> = [];
    const unhealthyEvents: Array<CareerEventMap["browser.session.unhealthy"]> = [];
    const checkedAt = new Date("2026-05-28T08:00:00Z");
    const targets: BrowserSessionHealthTarget[] = [
      { platform: "LinkedIn", isEnabled: true },
      { platform: "Indeed", isEnabled: true },
      { platform: "Wellfound", isEnabled: false },
    ];
    const eventBus = new EventBus<CareerEventMap>();

    eventBus.on("browser.session.healthy", (event) => healthyEvents.push(event));
    eventBus.on("browser.session.unhealthy", (event) => unhealthyEvents.push(event));

    const result = await runBrowserSessionHealthCheck(
      {
        openSession: async (platform) => {
          openedPlatforms.push(platform);
          if (platform === "Indeed") {
            throw new Error("stored session expired");
          }

          return {
            close: async () => {
              closedPlatforms.push(platform);
            },
          };
        },
        validateSession: async (target) => ({
          ok: true,
          message: `${target.platform} session is ready`,
        }),
      },
      {
        checkedAt,
        eventBus,
        targets,
      },
    );

    expect(result).toEqual({
      checked: 2,
      healthy: 1,
      unhealthy: 1,
      skipped: 1,
      results: [
        {
          platform: "LinkedIn",
          ok: true,
          message: "LinkedIn session is ready",
        },
        {
          platform: "Indeed",
          ok: false,
          message: "stored session expired",
        },
      ],
    });
    expect(openedPlatforms).toEqual(["LinkedIn", "Indeed"]);
    expect(closedPlatforms).toEqual(["LinkedIn"]);
    expect(healthyEvents).toEqual([
      {
        platform: "LinkedIn",
        checkedAt,
        message: "LinkedIn session is ready",
      },
    ]);
    expect(unhealthyEvents).toEqual([
      {
        platform: "Indeed",
        checkedAt,
        reason: "stored session expired",
      },
    ]);
  });
});
