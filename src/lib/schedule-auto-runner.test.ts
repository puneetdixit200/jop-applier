import { describe, expect, it } from "vitest";
import { createScheduleAutoRunner } from "./schedule-auto-runner";
import type { ScheduleControlResult } from "./schedule-control";

describe("schedule auto runner", () => {
  it("does not start polling outside the desktop runtime", async () => {
    const intervals: number[] = [];
    const runner = createScheduleAutoRunner(
      {
        isDesktopRuntime: () => false,
        runScheduleControl: async () => {
          throw new Error("should not run in browser preview");
        },
        onResult: () => {
          throw new Error("should not report in browser preview");
        },
        setInterval: (_callback, milliseconds) => {
          intervals.push(milliseconds);
          return "timer";
        },
        clearInterval: () => undefined,
      },
      { pollIntervalMs: 60_000, runOnStart: true },
    );

    runner.start();
    await flushPromises();

    expect(runner.isRunning()).toBe(false);
    expect(intervals).toEqual([]);
  });

  it("runs on start, polls on interval, and clears the timer on stop", async () => {
    const callbacks: Array<() => void> = [];
    const clearedHandles: string[] = [];
    const results: ScheduleControlResult[] = [];
    let runCount = 0;
    const runner = createScheduleAutoRunner(
      {
        isDesktopRuntime: () => true,
        runScheduleControl: async () => {
          runCount += 1;
          return { workflowStatus: `run-${runCount}` };
        },
        onResult: (result) => results.push(result),
        setInterval: (callback, milliseconds) => {
          expect(milliseconds).toBe(45_000);
          callbacks.push(callback);
          return "timer-1";
        },
        clearInterval: (handle) => {
          clearedHandles.push(String(handle));
        },
      },
      { pollIntervalMs: 45_000, runOnStart: true },
    );

    runner.start();
    await flushPromises();
    callbacks[0]();
    await flushPromises();
    runner.stop();

    expect(runner.isRunning()).toBe(false);
    expect(runCount).toBe(2);
    expect(results).toEqual([{ workflowStatus: "run-1" }, { workflowStatus: "run-2" }]);
    expect(clearedHandles).toEqual(["timer-1"]);
  });

  it("skips interval ticks while a previous schedule run is still active", async () => {
    const callbacks: Array<() => void> = [];
    const inFlight = deferred<ScheduleControlResult>();
    let runCount = 0;
    const runner = createScheduleAutoRunner(
      {
        isDesktopRuntime: () => true,
        runScheduleControl: async () => {
          runCount += 1;
          if (runCount === 1) {
            return inFlight.promise;
          }
          return { workflowStatus: `run-${runCount}` };
        },
        onResult: () => undefined,
        setInterval: (callback) => {
          callbacks.push(callback);
          return "timer-1";
        },
        clearInterval: () => undefined,
      },
      { pollIntervalMs: 60_000, runOnStart: true },
    );

    runner.start();
    await flushPromises();
    callbacks[0]();
    await flushPromises();

    expect(runCount).toBe(1);

    inFlight.resolve({ workflowStatus: "run-1" });
    await flushPromises();
    callbacks[0]();
    await flushPromises();

    expect(runCount).toBe(2);
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}
