import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HttpJsonFeedConnector,
  type HttpJsonFeedSource,
} from "./http-json-feed-connector.js";

const source: HttpJsonFeedSource = {
  id: "custom-feed",
  name: "Custom JSON Feed",
  platform: "custom",
  url: "https://feeds.example/jobs.json",
};

describe("HttpJsonFeedConnector", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches JSON feed jobs and filters them by search query", async () => {
    const fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          jobs: [
            {
              id: "react-1",
              url: "https://jobs.example/react",
              title: "React Engineer",
              company: "Northstar Labs",
              location: "Remote",
              remote: true,
              salary: "900000 - 1400000 INR",
              description: "Build TypeScript interfaces with React",
              requirements: ["React", "TypeScript"],
            },
            {
              id: "go-1",
              url: "https://jobs.example/go",
              title: "Go Platform Engineer",
              company: "Backend Works",
              location: "Bengaluru",
              description: "Build Go services",
              requirements: ["Go"],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const connector = new HttpJsonFeedConnector(source);

    const listings = [];
    for await (const listing of connector.search({ keywords: ["react"], remote: true })) {
      listings.push(listing);
    }

    expect(fetch).toHaveBeenCalledWith(source.url, { headers: {} });
    expect(listings).toEqual([
      {
        sourceId: "custom-feed:react-1",
        platform: "custom",
        url: "https://jobs.example/react",
        title: "React Engineer",
        company: "Northstar Labs",
        location: "Remote",
        salary: "900000 - 1400000 INR",
        description: "Build TypeScript interfaces with React",
        rawHtml: undefined,
      },
    ]);
    await expect(connector.getJobDetails("https://jobs.example/react")).resolves.toEqual({
      url: "https://jobs.example/react",
      description: "Build TypeScript interfaces with React",
      requirements: ["React", "TypeScript"],
      rawHtml: undefined,
    });
  });

  it("reports feed health from the configured endpoint", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([]), { status: 200 })),
    );
    const connector = new HttpJsonFeedConnector(source);

    await expect(connector.healthCheck()).resolves.toEqual({
      ok: true,
      message: "Custom JSON Feed feed is reachable",
    });
  });
});
