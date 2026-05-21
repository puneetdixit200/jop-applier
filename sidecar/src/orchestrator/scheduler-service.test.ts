import { describe, expect, it } from "vitest";
import { createSchedulerService } from "./scheduler-service.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

describe("scheduler service", () => {
  it("starts a polling loop, avoids overlapping runs, and clears the interval on stop", async () => {
    const firstRun = deferred();
    const runTimes: string[] = [];
    const clearedHandles: string[] = [];
    let firstRunPending = true;
    let intervalCallback: (() => void) | undefined;
    let currentTime = new Date("2026-05-27T09:00:00Z");

    const service = createSchedulerService(
      {
        runDueTasks: async (now) => {
          runTimes.push(now.toISOString());
          if (firstRunPending) {
            firstRunPending = false;
            await firstRun.promise;
          }
        },
        now: () => currentTime,
        setInterval: (callback, milliseconds) => {
          intervalCallback = callback;
          expect(milliseconds).toBe(60_000);
          return "scheduler-interval";
        },
        clearInterval: (handle) => {
          clearedHandles.push(String(handle));
        },
      },
      { pollIntervalMs: 60_000, runOnStart: true },
    );

    service.start();
    await Promise.resolve();

    expect(service.isRunning()).toBe(true);
    expect(runTimes).toEqual(["2026-05-27T09:00:00.000Z"]);

    currentTime = new Date("2026-05-27T09:01:00Z");
    intervalCallback?.();
    await Promise.resolve();

    expect(runTimes).toEqual(["2026-05-27T09:00:00.000Z"]);

    firstRun.resolve();
    await Promise.resolve();
    await Promise.resolve();

    intervalCallback?.();
    await Promise.resolve();

    expect(runTimes).toEqual(["2026-05-27T09:00:00.000Z", "2026-05-27T09:01:00.000Z"]);

    service.stop();

    expect(service.isRunning()).toBe(false);
    expect(clearedHandles).toEqual(["scheduler-interval"]);
  });
});
