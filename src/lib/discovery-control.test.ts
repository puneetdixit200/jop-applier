import { describe, expect, it, vi } from "vitest";
import {
  runDiscoveryControl,
  type DiscoveryControlDependencies,
} from "./discovery-control";
import type { Job, SidecarRuntimeStatus } from "./tauri-api";

function desktopDependencies(overrides: Partial<DiscoveryControlDependencies> = {}): DiscoveryControlDependencies {
  return {
    isDesktopRuntime: () => true,
    getSidecarStatus: vi.fn(async () => runtimeStatus),
    runSidecarWorkflow: vi.fn(async () => ({ queries: 1, discovered: 1, stored: 1 })),
    listJobs: vi.fn(async () => [job]),
    ...overrides,
  };
}

const runtimeStatus: SidecarRuntimeStatus = {
  status: "ready",
  workflows: ["job-discovery"],
  provider: {
    provider: "ollama",
    model: "mistral:7b-instruct",
    local: true,
  },
};

const job: Job = {
  id: "job-1",
  source_id: "linkedin-1",
  platform: "linkedin",
  url: "https://linkedin.example/jobs/1",
  title: "Frontend Engineer Intern",
  company_name: "Northstar Labs",
  location: "Remote",
  is_remote: true,
  salary_min: null,
  salary_max: null,
  salary_currency: "INR",
  job_type: "internship",
  experience_level: "intern",
  description: "React internship",
  requirements: ["React"],
  raw_html: null,
  match_score: 91,
  match_confidence: 0.86,
  match_reasoning: "Strong match",
  matched_skills: ["React"],
  missing_skills: [],
  ai_tags: ["good-fit"],
  should_apply: true,
  ai_priority: "high",
};

describe("runDiscoveryControl", () => {
  it("runs desktop discovery and reloads sidecar status with persisted jobs", async () => {
    const dependencies = desktopDependencies();

    await expect(runDiscoveryControl(dependencies)).resolves.toEqual({
      workflowStatus: "job-discovery completed",
      runtimeStatus: {
        providerLabel: "ollama:mistral:7b-instruct",
        runtimeStatus: "ready",
        statusMessage: "ready · 1 workflows",
        workflowCount: 1,
      },
      jobs: [
        {
          title: "Frontend Engineer Intern",
          company: "Northstar Labs",
          score: 91,
          source: "linkedin",
          location: "Remote",
          priority: "high",
        },
      ],
    });
    expect(dependencies.runSidecarWorkflow).toHaveBeenCalledWith("job-discovery");
    expect(dependencies.getSidecarStatus).toHaveBeenCalledOnce();
    expect(dependencies.listJobs).toHaveBeenCalledOnce();
  });

  it("returns workflow failure status without reloading jobs", async () => {
    const dependencies = desktopDependencies({
      runSidecarWorkflow: vi.fn(async () => {
        throw new Error("sidecar unavailable");
      }),
    });

    await expect(runDiscoveryControl(dependencies)).resolves.toEqual({
      workflowStatus: "job-discovery failed: sidecar unavailable",
      runtimeStatus: null,
      jobs: null,
    });
    expect(dependencies.getSidecarStatus).not.toHaveBeenCalled();
    expect(dependencies.listJobs).not.toHaveBeenCalled();
  });

  it("keeps browser preview mode from calling desktop APIs", async () => {
    const dependencies = desktopDependencies({
      isDesktopRuntime: () => false,
    });

    await expect(runDiscoveryControl(dependencies)).resolves.toEqual({
      workflowStatus: "Browser preview",
      runtimeStatus: null,
      jobs: null,
    });
    expect(dependencies.runSidecarWorkflow).not.toHaveBeenCalled();
    expect(dependencies.getSidecarStatus).not.toHaveBeenCalled();
    expect(dependencies.listJobs).not.toHaveBeenCalled();
  });
});
