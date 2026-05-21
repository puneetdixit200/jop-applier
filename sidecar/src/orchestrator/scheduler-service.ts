export type SchedulerTimerHandle = unknown;

export type SchedulerServiceDependencies = {
  runDueTasks: (now: Date) => Promise<unknown>;
  now?: () => Date;
  setInterval?: (callback: () => void, milliseconds: number) => SchedulerTimerHandle;
  clearInterval?: (handle: SchedulerTimerHandle) => void;
  onError?: (error: unknown) => void;
};

export type SchedulerServiceOptions = {
  pollIntervalMs: number;
  runOnStart?: boolean;
};

export type SchedulerService = {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
};

export function createSchedulerService(
  dependencies: SchedulerServiceDependencies,
  options: SchedulerServiceOptions,
): SchedulerService {
  const now = dependencies.now ?? (() => new Date());
  const setTimer = dependencies.setInterval ?? ((callback, milliseconds) => setInterval(callback, milliseconds));
  const clearTimer =
    dependencies.clearInterval ??
    ((handle) => {
      clearInterval(handle as ReturnType<typeof setInterval>);
    });

  let intervalHandle: SchedulerTimerHandle | null = null;
  let tickInProgress = false;

  async function tick(): Promise<void> {
    if (intervalHandle === null || tickInProgress) {
      return;
    }

    tickInProgress = true;
    try {
      await dependencies.runDueTasks(now());
    } catch (error) {
      dependencies.onError?.(error);
    } finally {
      tickInProgress = false;
    }
  }

  return {
    start() {
      if (intervalHandle !== null) {
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
