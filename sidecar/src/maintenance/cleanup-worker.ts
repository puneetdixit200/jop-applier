import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type CleanupWorkerDependencies = {
  purgeExpiredAiCache: (now: Date) => Promise<{ deleted: number }>;
  archiveOldJobs: (cutoff: Date) => Promise<{ archived: number }>;
};

export type CleanupWorkerOptions = {
  now: Date;
  archiveJobsOlderThanDays?: number;
  eventBus?: EventBus<CareerEventMap>;
};

export type CleanupWorkerResult = {
  expiredAiCacheDeleted: number;
  archivedJobs: number;
  archiveCutoff: string;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runCleanupWorker(
  dependencies: CleanupWorkerDependencies,
  options: CleanupWorkerOptions,
): Promise<CleanupWorkerResult> {
  const archiveCutoff = new Date(
    options.now.getTime() - (options.archiveJobsOlderThanDays ?? 30) * MILLISECONDS_PER_DAY,
  );
  const [cache, jobs] = await Promise.all([
    dependencies.purgeExpiredAiCache(options.now),
    dependencies.archiveOldJobs(archiveCutoff),
  ]);
  const result = {
    expiredAiCacheDeleted: cache.deleted,
    archivedJobs: jobs.archived,
    archiveCutoff: archiveCutoff.toISOString(),
  };

  options.eventBus?.emit("cleanup.completed", {
    completedAt: options.now,
    ...result,
  });

  return result;
}
