import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAIEngineFromEnv, createSidecarRuntime } from "./index.js";
import type { BrowserSession } from "./browser/browser-manager.js";
import type { BrowserSessionHealthTarget } from "./browser/session-health.js";
import type { FollowUpApplication, FollowUpUpdate } from "./applications/follow-up-scheduler.js";
import type { SearchQuery } from "./discovery/connectors/connector-interface.js";
import type { UpsertJobPayload } from "./discovery/job-persistence.js";
import type {
  NotificationAdapter,
  NotificationChannel,
  NotificationDelivery,
} from "./notifications/notification-manager.js";
import type { Plugin } from "./plugins/plugin-manager.js";
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

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

describe("sidecar runtime", () => {
  it("wires configured Anthropic and Groq providers into the AI engine", () => {
    const engine = createAIEngineFromEnv({
      OLLAMA_BASE_URL: "http://localhost:11434",
      OLLAMA_MODEL: "mistral:7b-instruct",
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_MODEL: "claude-3-5-haiku-latest",
      GROQ_API_KEY: "groq-key",
      GROQ_MODEL: "llama-3.1-8b-instant",
    } as NodeJS.ProcessEnv);

    engine.switchProvider("anthropic");
    expect(engine.activeProvider()).toEqual({
      provider: "anthropic",
      model: "claude-3-5-haiku-latest",
      local: false,
    });
    engine.switchProvider("groq");
    expect(engine.activeProvider()).toEqual({
      provider: "groq",
      model: "llama-3.1-8b-instant",
      local: false,
    });
  });

  it("persists runtime event logs when configured", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "careercaveman-runtime-log-"));

    try {
      const runtime = createSidecarRuntime({
        now: () => new Date("2026-05-28T10:15:00.000Z"),
        logging: { logDir },
      });

      await runtime.workflowEngine.run("cleanup");
      await runtime.flushLogs();
      await runtime.closeLogs();

      const jsonl = await readFile(join(logDir, "events-2026-05-28.jsonl"), "utf8");
      const events = jsonl.trim().split("\n").map((line) => JSON.parse(line));

      expect(events.map((event) => event.event)).toEqual([
        "workflow.started",
        "cleanup.completed",
        "workflow.completed",
      ]);
      expect(events[0]).toMatchObject({
        timestamp: "2026-05-28T10:15:00.000Z",
        event: "workflow.started",
        payload: { workflowId: "cleanup" },
      });
      expect(events[1]).toMatchObject({
        event: "cleanup.completed",
        payload: {
          completedAt: "2026-05-28T10:15:00.000Z",
          expiredAiCacheDeleted: 0,
          archivedJobs: 0,
        },
      });
      expect(events[2]).toMatchObject({
        event: "workflow.completed",
        payload: {
          workflowId: "cleanup",
          status: "completed",
        },
      });
    } finally {
      await rm(logDir, { recursive: true, force: true });
    }
  });

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
            newPage: async () => {
              throw new Error("not used in this test");
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
          return fakeBrowserSession();
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
        openSession: async (): Promise<BrowserSession> => fakeBrowserSession(),
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

  it("runs configured ATS sources through the job-discovery workflow", async () => {
    const originalFetch = globalThis.fetch;
    const requestedUrls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      const requestUrl = String(url);
      requestedUrls.push(requestUrl);

      if (requestUrl.includes("boards-api.greenhouse.io")) {
        return jsonResponse({
          jobs: [
            {
              id: "gh-101",
              title: "React Platform Engineer",
              absolute_url: "https://boards.greenhouse.io/northstar/jobs/101",
              location: { name: "Remote" },
              content: "<p>Build React workflow tools.</p><ul><li>React</li></ul>",
              updated_at: "2026-05-20T10:00:00Z",
            },
          ],
        });
      }

      if (requestUrl.includes("api.lever.co")) {
        return jsonResponse([
          {
            id: "lever-202",
            text: "React Integrations Engineer",
            hostedUrl: "https://jobs.lever.co/atlas/202",
            categories: {
              location: "Remote - Bengaluru",
              commitment: "Full-time",
              team: "Integrations",
            },
            descriptionPlain: "Build React integrations.",
            lists: [{ content: "<ul><li>React</li><li>Node.js</li></ul>" }],
            createdAt: Date.parse("2026-05-21T10:00:00Z"),
          },
        ]);
      }

      if (requestUrl.includes("wd1.myworkdayjobs.com")) {
        return jsonResponse({
          jobPostings: [
            {
              id: "wd-303",
              title: "React Workday Engineer",
              externalPath: "/en-US/careers/job/Remote/React-Workday-Engineer_JR-303",
              locationsText: "Remote",
              jobDescription: "<p>Build React Workday tools.</p><ul><li>React</li></ul>",
              postedOn: "2026-05-22T10:00:00Z",
              timeType: "Full time",
            },
          ],
        });
      }

      throw new Error(`unexpected fetch: ${requestUrl}`);
    }) as typeof fetch;

    try {
      const runtime = createSidecarRuntime();

      await expect(
        runtime.workflowEngine.run("job-discovery", {
          discovery: {
            searchQueries: [{ keywords: ["React"], remote: true }],
            atsSources: [
              { type: "greenhouse", boardToken: "northstar" },
              { type: "lever", company: "atlas" },
              {
                type: "workday",
                tenant: "northstar",
                site: "careers",
                baseUrl: "https://northstar.wd1.myworkdayjobs.com",
              },
            ],
          },
        }),
      ).resolves.toMatchObject({
        queries: 1,
        discovered: 3,
        stored: 0,
        jobs: [
          {
            source_id: "gh-101",
            platform: "greenhouse",
            url: "https://boards.greenhouse.io/northstar/jobs/101",
            title: "React Platform Engineer",
            company_name: "northstar",
            is_remote: true,
            requirements: ["React"],
          },
          {
            source_id: "lever-202",
            platform: "lever",
            url: "https://jobs.lever.co/atlas/202",
            title: "React Integrations Engineer",
            company_name: "atlas",
            is_remote: true,
            requirements: ["React", "Node.js"],
          },
          {
            source_id: "wd-303",
            platform: "workday",
            url: "https://northstar.wd1.myworkdayjobs.com/en-US/careers/job/Remote/React-Workday-Engineer_JR-303",
            title: "React Workday Engineer",
            company_name: "northstar",
            is_remote: true,
            requirements: ["React"],
          },
        ],
      });
      expect(requestedUrls).toEqual([
        "https://boards-api.greenhouse.io/v1/boards/northstar/jobs?content=true",
        "https://api.lever.co/v0/postings/atlas?mode=json",
        "https://northstar.wd1.myworkdayjobs.com/wday/cxs/northstar/careers/jobs",
        "https://boards-api.greenhouse.io/v1/boards/northstar/jobs?content=true",
        "https://api.lever.co/v0/postings/atlas?mode=json",
        "https://northstar.wd1.myworkdayjobs.com/wday/cxs/northstar/careers/jobs",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs configured career page sources through the job-discovery workflow", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl === "https://northstar.example/careers") {
        return new Response(`
          <script type="application/ld+json">
            {
              "@type": "JobPosting",
              "identifier": "react-intern",
              "title": "React Intern",
              "url": "/jobs/react-intern",
              "jobLocationType": "TELECOMMUTE",
              "description": "React internship"
            }
          </script>
        `);
      }
      if (requestUrl === "https://northstar.example/jobs/react-intern") {
        return new Response("<main><p>React internship</p><ul><li>React</li></ul></main>");
      }

      throw new Error(`unexpected fetch: ${requestUrl}`);
    }) as typeof fetch;

    try {
      const runtime = createSidecarRuntime();

      await expect(
        runtime.workflowEngine.run("job-discovery", {
          discovery: {
            searchQueries: [{ keywords: ["React"], remote: true }],
            careerPageSources: [
              {
                id: "northstar-careers",
                company: "Northstar Labs",
                url: "https://northstar.example/careers",
              },
            ],
          },
        }),
      ).resolves.toMatchObject({
        queries: 1,
        discovered: 1,
        jobs: [
          {
            source_id: "northstar-careers:react-intern",
            platform: "company-career-page",
            url: "https://northstar.example/jobs/react-intern",
            title: "React Intern",
            company_name: "Northstar Labs",
            is_remote: true,
            requirements: ["React"],
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("runs due follow-up scheduled tasks through the follow-up workflow", async () => {
    const checkedAt = new Date("2026-05-28T09:00:00Z");
    const dueApplication: FollowUpApplication = {
      id: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      status: "submitted",
      submittedAt: "2026-05-20T10:00:00Z",
      nextFollowUp: "2026-05-28T08:00:00Z",
      lastFollowUp: null,
      followUpCount: 0,
      responseDate: null,
      responseType: null,
    };
    const sentApplications: string[] = [];
    const followUpUpdates: Array<{ applicationId: string; update: FollowUpUpdate }> = [];
    const sentEvents: Array<CareerEventMap["follow_up.sent"]> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      followUps: {
        followUpDelaysDays: [3, 7, 14],
        maxFollowUps: 3,
        listApplications: async () => [dueApplication],
        sendFollowUp: async (application) => {
          sentApplications.push(application.id);
          return { communicationId: `comm-${application.id}` };
        },
        updateApplicationFollowUp: async (applicationId, update) => {
          followUpUpdates.push({ applicationId, update });
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "follow-up-task",
            name: "Follow-up Check",
            type: "follow_up",
            cron_expression: "0 9 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-28T09:00:00.000Z",
            config: {
              cadence: { kind: "daily", hour: 9, minute: 0 },
            },
            created_at: "2026-05-28T08:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("follow_up.sent", (event) => sentEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("follow-up-check");
    expect(sentApplications).toEqual(["app-1"]);
    expect(followUpUpdates).toEqual([
      {
        applicationId: "app-1",
        update: {
          status: "follow_up_sent",
          followUpCount: 1,
          lastFollowUp: "2026-05-28T09:00:00.000Z",
          nextFollowUp: "2026-06-04T09:00:00.000Z",
        },
      },
    ]);
    expect(sentEvents).toEqual([
      {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        status: "follow_up_sent",
        followUpCount: 1,
        nextFollowUp: "2026-06-04T09:00:00.000Z",
        communicationId: "comm-app-1",
        sentAt: checkedAt,
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "follow-up-task",
        update: {
          last_run: "2026-05-28T09:00:00.000Z",
          next_run: "2026-05-29T09:00:00.000Z",
        },
      },
    ]);
  });

  it("runs configured follow-up workflow through the SMTP adapter", async () => {
    const sentAt = new Date("2026-05-28T09:00:00Z");
    const senderConfigs: unknown[] = [];
    const sentEmails: unknown[] = [];
    const runtime = createSidecarRuntime({
      now: () => sentAt,
      emailAdapters: {
        createEmailSender: (config) => {
          senderConfigs.push(config);
          return {
            sendEmail: async (email) => {
              sentEmails.push(email);
              return { messageId: "smtp-follow-up-1" };
            },
          };
        },
      },
    });

    await expect(
      runtime.workflowEngine.run("follow-up-check", {
        followUp: {
          account: {
            provider: "gmail",
            fromName: "Asha Rao",
            fromEmail: "asha@gmail.example",
            smtpHost: "smtp.gmail.com",
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: "asha@gmail.example",
            smtpPass: "app-password",
            imapHost: "imap.gmail.com",
            imapPort: 993,
            imapSecure: true,
            imapUser: "asha@gmail.example",
            imapPass: "app-password",
            signature: "Asha",
          },
          applications: [
            {
              id: "app-1",
              jobId: "job-1",
              jobTitle: "Frontend Engineer Intern",
              companyName: "Northstar Labs",
              status: "submitted",
              submittedAt: "2026-05-20T10:00:00Z",
              nextFollowUp: "2026-05-28T08:00:00Z",
              lastFollowUp: null,
              followUpCount: 0,
              responseDate: null,
              responseType: null,
              contactId: "contact-1",
              contactName: "Mira Recruiter",
              contactEmail: "mira@northstar.example",
            },
          ],
        },
      }),
    ).resolves.toMatchObject({
      scanned: 1,
      due: 1,
      sent: 1,
      failed: 0,
      ghosted: 0,
      followUps: [
        {
          applicationId: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          contactId: "contact-1",
          contactName: "Mira Recruiter",
          contactEmail: "mira@northstar.example",
          communicationId: null,
          emailId: "smtp-follow-up-1",
          subject: "Following up on Frontend Engineer Intern at Northstar Labs",
          body: "Hi Mira Recruiter,\n\nI wanted to follow up on my application for the Frontend Engineer Intern role at Northstar Labs.\n\nThank you.",
          sentAt: "2026-05-28T09:00:00.000Z",
          status: "follow_up_sent",
          followUpCount: 1,
          nextFollowUp: "2026-06-04T09:00:00.000Z",
        },
      ],
    });
    expect(senderConfigs).toEqual([
      {
        provider: "gmail",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.example",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.example",
        smtpPass: "app-password",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.example",
        imapPass: "app-password",
        signature: "Asha",
      },
    ]);
    expect(sentEmails).toEqual([
      {
        to: "mira@northstar.example",
        subject: "Following up on Frontend Engineer Intern at Northstar Labs",
        body: "Hi Mira Recruiter,\n\nI wanted to follow up on my application for the Frontend Engineer Intern role at Northstar Labs.\n\nThank you.",
      },
    ]);
  });

  it("runs due application processing scheduled tasks through the application workflow", async () => {
    const checkedAt = new Date("2026-05-28T09:30:00Z");
    const applicationUpdates: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
    const applicationSteps: string[] = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      applicationProcessing: {
        reviewBeforeSubmit: true,
        listApplications: async () => [
          {
            id: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            status: "queued",
            mode: "semi_auto",
            resumePath: null,
            coverLetterPath: null,
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        prepareApplication: async (application) => {
          applicationSteps.push(`prepare:${application.id}`);
        },
        generateResume: async (application) => {
          applicationSteps.push(`resume:${application.id}`);
          return { resumePath: `/tmp/${application.id}-resume.pdf` };
        },
        generateCoverLetter: async (application) => {
          applicationSteps.push(`cover:${application.id}`);
          return { coverLetterPath: `/tmp/${application.id}-cover-letter.pdf` };
        },
        fillApplicationForm: async (application) => {
          applicationSteps.push(`fill:${application.id}`);
          return { submissionUrl: `https://ats.example/${application.id}/review` };
        },
        submitApplication: async (application) => {
          applicationSteps.push(`submit:${application.id}`);
          return { confirmationId: `confirmation-${application.id}` };
        },
        updateApplication: async (applicationId, update) => {
          applicationUpdates.push({ applicationId, update });
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "application-processing-task",
            name: "Application Processing",
            type: "apply",
            cron_expression: "*/30 * * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-28T09:30:00.000Z",
            config: {
              cadence: { kind: "interval", minutes: 30 },
            },
            created_at: "2026-05-28T09:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
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

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("application-processing");
    expect(applicationSteps).toEqual(["prepare:app-1", "resume:app-1", "cover:app-1", "fill:app-1"]);
    expect(applicationUpdates).toEqual([
      { applicationId: "app-1", update: { status: "preparing" } },
      {
        applicationId: "app-1",
        update: { status: "resume_generated", resumePath: "/tmp/app-1-resume.pdf" },
      },
      {
        applicationId: "app-1",
        update: {
          status: "cover_letter_generated",
          coverLetterPath: "/tmp/app-1-cover-letter.pdf",
        },
      },
      { applicationId: "app-1", update: { status: "form_filling" } },
      {
        applicationId: "app-1",
        update: {
          status: "review_pending",
          submissionUrl: "https://ats.example/app-1/review",
        },
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "application-processing-task",
        update: {
          last_run: "2026-05-28T09:30:00.000Z",
          next_run: "2026-05-28T10:00:00.000Z",
        },
      },
    ]);
  });

  it("wires submission verification into full-auto application processing", async () => {
    const checkedAt = new Date("2026-05-28T11:00:00Z");
    const verifiedSubmissions: string[] = [];
    const applicationUpdates: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      applicationProcessing: {
        reviewBeforeSubmit: false,
        listApplications: async () => [
          {
            id: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            status: "queued",
            mode: "full_auto",
            resumePath: null,
            coverLetterPath: null,
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        prepareApplication: async () => undefined,
        generateResume: async () => ({ resumePath: "/tmp/app-1-resume.pdf" }),
        generateCoverLetter: async () => ({ coverLetterPath: "/tmp/app-1-cover-letter.pdf" }),
        fillApplicationForm: async () => ({
          submissionUrl: "https://ats.example/app-1/submit",
          requiredMissing: [],
        }),
        submitApplication: async () => ({
          confirmationId: null,
          receiptText: "Thanks for applying. Confirmation CONF-42",
        }),
        verifySubmission: async (application, submission) => {
          verifiedSubmissions.push(`${application.id}:${submission.receiptText}`);

          return {
            ok: true,
            confirmationId: "CONF-42",
            message: "confirmation receipt detected",
          };
        },
        updateApplication: async (applicationId, update) => {
          applicationUpdates.push({ applicationId, update });
        },
      },
    });

    await expect(runtime.workflowEngine.run("application-processing")).resolves.toMatchObject({
      processed: 1,
      failed: 0,
      submitted: 1,
    });

    expect(verifiedSubmissions).toEqual(["app-1:Thanks for applying. Confirmation CONF-42"]);
    expect(applicationUpdates.at(-1)).toEqual({
      applicationId: "app-1",
      update: {
        status: "submitted",
        confirmationId: "CONF-42",
        submittedAt: "2026-05-28T11:00:00.000Z",
        errorMessage: null,
      },
    });
  });

  it("routes approved application reviews through configured submission dependencies", async () => {
    const checkedAt = new Date("2026-05-28T12:15:00Z");
    const applicationUpdates: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
    const submittedApplications: string[] = [];
    const submittedEvents: Array<CareerEventMap["application.submitted"]> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      applicationProcessing: {
        listApplications: async () => [],
        prepareApplication: async () => undefined,
        fillApplicationForm: async () => ({ submissionUrl: null }),
        submitApplication: async (application) => {
          submittedApplications.push(`${application.id}:${application.status}`);
          return {
            confirmationId: null,
            receiptText: "Thanks for applying. Confirmation CONF-84",
          };
        },
        verifySubmission: async (application, submission) => ({
          ok: true,
          confirmationId: `${application.id}:${submission.receiptText?.match(/CONF-\d+/)?.[0]}`,
          message: "confirmation receipt detected",
        }),
        updateApplication: async (applicationId, update) => {
          applicationUpdates.push({ applicationId, update });
        },
      },
    });

    runtime.eventBus.on("application.submitted", (event) => submittedEvents.push(event));

    await expect(
      runtime.reviewApplication(
        {
          id: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          status: "review_pending",
          mode: "semi_auto",
          resumePath: "/tmp/app-1-resume.pdf",
          coverLetterPath: "/tmp/app-1-cover-letter.pdf",
          retryCount: 0,
          maxRetries: 3,
        },
        "approve",
      ),
    ).resolves.toEqual({
      status: "submitted",
      confirmationId: "app-1:CONF-84",
    });

    expect(submittedApplications).toEqual(["app-1:submitting"]);
    expect(applicationUpdates).toEqual([
      {
        applicationId: "app-1",
        update: {
          status: "submitting",
          errorMessage: null,
        },
      },
      {
        applicationId: "app-1",
        update: {
          status: "submitted",
          confirmationId: "app-1:CONF-84",
          submittedAt: "2026-05-28T12:15:00.000Z",
          errorMessage: null,
        },
      },
    ]);
    expect(submittedEvents).toEqual([
      {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        confirmationId: "app-1:CONF-84",
        submittedAt: checkedAt,
      },
    ]);
  });

  it("routes application failure events through configured notification adapters", async () => {
    const checkedAt = new Date("2026-05-28T12:45:00Z");
    const deliveries: NotificationDelivery[] = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      notifications: {
        adapters: [
          recordingNotificationAdapter("os", deliveries),
          recordingNotificationAdapter("in_app", deliveries),
        ],
      },
      applicationProcessing: {
        listApplications: async () => [],
        prepareApplication: async () => undefined,
        fillApplicationForm: async () => ({ submissionUrl: null }),
        submitApplication: async () => {
          throw new Error("captcha challenge");
        },
        updateApplication: async () => undefined,
      },
    });

    await expect(
      runtime.reviewApplication(
        {
          id: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          status: "review_pending",
          mode: "semi_auto",
          resumePath: "/tmp/app-1-resume.pdf",
          coverLetterPath: "/tmp/app-1-cover-letter.pdf",
          retryCount: 0,
          maxRetries: 3,
        },
        "approve",
      ),
    ).resolves.toEqual({
      status: "failed",
      reason: "captcha challenge",
    });
    await Promise.resolve();

    expect(deliveries.map((delivery) => delivery.channel)).toEqual(["os", "in_app"]);
    expect(deliveries.map((delivery) => ({
      type: delivery.type,
      priority: delivery.priority,
      title: delivery.title,
      body: delivery.body,
      metadata: delivery.metadata,
    }))).toEqual([
      {
        type: "application.failed",
        priority: "high",
        title: "Application failed",
        body: "Northstar Labs application failed: captcha challenge",
        metadata: {
          applicationId: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          status: "failed",
          reason: "captcha challenge",
        },
      },
      {
        type: "application.failed",
        priority: "high",
        title: "Application failed",
        body: "Northstar Labs application failed: captcha challenge",
        metadata: {
          applicationId: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          status: "failed",
          reason: "captcha challenge",
        },
      },
    ]);
  });

  it("adds Telegram notification delivery from runtime environment settings", async () => {
    const checkedAt = new Date("2026-05-29T09:30:00Z");
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    const runtime = createSidecarRuntime({
      env: {
        ...process.env,
        TELEGRAM_BOT_TOKEN: "telegram-token",
        TELEGRAM_CHAT_ID: "chat-1",
      },
      now: () => checkedAt,
    });

    try {
      runtime.eventBus.emit("response.received", {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        communicationId: "comm-1",
        responseType: "positive",
        subject: "Interview availability",
        receivedAt: checkedAt,
      });
      await flushNotifications();

      expect(requests).toHaveLength(1);
      expect(requests[0].url).toBe(
        "https://api.telegram.org/bottelegram-token/sendMessage",
      );
      expect(JSON.parse(String(requests[0].init?.body))).toMatchObject({
        chat_id: "chat-1",
        text: expect.stringContaining("Response received"),
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("exposes a plugin manager for registered sidecar plugins", async () => {
    const calls: string[] = [];
    const runtimePlugin: Plugin = {
      manifest: {
        name: "runtime-exporter",
        version: "1.0.0",
        type: "exporter",
        entry: "./dist/index.js",
        permissions: ["network"],
      },
      initialize: async (context) => {
        calls.push(`initialize:${context.env.CAREERCAVEMAN_PLUGIN_TEST}`);
      },
      destroy: async () => {
        calls.push("destroy");
      },
      healthCheck: async () => ({
        ok: true,
        message: "runtime exporter ready",
      }),
    };
    const runtime = createSidecarRuntime({
      env: {
        ...process.env,
        CAREERCAVEMAN_PLUGIN_TEST: "enabled",
      },
      plugins: [runtimePlugin],
    });

    await expect(runtime.pluginManager.initializeAll()).resolves.toEqual([
      {
        name: "runtime-exporter",
        status: "initialized",
      },
    ]);
    await expect(runtime.pluginManager.health()).resolves.toEqual({
      "runtime-exporter": {
        ok: true,
        message: "runtime exporter ready",
      },
    });

    await runtime.pluginManager.destroyAll();

    expect(calls).toEqual(["initialize:enabled", "destroy"]);
  });

  it("wires document generation into due application processing tasks", async () => {
    const checkedAt = new Date("2026-05-28T10:30:00Z");
    const outputDir = await mkdtemp(join(tmpdir(), "careercaveman-runtime-docs-"));
    const applicationUpdates: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const savedDocuments: Array<Record<string, unknown>> = [];
    const documentEvents: Array<CareerEventMap["document.generated"]> = [];
    const aiCalls: string[] = [];

    try {
      const runtime = createSidecarRuntime({
        now: () => checkedAt,
        applicationProcessing: {
          reviewBeforeSubmit: true,
          listApplications: async () => [
            {
              id: "app-1",
              jobId: "job-1",
              companyName: "Northstar Labs",
              status: "queued",
              mode: "semi_auto",
              resumePath: null,
              coverLetterPath: null,
              retryCount: 0,
              maxRetries: 3,
            },
          ],
          prepareApplication: async () => undefined,
          fillApplicationForm: async (application) => ({
            submissionUrl: `https://ats.example/${application.id}/review`,
          }),
          submitApplication: async (application) => ({
            confirmationId: `confirmation-${application.id}`,
          }),
          updateApplication: async (applicationId, update) => {
            applicationUpdates.push({ applicationId, update });
          },
        },
        applicationDocuments: {
          outputDir,
          ai: {
            activeProvider: () => ({ provider: "test-ai", model: "resume-model", local: true }),
            tailorResume: async (resume, job) => {
              aiCalls.push(`resume:${resume.fullName}:${job.title}`);
              return {
                summary: "React and Rust desktop automation engineer.",
                skills: ["React", "TypeScript", "Rust", "Tauri"],
                tailoringNotes: ["Focused the resume on local-first automation"],
              };
            },
            generateCoverLetter: async (profile, job) => {
              aiCalls.push(`cover:${profile.fullName}:${job.companyName}`);
              return "Dear Northstar Labs team,\n\nI am excited to apply.";
            },
          },
          loadContext: async (application) => ({
            applicationId: application.id,
            jobId: application.jobId,
            companyName: application.companyName,
            resumeVersion: 2,
            profile: {
              fullName: "Asha Rao",
              headline: "React and Tauri engineer",
              email: "asha@example.com",
              skills: ["React", "TypeScript"],
            },
            job: {
              title: "Desktop Automation Engineer",
              companyName: application.companyName,
              description: "Build Tauri and Rust automation.",
              requirements: ["React", "Rust", "Tauri"],
            },
          }),
          saveDocument: async (document) => {
            savedDocuments.push(document);
            return {
              id: `doc-${savedDocuments.length}`,
              ...document,
            };
          },
        },
        scheduledTasks: {
          listScheduledTasks: async () => [
            {
              id: "application-processing-task",
              name: "Application Processing",
              type: "apply",
              cron_expression: "*/30 * * * *",
              is_enabled: true,
              last_run: null,
              next_run: "2026-05-28T10:30:00.000Z",
              config: {
                cadence: { kind: "interval", minutes: 30 },
              },
              created_at: "2026-05-28T09:00:00.000Z",
            },
          ],
          updateScheduledTaskRun: async (id, update) => {
            scheduledTaskUpdates.push({ id, update });
          },
        },
      });
      runtime.eventBus.on("document.generated", (event) => documentEvents.push(event));

      await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
        scanned: 1,
        due: 1,
        completed: 1,
        failed: 0,
        skipped: 0,
      });

      expect(aiCalls).toEqual([
        "resume:Asha Rao:Desktop Automation Engineer",
        "cover:Asha Rao:Northstar Labs",
      ]);
      expect(applicationUpdates).toEqual([
        { applicationId: "app-1", update: { status: "preparing" } },
        {
          applicationId: "app-1",
          update: { status: "resume_generated", resumePath: join(outputDir, "app-1", "resume-v2.pdf") },
        },
        {
          applicationId: "app-1",
          update: {
            status: "cover_letter_generated",
            coverLetterPath: join(outputDir, "app-1", "cover-letter-v2.pdf"),
          },
        },
        { applicationId: "app-1", update: { status: "form_filling" } },
        {
          applicationId: "app-1",
          update: {
            status: "review_pending",
            submissionUrl: "https://ats.example/app-1/review",
          },
        },
      ]);
      expect(savedDocuments).toEqual([
        expect.objectContaining({
          applicationId: "app-1",
          type: "resume",
          filePath: join(outputDir, "app-1", "resume-v2.pdf"),
          fileName: "resume-v2.pdf",
          version: 2,
          aiModelUsed: "test-ai:resume-model",
        }),
        expect.objectContaining({
          applicationId: "app-1",
          type: "resume_json",
          filePath: join(outputDir, "app-1", "resume-v2.json"),
          fileName: "resume-v2.json",
          version: 2,
          aiModelUsed: "test-ai:resume-model",
        }),
        expect.objectContaining({
          applicationId: "app-1",
          type: "cover_letter",
          filePath: join(outputDir, "app-1", "cover-letter-v2.pdf"),
          fileName: "cover-letter-v2.pdf",
          version: 2,
          aiModelUsed: "test-ai:resume-model",
        }),
      ]);
      expect(documentEvents.map((event) => event.documentType)).toEqual([
        "resume",
        "resume_json",
        "cover_letter",
      ]);
      await expect(readFile(join(outputDir, "app-1", "resume-v2.pdf"), "utf8")).resolves.toContain(
        "React and Rust desktop automation engineer.",
      );
      await expect(readFile(join(outputDir, "app-1", "resume-v2.json"), "utf8").then(JSON.parse)).resolves.toMatchObject({
        formFillProfile: {
          fullName: "Asha Rao",
          skills: ["React", "TypeScript", "Rust", "Tauri"],
        },
      });
      await expect(readFile(join(outputDir, "app-1", "cover-letter-v2.pdf"), "utf8")).resolves.toContain(
        "Dear Northstar Labs team,",
      );
      expect(scheduledTaskUpdates).toEqual([
        {
          id: "application-processing-task",
          update: {
            last_run: "2026-05-28T10:30:00.000Z",
            next_run: "2026-05-28T11:00:00.000Z",
          },
        },
      ]);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("runs due email check scheduled tasks through the email response workflow", async () => {
    const checkedAt = new Date("2026-05-28T09:45:00Z");
    const savedCommunications: Array<Record<string, unknown>> = [];
    const applicationResponses: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
    const processedMessages: string[] = [];
    const responseEvents: Array<CareerEventMap["response.received"]> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      emailCheck: {
        fetchResponses: async () => [
          {
            id: "imap-1",
            applicationId: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            contactId: "contact-1",
            from: "recruiter@northstar.example",
            subject: "Interview availability",
            body: "Can you share availability for an interview this week?",
            receivedAt: "2026-05-28T09:40:00.000Z",
            responseType: "interview",
          },
        ],
        saveCommunication: async (communication) => {
          savedCommunications.push(communication);
          return { communicationId: "comm-1" };
        },
        updateApplicationResponse: async (applicationId, update) => {
          applicationResponses.push({ applicationId, update });
        },
        markResponseProcessed: async (messageId) => {
          processedMessages.push(messageId);
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "email-check-task",
            name: "Email Check",
            type: "email_check",
            cron_expression: "*/15 * * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-28T09:45:00.000Z",
            config: {
              cadence: { kind: "interval", minutes: 15 },
            },
            created_at: "2026-05-28T09:30:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("response.received", (event) => responseEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("email-check");
    expect(savedCommunications).toEqual([
      {
        applicationId: "app-1",
        contactId: "contact-1",
        direction: "received",
        type: "response",
        subject: "Interview availability",
        body: "Can you share availability for an interview this week?",
        emailId: "imap-1",
        sentAt: "2026-05-28T09:40:00.000Z",
        readAt: null,
      },
    ]);
    expect(applicationResponses).toEqual([
      {
        applicationId: "app-1",
        update: {
          responseDate: "2026-05-28T09:40:00.000Z",
          responseType: "interview",
          responseNotes: "Interview availability",
          status: "response_received",
        },
      },
    ]);
    expect(processedMessages).toEqual(["imap-1"]);
    expect(responseEvents).toEqual([
      {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        communicationId: "comm-1",
        responseType: "interview",
        subject: "Interview availability",
        receivedAt: new Date("2026-05-28T09:40:00.000Z"),
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "email-check-task",
        update: {
          last_run: "2026-05-28T09:45:00.000Z",
          next_run: "2026-05-28T10:00:00.000Z",
        },
      },
    ]);
  });

  it("runs configured email check input through the IMAP adapter", async () => {
    const checkedAt = new Date("2026-05-28T09:45:00Z");
    const readerConfigs: unknown[] = [];
    const fetchOptions: unknown[] = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      emailAdapters: {
        createEmailReader: (config) => {
          readerConfigs.push(config);
          return {
            fetchUnread: async (options) => {
              fetchOptions.push(options);
              return [
                {
                  id: "<reply-1@northstar.example>",
                  uid: 101,
                  from: "Mira <mira@northstar.example>",
                  subject: "Interview availability",
                  body: "Can you share availability this week?",
                  receivedAt: "2026-05-28T09:40:00.000Z",
                },
              ];
            },
          };
        },
      },
    });

    await expect(
      runtime.workflowEngine.run("email-check", {
        emailCheck: {
          account: {
            provider: "gmail",
            fromName: "Asha Rao",
            fromEmail: "asha@gmail.example",
            smtpHost: "smtp.gmail.com",
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: "asha@gmail.example",
            smtpPass: "app-password",
            imapHost: "imap.gmail.com",
            imapPort: 993,
            imapSecure: true,
            imapUser: "asha@gmail.example",
            imapPass: "app-password",
            signature: "Asha",
          },
          fetch: {
            mailbox: "Replies",
            limit: 25,
            markSeen: true,
          },
        },
      }),
    ).resolves.toEqual({
      scanned: 1,
      matched: 0,
      recorded: 0,
      failed: 0,
      skipped: 1,
    });
    expect(readerConfigs).toEqual([
      {
        provider: "gmail",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.example",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.example",
        smtpPass: "app-password",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.example",
        imapPass: "app-password",
        signature: "Asha",
      },
    ]);
    expect(fetchOptions).toEqual([
      {
        mailbox: "Replies",
        limit: 25,
        markSeen: true,
      },
    ]);
  });

  it("runs cold email outreach through profile, target, AI, and communication dependencies", async () => {
    const sentAt = new Date("2026-05-28T10:00:00Z");
    const savedCommunications: Array<Record<string, unknown>> = [];
    const runtime = createSidecarRuntime({
      now: () => sentAt,
      coldEmail: {
        loadProfile: async () => ({
          fullName: "Asha Rao",
          headline: "React and Tauri engineer",
          skills: ["React", "Rust", "Tauri"],
        }),
        listTargets: async () => [
          {
            applicationId: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            companyDomain: "northstar.example",
            companyIndustry: "developer tools",
            contactId: "contact-1",
            contactName: "Mira",
            role: "recruiter",
            context: "Hiring desktop automation engineers",
          },
        ],
        generateColdEmail: async () =>
          "Subject: Northstar Labs workflow automation intro\n\nHi Mira,\n\nI build local-first workflow tools.",
        saveCommunication: async (communication) => {
          savedCommunications.push(communication);
          return { communicationId: "comm-1" };
        },
      },
    });

    await expect(runtime.workflowEngine.run("cold-email")).resolves.toEqual({
      scanned: 1,
      generated: 1,
      sent: 1,
      failed: 0,
      skipped: 0,
      coldEmails: [
        {
          applicationId: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          contactId: "contact-1",
          contactName: "Mira",
          communicationId: "comm-1",
          emailId: null,
          subject: "Northstar Labs workflow automation intro",
          body: "Hi Mira,\n\nI build local-first workflow tools.",
          sentAt: "2026-05-28T10:00:00.000Z",
        },
      ],
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("cold-email");
    expect(savedCommunications).toEqual([
      {
        applicationId: "app-1",
        contactId: "contact-1",
        direction: "sent",
        type: "cold_email",
        subject: "Northstar Labs workflow automation intro",
        body: "Hi Mira,\n\nI build local-first workflow tools.",
        emailId: null,
        sentAt: "2026-05-28T10:00:00.000Z",
        readAt: null,
      },
    ]);
  });

  it("runs configured cold email outreach through the SMTP adapter", async () => {
    const sentAt = new Date("2026-05-28T10:00:00Z");
    const senderConfigs: unknown[] = [];
    const sentEmails: unknown[] = [];
    const savedCommunications: Array<Record<string, unknown>> = [];
    const runtime = createSidecarRuntime({
      now: () => sentAt,
      emailAdapters: {
        createEmailSender: (config) => {
          senderConfigs.push(config);
          return {
            sendEmail: async (email) => {
              sentEmails.push(email);
              return { messageId: "smtp-message-1" };
            },
          };
        },
      },
      coldEmail: {
        loadProfile: async () => ({
          fullName: "Asha Rao",
          headline: "React and Tauri engineer",
          skills: ["React", "Rust", "Tauri"],
        }),
        listTargets: async () => [
          {
            applicationId: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            contactId: "contact-1",
            contactName: "Mira",
            contactEmail: "mira@northstar.example",
            role: "recruiter",
            context: "Hiring desktop automation engineers",
          },
        ],
        generateColdEmail: async () =>
          "Subject: Northstar Labs workflow automation intro\n\nHi Mira,\n\nI build local-first workflow tools.",
        saveCommunication: async (communication) => {
          savedCommunications.push(communication);
          return { communicationId: "comm-1" };
        },
      },
    });

    await expect(
      runtime.workflowEngine.run("cold-email", {
        coldEmail: {
          account: {
            provider: "gmail",
            fromName: "Asha Rao",
            fromEmail: "asha@gmail.example",
            smtpHost: "smtp.gmail.com",
            smtpPort: 465,
            smtpSecure: true,
            smtpUser: "asha@gmail.example",
            smtpPass: "app-password",
            imapHost: "imap.gmail.com",
            imapPort: 993,
            imapSecure: true,
            imapUser: "asha@gmail.example",
            imapPass: "app-password",
            signature: "Asha",
          },
        },
      }),
    ).resolves.toMatchObject({
      sent: 1,
      coldEmails: [
        {
          communicationId: "comm-1",
          emailId: "smtp-message-1",
        },
      ],
    });
    expect(senderConfigs).toEqual([
      {
        provider: "gmail",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.example",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.example",
        smtpPass: "app-password",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.example",
        imapPass: "app-password",
        signature: "Asha",
      },
    ]);
    expect(sentEmails).toEqual([
      {
        to: "mira@northstar.example",
        subject: "Northstar Labs workflow automation intro",
        body: "Hi Mira,\n\nI build local-first workflow tools.",
      },
    ]);
    expect(savedCommunications).toEqual([
      {
        applicationId: "app-1",
        contactId: "contact-1",
        direction: "sent",
        type: "cold_email",
        subject: "Northstar Labs workflow automation intro",
        body: "Hi Mira,\n\nI build local-first workflow tools.",
        emailId: "smtp-message-1",
        sentAt: "2026-05-28T10:00:00.000Z",
        readAt: null,
      },
    ]);
  });

  it("runs due analytics scheduled tasks through the analytics refresh workflow", async () => {
    const checkedAt = new Date("2026-05-29T00:00:00Z");
    const savedSnapshots: Array<Record<string, unknown>> = [];
    const analyticsEvents: Array<CareerEventMap["analytics.refreshed"]> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      analytics: {
        loadInputs: async () => ({
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              platform: "linkedin",
              status: "submitted",
              appliedAt: "2026-05-20T00:00:00.000Z",
              responseDate: "2026-05-22T00:00:00.000Z",
              responseType: "interview",
              followUpCount: 1,
              resumeVersion: "frontend",
            },
            {
              id: "app-2",
              companyName: "Atlas Works",
              platform: "indeed",
              status: "submitted",
              appliedAt: "2026-05-21T00:00:00.000Z",
              responseDate: null,
              responseType: null,
              followUpCount: 0,
              resumeVersion: "backend",
            },
            {
              id: "app-3",
              companyName: "Northstar Labs",
              platform: "linkedin",
              status: "submitted",
              appliedAt: "2026-05-26T00:00:00.000Z",
              responseDate: "2026-05-27T00:00:00.000Z",
              responseType: "offer",
              followUpCount: 0,
              resumeVersion: "frontend",
            },
          ],
          jobs: [
            {
              id: "job-1",
              platform: "linkedin",
              companyName: "Northstar Labs",
              matchScore: 88,
              requiredSkills: ["React", "TypeScript"],
            },
            {
              id: "job-2",
              platform: "indeed",
              companyName: "Atlas Works",
              matchScore: 64,
              requiredSkills: ["React", "SQL"],
            },
            {
              id: "job-3",
              platform: "linkedin",
              companyName: "Northstar Labs",
              matchScore: 92,
              requiredSkills: ["TypeScript"],
            },
          ],
        }),
        saveSnapshot: async (snapshot) => {
          savedSnapshots.push(snapshot);
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "analytics-refresh-task",
            name: "Analytics Refresh",
            type: "analytics",
            cron_expression: "0 0 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-29T00:00:00.000Z",
            config: {
              cadence: { kind: "daily", hour: 0, minute: 0 },
            },
            created_at: "2026-05-28T00:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("analytics.refreshed", (event) => analyticsEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("analytics-refresh");
    expect(savedSnapshots).toEqual([
      {
        generatedAt: "2026-05-29T00:00:00.000Z",
        metrics: {
          totalApplications: 3,
          applicationRate: { daily: 0.33, weekly: 2.33 },
          responseRate: 66.67,
          interviewRate: 33.33,
          offerRate: 33.33,
          averageTimeToResponseDays: 1.5,
          topPlatforms: [
            { label: "linkedin", count: 2 },
            { label: "indeed", count: 1 },
          ],
          topCompanies: [
            { label: "Northstar Labs", count: 2 },
            { label: "Atlas Works", count: 1 },
          ],
          skillDemand: [
            { label: "React", count: 2 },
            { label: "TypeScript", count: 2 },
            { label: "SQL", count: 1 },
          ],
          matchScoreDistribution: [
            { bucket: "0-49", count: 0 },
            { bucket: "50-69", count: 1 },
            { bucket: "70-89", count: 1 },
            { bucket: "90-100", count: 1 },
          ],
          followUpEffectiveness: {
            withFollowUp: { applications: 1, responses: 1, responseRate: 100 },
            withoutFollowUp: { applications: 2, responses: 1, responseRate: 50 },
          },
          resumeVersionPerformance: [
            { label: "frontend", applications: 2, responses: 2, responseRate: 100 },
            { label: "backend", applications: 1, responses: 0, responseRate: 0 },
          ],
          weeklyTrend: [
            { week: "2026-05-18", applications: 2, responses: 1 },
            { week: "2026-05-25", applications: 1, responses: 1 },
          ],
          funnel: {
            discovered: 3,
            matched: 3,
            applied: 3,
            response: 2,
            interview: 1,
            offer: 1,
          },
        },
      },
    ]);
    expect(analyticsEvents).toEqual([
      {
        generatedAt: checkedAt,
        totalApplications: 3,
        responseRate: 66.67,
        interviewRate: 33.33,
        offerRate: 33.33,
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "analytics-refresh-task",
        update: {
          last_run: "2026-05-29T00:00:00.000Z",
          next_run: "2026-05-30T00:00:00.000Z",
        },
      },
    ]);
  });

  it("runs configured analytics inputs through the analytics workflow", async () => {
    const checkedAt = new Date("2026-05-29T00:00:00Z");
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
    });

    await expect(
      runtime.workflowEngine.run("analytics-refresh", {
        analyticsRefresh: {
          inputs: {
            applications: [
              {
                id: "app-1",
                companyName: "Northstar Labs",
                platform: "linkedin",
                status: "submitted",
                appliedAt: "2026-05-20T00:00:00.000Z",
                responseDate: "2026-05-22T00:00:00.000Z",
                responseType: "interview",
                followUpCount: 1,
                resumeVersion: "frontend",
              },
              {
                id: "app-2",
                companyName: "Atlas Works",
                platform: "indeed",
                status: "submitted",
                appliedAt: "2026-05-21T00:00:00.000Z",
                responseDate: null,
                responseType: null,
                followUpCount: 0,
                resumeVersion: null,
              },
            ],
            jobs: [
              {
                id: "job-1",
                platform: "linkedin",
                companyName: "Northstar Labs",
                matchScore: 88,
                requiredSkills: ["React"],
              },
              {
                id: "job-2",
                platform: "indeed",
                companyName: "Atlas Works",
                matchScore: null,
                requiredSkills: ["SQL"],
              },
            ],
          },
        },
      }),
    ).resolves.toMatchObject({
      applications: 2,
      jobs: 2,
      saved: true,
      snapshot: {
        generatedAt: "2026-05-29T00:00:00.000Z",
        metrics: {
          totalApplications: 2,
          responseRate: 50,
          interviewRate: 50,
          offerRate: 0,
          averageTimeToResponseDays: 2,
          followUpEffectiveness: {
            withFollowUp: { applications: 1, responses: 1, responseRate: 100 },
            withoutFollowUp: { applications: 1, responses: 0, responseRate: 0 },
          },
          funnel: {
            discovered: 2,
            matched: 1,
            applied: 2,
            response: 1,
            interview: 1,
            offer: 0,
          },
        },
      },
    });
  });

  it("runs due export scheduled tasks through the export sync workflow", async () => {
    const checkedAt = new Date("2026-05-29T06:00:00Z");
    const syncedExports: Array<{ exporterId: string; payload: Record<string, unknown> }> = [];
    const exportRuns: Array<Record<string, unknown>> = [];
    const exportEvents: Array<CareerEventMap["export.synced"]> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      exportSync: {
        loadExportPayload: async () => ({
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
              updatedAt: "2026-05-28T12:00:00.000Z",
            },
            {
              id: "app-2",
              companyName: "Atlas Works",
              roleTitle: "Backend Engineer",
              status: "response_received",
              updatedAt: "2026-05-28T13:00:00.000Z",
            },
          ],
          analytics: {
            totalApplications: 2,
            responseRate: 50,
          },
        }),
        listExporters: async () => [
          {
            id: "notion",
            name: "Notion",
            isEnabled: true,
            sync: async (payload) => {
              syncedExports.push({ exporterId: "notion", payload });
              return { recordsWritten: 2, externalUrl: "https://notion.example/career" };
            },
          },
          {
            id: "sheets",
            name: "Google Sheets",
            isEnabled: true,
            sync: async (payload) => {
              syncedExports.push({ exporterId: "sheets", payload });
              return { recordsWritten: 2, externalUrl: "https://sheets.example/career" };
            },
          },
        ],
        saveExportRun: async (run) => {
          exportRuns.push(run);
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "export-sync-task",
            name: "Export Sync",
            type: "export",
            cron_expression: "0 */6 * * *",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-29T06:00:00.000Z",
            config: {
              cadence: { kind: "interval", minutes: 360 },
            },
            created_at: "2026-05-29T00:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("export.synced", (event) => exportEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("export-sync");
    expect(syncedExports).toEqual([
      {
        exporterId: "notion",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
              updatedAt: "2026-05-28T12:00:00.000Z",
            },
            {
              id: "app-2",
              companyName: "Atlas Works",
              roleTitle: "Backend Engineer",
              status: "response_received",
              updatedAt: "2026-05-28T13:00:00.000Z",
            },
          ],
          analytics: {
            totalApplications: 2,
            responseRate: 50,
          },
        },
      },
      {
        exporterId: "sheets",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
              updatedAt: "2026-05-28T12:00:00.000Z",
            },
            {
              id: "app-2",
              companyName: "Atlas Works",
              roleTitle: "Backend Engineer",
              status: "response_received",
              updatedAt: "2026-05-28T13:00:00.000Z",
            },
          ],
          analytics: {
            totalApplications: 2,
            responseRate: 50,
          },
        },
      },
    ]);
    expect(exportRuns).toEqual([
      {
        exporterId: "notion",
        exporterName: "Notion",
        status: "completed",
        recordsWritten: 2,
        externalUrl: "https://notion.example/career",
        syncedAt: "2026-05-29T06:00:00.000Z",
      },
      {
        exporterId: "sheets",
        exporterName: "Google Sheets",
        status: "completed",
        recordsWritten: 2,
        externalUrl: "https://sheets.example/career",
        syncedAt: "2026-05-29T06:00:00.000Z",
      },
    ]);
    expect(exportEvents).toEqual([
      {
        exporterId: "notion",
        exporterName: "Notion",
        recordsWritten: 2,
        externalUrl: "https://notion.example/career",
        syncedAt: checkedAt,
      },
      {
        exporterId: "sheets",
        exporterName: "Google Sheets",
        recordsWritten: 2,
        externalUrl: "https://sheets.example/career",
        syncedAt: checkedAt,
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "export-sync-task",
        update: {
          last_run: "2026-05-29T06:00:00.000Z",
          next_run: "2026-05-29T12:00:00.000Z",
        },
      },
    ]);
  });

  it("runs due cleanup scheduled tasks through the cleanup workflow", async () => {
    const checkedAt = new Date("2026-05-31T03:00:00Z");
    const cleanupCalls: Array<Record<string, unknown>> = [];
    const cleanupEvents: Array<CareerEventMap["cleanup.completed"]> = [];
    const scheduledTaskUpdates: Array<{ id: string; update: PersistedScheduledTaskRunUpdate }> = [];
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      cleanup: {
        purgeExpiredAiCache: async (now) => {
          cleanupCalls.push({ action: "purge-ai-cache", now: now.toISOString() });
          return { deleted: 4 };
        },
        archiveOldJobs: async (cutoff) => {
          cleanupCalls.push({ action: "archive-old-jobs", cutoff: cutoff.toISOString() });
          return { archived: 7 };
        },
      },
      scheduledTasks: {
        listScheduledTasks: async () => [
          {
            id: "cleanup-task",
            name: "Cleanup",
            type: "cleanup",
            cron_expression: "0 3 * * 0",
            is_enabled: true,
            last_run: null,
            next_run: "2026-05-31T03:00:00.000Z",
            config: {
              cadence: { kind: "weekly", dayOfWeek: 0, hour: 3, minute: 0 },
            },
            created_at: "2026-05-24T03:00:00.000Z",
          },
        ],
        updateScheduledTaskRun: async (id, update) => {
          scheduledTaskUpdates.push({ id, update });
        },
      },
    });

    runtime.eventBus.on("cleanup.completed", (event) => cleanupEvents.push(event));

    await expect(runtime.runDueScheduledTasks()).resolves.toEqual({
      scanned: 1,
      due: 1,
      completed: 1,
      failed: 0,
      skipped: 0,
    });

    expect(runtime.workflowEngine.registeredWorkflows()).toContain("cleanup");
    expect(cleanupCalls).toEqual([
      { action: "purge-ai-cache", now: "2026-05-31T03:00:00.000Z" },
      { action: "archive-old-jobs", cutoff: "2026-05-01T03:00:00.000Z" },
    ]);
    expect(cleanupEvents).toEqual([
      {
        completedAt: checkedAt,
        expiredAiCacheDeleted: 4,
        archivedJobs: 7,
        archiveCutoff: "2026-05-01T03:00:00.000Z",
      },
    ]);
    expect(scheduledTaskUpdates).toEqual([
      {
        id: "cleanup-task",
        update: {
          last_run: "2026-05-31T03:00:00.000Z",
          next_run: "2026-06-07T03:00:00.000Z",
        },
      },
    ]);
  });
});

function fakeBrowserSession(): BrowserSession {
  return {
    close: async () => {},
    newPage: async () => {
      throw new Error("not used in this test");
    },
  };
}

function recordingNotificationAdapter(
  channel: NotificationChannel,
  deliveries: NotificationDelivery[],
): NotificationAdapter {
  return {
    channel,
    send: async (delivery) => {
      deliveries.push(delivery);
    },
  };
}

async function flushNotifications(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
