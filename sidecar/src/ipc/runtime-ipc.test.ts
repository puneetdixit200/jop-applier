import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createSidecarRuntime } from "../index.js";
import type { UpsertJobPayload } from "../discovery/job-persistence.js";
import { handleSidecarIpcRequest, runSidecarIpc } from "./runtime-ipc.js";

const expectedWorkflows = [
  "analytics-refresh",
  "application-processing",
  "cleanup",
  "email-check",
  "export-sync",
  "follow-up-check",
  "job-discovery",
  "session-health",
];

describe("sidecar runtime IPC", () => {
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
      },
    });
    expect(persistedUrls).toEqual(["https://jobs.example/react"]);
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
