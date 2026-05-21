import type { ScheduleControlResult } from "./schedule-control";

export type ScheduleTimerHandle = unknown;

export type ScheduleAutoRunnerDependencies = {
  isDesktopRuntime: () => boolean;
  runScheduleControl: () => Promise<ScheduleControlResult>;
  onResult: (result: ScheduleControlResult) => void;
  onError?: (error: unknown) => void;
  setInterval?: (callback: () => void, milliseconds: number) => ScheduleTimerHandle;
  clearInterval?: (handle: ScheduleTimerHandle) => void;
};

export type ScheduleAutoRunnerOptions = {
  pollIntervalMs: number;
  runOnStart?: boolean;
};

export type ScheduleAutoRunner = {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
};

export function createScheduleAutoRunner(
  dependencies: ScheduleAutoRunnerDependencies,
  options: ScheduleAutoRunnerOptions,
): ScheduleAutoRunner {
  const setTimer = dependencies.setInterval ?? ((callback, milliseconds) => window.setInterval(callback, milliseconds));
  const clearTimer = dependencies.clearInterval ?? ((handle) => window.clearInterval(handle as number));
  let intervalHandle: ScheduleTimerHandle | null = null;
  let tickInProgress = false;

  async function tick() {
    if (intervalHandle === null || tickInProgress) {
      return;
    }

    tickInProgress = true;
    try {
      dependencies.onResult(await dependencies.runScheduleControl());
    } catch (error) {
      dependencies.onError?.(error);
    } finally {
      tickInProgress = false;
    }
  }

  return {
    start() {
      if (!dependencies.isDesktopRuntime() || intervalHandle !== null) {
        return;
      }

      intervalHandle = setTimer(() => {
        void tick();
      }, options.pollIntervalMs);

      if (options.runOnStart === true) {
        void tick();
      }
    },
    stop() {
      if (intervalHandle === null) {
        return;
      }

      clearTimer(intervalHandle);
      intervalHandle = null;
    },
    isRunning() {
      return intervalHandle !== null;
    },
  };
}
