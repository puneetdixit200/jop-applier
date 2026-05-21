import { describe, expect, it } from "vitest";
import { createSidecarRuntime } from "./index.js";
import type { BrowserSession } from "./browser/browser-manager.js";
import type { BrowserSessionHealthTarget } from "./browser/session-health.js";
import type { SearchQuery } from "./discovery/connectors/connector-interface.js";
import type { UpsertJobPayload } from "./discovery/job-persistence.js";
import type { CareerEventMap } from "./orchestrator/events.js";
import type { PersistedScheduledTaskRunUpdate } from "./orchestrator/scheduled-task-persistence.js";

function discoveredJob(overrides: Partial<UpsertJobPayload>): UpsertJobPayload {
  return {
    source_id: null,
    platform: "linkedin",
    url: "https://jobs.example/job",
    title: "Frontend Engineer",
    company_name: "Northstar Labs",
    location: "Remote",
    is_remote: true,
    salary_min: null,
    salary_max: null,
    salary_currency: "INR",
    job_type: null,
    experience_level: null,
    description: null,
    requirements: [],
    raw_html: null,
    match_score: null,
    match_confidence: null,
    match_reasoning: null,
    matched_skills: [],
    missing_skills: [],
    ai_tags: [],
    should_apply: null,
    ai_priority: null,
    ...overrides,
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });

  return { promise, resolve };
}

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

  it("exposes a scheduler service that polls due scheduled tasks", async () => {
    const checkedAt = new Date("2026-05-28T10:00:00Z");
    const updates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const updateRecorded = deferred();
    const clearedHandles: string[] = [];
    let intervalCallback: (() => void) | undefined;
    const runtime = createSidecarRuntime({
      browserSessionHealth: {
        targets: [{ platform: "LinkedIn", isEnabled: true }],
        openSession: async (): Promise<BrowserSession> => ({ close: async () => {} }),
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
          updateRecorded.resolve();
        },
      },
      scheduler: {
        pollIntervalMs: 120_000,
        runOnStart: true,
        setInterval: (callback, milliseconds) => {
          intervalCallback = callback;
          expect(milliseconds).toBe(120_000);
          return "runtime-scheduler";
        },
        clearInterval: (handle) => {
          clearedHandles.push(String(handle));
        },
      },
    });

    runtime.schedulerService.start();
    await updateRecorded.promise;

    expect(runtime.schedulerService.isRunning()).toBe(true);
    expect(intervalCallback).toBeDefined();
    expect(updates).toEqual([
      {
        id: "session-health-task",
        update: {
          last_run: "2026-05-28T10:00:00.000Z",
          next_run: "2026-05-28T12:00:00.000Z",
        },
      },
    ]);

    runtime.schedulerService.stop();

    expect(runtime.schedulerService.isRunning()).toBe(false);
    expect(clearedHandles).toEqual(["runtime-scheduler"]);
  });

  it("runs due discovery scheduled tasks through the job-discovery workflow", async () => {
    const checkedAt = new Date("2026-05-28T08:00:00Z");
    const queries: SearchQuery[] = [{ keywords: ["react"], remote: true }];
    const searchedQueries: SearchQuery[] = [];
    const persistedUrls: string[] = [];
    const discoveredEvents: Array<CareerEventMap["job.discovered"]> = [];
    const updates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      jobDiscovery: {
        searchQueries: queries,
        searchForPersistence: async (query) => {
          searchedQueries.push(query);
          return [
            discoveredJob({
              url: "https://jobs.example/react",
              title: "React Engineer",
              company_name: "Northstar Labs",
            }),
          ];
        },
        upsertJobs: async (jobs) => {
          persistedUrls.push(...jobs.map((job) => job.url));
          return jobs.map((job) => ({
            id: "job-1",
            platform: job.platform,
            title: job.title,
            company_name: job.company_name,
          }));
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "discovery-task",
            name: "Job Discovery",
            type: "discovery",
            cron_expression: "0 8-20/4 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-28T08:00:00.000Z",
            config: {
              cadence: {
                kind: "windowed_interval",
                everyHours: 4,
                startHour: 8,
                endHour: 20,
                minute: 0,
              },
            },
            created_at: "2026-05-28T07:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          updates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("job.discovered", (event) => discoveredEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("job-discovery");
    expect(searchedQueries).toEqual(queries);
    expect(persistedUrls).toEqual(["https://jobs.example/react"]);
    expect(discoveredEvents).toEqual([
      {
        jobId: "job-1",
        platform: "linkedin",
        title: "React Engineer",
        companyName: "Northstar Labs",
      },
    ]);
    expect(updates).toEqual([
      {
        id: "discovery-task",
        update: {
          last_run: "2026-05-28T08:00:00.000Z",
          next_run: "2026-05-28T12:00:00.000Z",
        },
      },
    ]);
  });
});
