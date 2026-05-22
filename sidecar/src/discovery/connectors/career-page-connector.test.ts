import { describe, expect, it } from "vitest";
import { CareerPageConnector } from "./career-page-connector.js";

describe("CareerPageConnector", () => {
  it("extracts JobPosting JSON-LD from company career pages", async () => {
    const requestedUrls: string[] = [];
    const connector = new CareerPageConnector({
      id: "northstar-careers",
      company: "Northstar Labs",
      url: "https://northstar.example/careers",
      fetch: async (url) => {
        requestedUrls.push(String(url));
        if (String(url).endsWith("/jobs/react-platform")) {
          return htmlResponse("<main><p>Build React tools.</p><ul><li>React</li><li>TypeScript</li></ul></main>");
        }

        return htmlResponse(`
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "identifier": { "value": "react-platform" },
              "title": "React Platform Engineer",
              "datePosted": "2026-05-21",
              "description": "<p>Build React tools.</p>",
              "url": "/jobs/react-platform",
              "jobLocationType": "TELECOMMUTE",
              "hiringOrganization": { "name": "Northstar Labs" }
            }
          </script>
        `);
      },
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(listings).toEqual([
      {
        sourceId: "northstar-careers:react-platform",
        platform: "company-career-page",
        url: "https://northstar.example/jobs/react-platform",
        title: "React Platform Engineer",
        company: "Northstar Labs",
        location: "Remote",
        description: "Build React tools.",
        rawHtml: "<p>Build React tools.</p>",
        postedDate: new Date("2026-05-21"),
        salary: undefined,
      },
    ]);
    await expect(
      connector.getJobDetails("https://northstar.example/jobs/react-platform"),
    ).resolves.toEqual({
      url: "https://northstar.example/jobs/react-platform",
      description: "Build React tools. React TypeScript",
      requirements: ["React", "TypeScript"],
      rawHtml: "<main><p>Build React tools.</p><ul><li>React</li><li>TypeScript</li></ul></main>",
    });
    expect(requestedUrls).toEqual([
      "https://northstar.example/careers",
      "https://northstar.example/jobs/react-platform",
    ]);
  });

  it("falls back to job-like links when structured data is unavailable", async () => {
    const connector = new CareerPageConnector({
      id: "atlas",
      company: "Atlas",
      url: "https://atlas.example/careers",
      fetch: async () =>
        htmlResponse(`
          <a href="/jobs/frontend-engineer">Frontend Engineer Intern</a>
          <a href="/about">About Atlas</a>
          <a href="/jobs/data-analyst">Data Analyst</a>
        `),
    });

    const listings = await collect(connector.search({ keywords: ["frontend"] }));

    expect(listings).toEqual([
      {
        sourceId: "atlas:https://atlas.example/jobs/frontend-engineer",
        platform: "company-career-page",
        url: "https://atlas.example/jobs/frontend-engineer",
        title: "Frontend Engineer Intern",
        company: "Atlas",
        location: "Location unknown",
        description: "Frontend Engineer Intern",
        rawHtml: undefined,
        salary: undefined,
        postedDate: undefined,
      },
    ]);
  });
});

async function collect<T>(items: AsyncGenerator<T>): Promise<T[]> {
  const collected: T[] = [];
  for await (const item of items) {
    collected.push(item);
  }

  return collected;
}

function htmlResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
