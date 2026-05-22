import { describe, expect, it } from "vitest";
import {
  createAnalyticsDependenciesFromWorkflowInput,
} from "./analytics-config.js";
import type { AnalyticsRefreshWorkerDependencies } from "./analytics-refresh-worker.js";

const fallback: AnalyticsRefreshWorkerDependencies = {
  loadInputs: async () => ({ applications: [], jobs: [] }),
  saveSnapshot: async () => undefined,
};

describe("analytics config", () => {
  it("loads analytics inputs from configured workflow input", async () => {
    const dependencies = createAnalyticsDependenciesFromWorkflowInput(
      {
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
            ],
            jobs: [
              {
                id: "job-1",
                platform: "linkedin",
                companyName: "Northstar Labs",
                matchScore: 91,
                requiredSkills: ["React", "TypeScript"],
              },
            ],
          },
        },
      },
      { fallback },
    );

    await expect(dependencies?.loadInputs()).resolves.toEqual({
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
      ],
      jobs: [
        {
          id: "job-1",
          platform: "linkedin",
          companyName: "Northstar Labs",
          matchScore: 91,
          requiredSkills: ["React", "TypeScript"],
        },
      ],
    });
  });
});
