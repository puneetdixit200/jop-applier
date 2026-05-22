import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSidecarRuntime } from "../index.js";
import type { UpsertJobPayload } from "../discovery/job-persistence.js";
import { handleSidecarIpcRequest, runSidecarIpc } from "./runtime-ipc.js";

const expectedWorkflows = [
  "analytics-refresh",
  "application-processing",
  "cleanup",
  "cold-email",
  "email-check",
  "export-sync",
  "follow-up-check",
  "job-discovery",
  "session-health",
];

describe("sidecar runtime IPC", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns runtime status over the IPC request handler", async () => {
    const runtime = createSidecarRuntime();

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "status-1",
        method: "runtime.status",
      }),
    ).resolves.toEqual({
      id: "status-1",
      ok: true,
      result: {
        status: "ready",
        workflows: expectedWorkflows,
        provider: {
          provider: "ollama",
          model: "mistral:7b-instruct",
          local: true,
        },
      },
    });
  });

  it("runs registered workflows over the IPC request handler", async () => {
    const persistedUrls: string[] = [];
    const runtime = createSidecarRuntime({
      jobDiscovery: {
        searchQueries: [{ keywords: ["react"], remote: true }],
        searchForPersistence: async () => [
          discoveredJob({
            url: "https://jobs.example/react",
            title: "React Engineer",
            company_name: "Northstar Labs",
          }),
        ],
        upsertJobs: async (jobs) => {
          persistedUrls.push(...jobs.map((job) => job.url));
          return jobs.map((job, index) => ({
            id: `job-${index + 1}`,
            platform: job.platform,
            title: job.title,
            company_name: job.company_name,
          }));
        },
      },
    });

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "workflow-1",
        method: "workflow.run",
        params: {
          workflowId: "job-discovery",
        },
      }),
    ).resolves.toEqual({
      id: "workflow-1",
      ok: true,
      result: {
        queries: 1,
        discovered: 1,
        stored: 1,
        jobs: [
          expect.objectContaining({
            url: "https://jobs.example/react",
            title: "React Engineer",
            company_name: "Northstar Labs",
          }),
        ],
      },
    });
    expect(persistedUrls).toEqual(["https://jobs.example/react"]);
  });

  it("returns native and in-app notifications emitted during workflow runs", async () => {
    const checkedAt = new Date("2026-05-28T12:45:00Z");
    const runtime = createSidecarRuntime({
      now: () => checkedAt,
      applicationProcessing: {
        listApplications: async () => [
          {
            id: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            status: "queued",
            mode: "full_auto",
            resumePath: "/tmp/app-1-resume.pdf",
            coverLetterPath: "/tmp/app-1-cover-letter.pdf",
            retryCount: 0,
            maxRetries: 3,
          },
        ],
        prepareApplication: async () => undefined,
        generateResume: async () => ({ resumePath: "/tmp/app-1-resume.pdf" }),
        generateCoverLetter: async () => ({ coverLetterPath: "/tmp/app-1-cover-letter.pdf" }),
        fillApplicationForm: async () => ({ submissionUrl: "https://ats.example/app-1" }),
        submitApplication: async () => {
          throw new Error("captcha challenge");
        },
        updateApplication: async () => undefined,
      },
    });

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "workflow-application-processing",
        method: "workflow.run",
        params: {
          workflowId: "application-processing",
        },
      }),
    ).resolves.toEqual({
      id: "workflow-application-processing",
      ok: true,
      result: expect.objectContaining({
        failed: 1,
        notifications: [
          {
            type: "application.failed",
            title: "Application failed",
            body: "Northstar Labs application failed: captcha challenge",
            priority: "high",
            channel: "os",
            createdAt: "2026-05-28T12:45:00.000Z",
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
            title: "Application failed",
            body: "Northstar Labs application failed: captcha challenge",
            priority: "high",
            channel: "in_app",
            createdAt: "2026-05-28T12:45:00.000Z",
            metadata: {
              applicationId: "app-1",
              jobId: "job-1",
              companyName: "Northstar Labs",
              status: "failed",
              reason: "captcha challenge",
            },
          },
        ],
      }),
    });
  });

  it("passes configured discovery search queries into job-discovery", async () => {
    const searchedQueries: unknown[] = [];
    const runtime = createSidecarRuntime({
      jobDiscovery: {
        searchQueries: [],
        searchForPersistence: async (query) => {
          searchedQueries.push(query);
          return [
            discoveredJob({
              url: "https://jobs.example/configured-react",
              title: "Configured React Engineer",
              company_name: "Settings Labs",
            }),
          ];
        },
        upsertJobs: async (jobs) =>
          jobs.map((job, index) => ({
            id: `configured-job-${index + 1}`,
            platform: job.platform,
            title: job.title,
            company_name: job.company_name,
          })),
      },
    });

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "workflow-configured",
        method: "workflow.run",
        params: {
          workflowId: "job-discovery",
          discovery: {
            searchQueries: [
              {
                keywords: ["react", "typescript"],
                location: "Remote",
                remote: true,
                experienceLevel: "entry",
                jobType: "fulltime",
              },
            ],
          },
        },
      }),
    ).resolves.toEqual({
      id: "workflow-configured",
      ok: true,
      result: expect.objectContaining({
        queries: 1,
        discovered: 1,
        stored: 1,
      }),
    });
    expect(searchedQueries).toEqual([
      {
        keywords: ["react", "typescript"],
        location: "Remote",
        remote: true,
        experienceLevel: "entry",
        jobType: "fulltime",
      },
    ]);
  });

  it("discovers jobs from configured HTTP JSON feed sources", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify([
            {
              id: "feed-react-1",
              url: "https://jobs.example/feed-react",
              title: "React Feed Engineer",
              company: "Feed Labs",
              location: "Remote",
              remote: true,
              description: "React and TypeScript job from a configured feed",
              requirements: ["React", "TypeScript"],
            },
          ]),
          { status: 200 },
        ),
      ),
    );
    const persistedUrls: string[] = [];
    const runtime = createSidecarRuntime({
      jobDiscovery: {
        searchQueries: [],
        searchForPersistence: async () => {
          throw new Error("configured feed should provide search results");
        },
        upsertJobs: async (jobs) => {
          persistedUrls.push(...jobs.map((job) => job.url));
          return jobs.map((job, index) => ({
            id: `feed-job-${index + 1}`,
            platform: job.platform,
            title: job.title,
            company_name: job.company_name,
          }));
        },
      },
    });

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "workflow-feed",
        method: "workflow.run",
        params: {
          workflowId: "job-discovery",
          discovery: {
            feedSources: [
              {
                id: "configured",
                platform: "custom",
                url: "https://feeds.example/jobs.json",
              },
            ],
            searchQueries: [{ keywords: ["react"], remote: true }],
          },
        },
      }),
    ).resolves.toEqual({
      id: "workflow-feed",
      ok: true,
      result: expect.objectContaining({
        queries: 1,
        discovered: 1,
        stored: 1,
        jobs: [
          expect.objectContaining({
            source_id: "configured:feed-react-1",
            platform: "custom",
            url: "https://jobs.example/feed-react",
            title: "React Feed Engineer",
            company_name: "Feed Labs",
          }),
        ],
      }),
    });
    expect(persistedUrls).toEqual(["https://jobs.example/feed-react"]);
  });

  it("runs application review decisions over the IPC request handler", async () => {
    const checkedAt = new Date("2026-05-28T12:00:00Z");
    const submittedApplications: string[] = [];
    const verifiedSubmissions: string[] = [];
    const applicationUpdates: Array<{ applicationId: string; update: Record<string, unknown> }> = [];
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
            receiptText: "Thanks for applying. Confirmation CONF-42",
          };
        },
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

    await expect(
      handleSidecarIpcRequest(runtime, {
        id: "review-app-1",
        method: "application.reviewDecision",
        params: {
          decision: "approve",
          application: {
            id: "app-1",
            job_id: "job-1",
            company_name: "Northstar Labs",
            status: "review_pending",
            mode: "semi_auto",
            resume_path: "/tmp/app-1-resume.pdf",
            cover_letter_path: "/tmp/app-1-cover-letter.pdf",
            retry_count: 0,
            max_retries: 3,
          },
        },
      }),
    ).resolves.toEqual({
      id: "review-app-1",
      ok: true,
      result: {
        status: "submitted",
        confirmationId: "CONF-42",
      },
    });
    expect(submittedApplications).toEqual(["app-1:submitting"]);
    expect(verifiedSubmissions).toEqual(["app-1:Thanks for applying. Confirmation CONF-42"]);
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
          confirmationId: "CONF-42",
          submittedAt: "2026-05-28T12:00:00.000Z",
          errorMessage: null,
        },
      },
    ]);
  });

  it("serializes JSON-line responses for stdio IPC", async () => {
    const runtime = createSidecarRuntime();
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.setEncoding("utf8");
    output.on("data", (chunk) => chunks.push(String(chunk)));

    const finished = runSidecarIpc(runtime, input, output);
    input.write(JSON.stringify({ id: "status-1", method: "runtime.status" }) + "\n");
    input.write("{not-json}\n");
    input.end();
    await finished;

    const responses = chunks
      .join("")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(responses).toEqual([
      expect.objectContaining({
        id: "status-1",
        ok: true,
        result: expect.objectContaining({
          status: "ready",
          workflows: expectedWorkflows,
        }),
      }),
      {
        id: null,
        ok: false,
        error: {
          message: "IPC request must be valid JSON",
        },
      },
    ]);
  });
});

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
