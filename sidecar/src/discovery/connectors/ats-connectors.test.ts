import { describe, expect, it } from "vitest";
import { GreenhouseConnector } from "./greenhouse-connector.js";
import { LeverConnector } from "./lever-connector.js";

describe("ATS job connectors", () => {
  it("searches Greenhouse board jobs and maps them to raw listings", async () => {
    const requestedUrls: string[] = [];
    const connector = new GreenhouseConnector({
      boardToken: "northstar",
      fetch: async (url) => {
        requestedUrls.push(String(url));
        return jsonResponse({
          jobs: [
            {
              id: 101,
              title: "Frontend Engineer Intern",
              absolute_url: "https://boards.greenhouse.io/northstar/jobs/101",
              location: { name: "Remote" },
              content: "<p>React internship</p>",
              updated_at: "2026-05-29T00:00:00Z",
            },
            {
              id: 102,
              title: "Finance Analyst",
              absolute_url: "https://boards.greenhouse.io/northstar/jobs/102",
              location: { name: "Mumbai" },
              content: "<p>Spreadsheets</p>",
            },
          ],
        });
      },
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(requestedUrls).toEqual([
      "https://boards-api.greenhouse.io/v1/boards/northstar/jobs?content=true",
    ]);
    expect(listings).toEqual([
      {
        sourceId: "101",
        platform: "greenhouse",
        url: "https://boards.greenhouse.io/northstar/jobs/101",
        title: "Frontend Engineer Intern",
        company: "northstar",
        location: "Remote",
        description: "React internship",
        rawHtml: "<p>React internship</p>",
        postedDate: new Date("2026-05-29T00:00:00Z"),
      },
    ]);

    await expect(
      connector.getJobDetails("https://boards.greenhouse.io/northstar/jobs/101"),
    ).resolves.toEqual({
      url: "https://boards.greenhouse.io/northstar/jobs/101",
      description: "React internship",
      requirements: [],
      rawHtml: "<p>React internship</p>",
    });
  });

  it("searches Lever postings and maps them to raw listings", async () => {
    const connector = new LeverConnector({
      company: "atlas",
      fetch: async () =>
        jsonResponse([
          {
            id: "posting-1",
            text: "Backend Platform Engineer",
            hostedUrl: "https://jobs.lever.co/atlas/posting-1",
            categories: {
              location: "Bengaluru",
              commitment: "Full-time",
              team: "Engineering",
            },
            descriptionPlain: "Node.js platform role",
            lists: [{ text: "Requirements", content: "<li>Node.js</li><li>SQL</li>" }],
            createdAt: 1770048000000,
          },
          {
            id: "posting-2",
            text: "Sales Manager",
            hostedUrl: "https://jobs.lever.co/atlas/posting-2",
            categories: {
              location: "Remote",
              commitment: "Full-time",
              team: "Sales",
            },
            descriptionPlain: "Sales role",
            lists: [],
          },
        ]),
    });

    const listings = await collect(connector.search({ keywords: ["Node"], location: "Bengaluru" }));

    expect(listings).toEqual([
      {
        sourceId: "posting-1",
        platform: "lever",
        url: "https://jobs.lever.co/atlas/posting-1",
        title: "Backend Platform Engineer",
        company: "atlas",
        location: "Bengaluru",
        description: "Node.js platform role",
        rawHtml: "<li>Node.js</li><li>SQL</li>",
        postedDate: new Date(1770048000000),
      },
    ]);
    await expect(connector.healthCheck()).resolves.toEqual({
      ok: true,
      message: "Lever atlas returned 2 postings",
    });
  });
});

async function collect<T>(items: AsyncGenerator<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) {
    collected.push(item);
  }

  return collected;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
