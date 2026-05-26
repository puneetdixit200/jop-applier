import { afterEach, describe, expect, it, vi } from "vitest";
import { runBrowserDiscovery } from "./browser-discovery";
import type { Job } from "./tauri-api";

const job: Job = {
  id: "browser-live-1",
  source_id: "live-1",
  platform: "remoteok",
  url: "https://remoteok.com/remote-job/1",
  title: "React Engineer",
  company_name: "Remote Labs",
  location: "Worldwide",
  is_remote: true,
  salary_min: null,
  salary_max: null,
  salary_currency: "USD",
  job_type: null,
  experience_level: null,
  description: "React role",
  requirements: ["react"],
  raw_html: null,
  match_score: 90,
  match_confidence: 0.9,
  match_reasoning: "Matched browser discovery keywords.",
  matched_skills: ["react"],
  missing_skills: [],
  ai_tags: ["live"],
  should_apply: true,
  ai_priority: "high",
};

describe("browser discovery", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runs local browser discovery through the dev API", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          workflowStatus: "job-discovery completed: 1 found",
          discovered: 1,
          jobs: [job],
          sources: ["remoteok"],
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetch);

    await expect(
      runBrowserDiscovery({
        searchQueries: [{ keywords: ["React"], remote: true }],
        portalSources: [],
        feedSources: [],
        atsSources: [],
        careerPageSources: [],
      }),
    ).resolves.toEqual({
      workflowStatus: "job-discovery completed: 1 found",
      discovered: 1,
      jobs: [job],
      sources: ["remoteok"],
    });
    expect(fetch).toHaveBeenCalledWith("/api/discovery/run", expect.objectContaining({
      method: "POST",
    }));
  });

  it("throws the API error when browser discovery fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: "network unavailable" }), { status: 500 }),
      ),
    );

    await expect(
      runBrowserDiscovery({
        searchQueries: [],
        portalSources: [],
        feedSources: [],
        atsSources: [],
        careerPageSources: [],
      }),
    ).rejects.toThrow("network unavailable");
  });
});
