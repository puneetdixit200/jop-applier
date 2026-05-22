import { describe, expect, it } from "vitest";
import { JobPortalConnector, searchUrlForPortal } from "./job-portal-connector.js";

describe("job portal connector", () => {
  it("builds platform search URLs from discovery queries", () => {
    expect(
      searchUrlForPortal(
        { platform: "linkedin" },
        { keywords: ["React", "TypeScript"], location: "Bengaluru", remote: true },
      ),
    ).toBe(
      "https://www.linkedin.com/jobs/search/?keywords=React+TypeScript&location=Bengaluru&f_WT=2",
    );
    expect(
      searchUrlForPortal(
        { platform: "indeed" },
        { keywords: ["React"], location: "Remote", remote: true },
      ),
    ).toBe("https://www.indeed.com/jobs?q=React&l=Remote&remotejob=1");
    expect(
      searchUrlForPortal(
        { platform: "linkedin", searchUrl: "https://jobs.example/search?q={keywords}&l={location}" },
        { keywords: ["React"], location: "Remote" },
      ),
    ).toBe("https://jobs.example/search?q=React&l=Remote");
  });

  it("parses JSON-LD jobs from public portal search pages", async () => {
    const connector = new JobPortalConnector({
      platform: "linkedin",
      fetch: async () =>
        htmlResponse(`
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "JobPosting",
              "identifier": "li-101",
              "title": "React Platform Engineer",
              "url": "https://www.linkedin.com/jobs/view/101",
              "datePosted": "2026-05-30T00:00:00Z",
              "description": "<p>Build React workflows.</p><ul><li>React</li><li>TypeScript</li></ul>",
              "hiringOrganization": { "name": "Northstar Labs" },
              "jobLocationType": "TELECOMMUTE"
            }
          </script>
        `),
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(listings).toEqual([
      {
        sourceId: "linkedin:li-101",
        platform: "linkedin",
        url: "https://www.linkedin.com/jobs/view/101",
        title: "React Platform Engineer",
        company: "Northstar Labs",
        location: "Remote",
        description: "Build React workflows. React TypeScript",
        rawHtml:
          "<p>Build React workflows.</p><ul><li>React</li><li>TypeScript</li></ul>",
        postedDate: new Date("2026-05-30T00:00:00Z"),
      },
    ]);
    await expect(connector.getJobDetails("https://www.linkedin.com/jobs/view/101"))
      .resolves.toEqual({
        url: "https://www.linkedin.com/jobs/view/101",
        description: "Build React workflows. React TypeScript",
        requirements: ["React", "TypeScript"],
        rawHtml: "<p>Build React workflows.</p><ul><li>React</li><li>TypeScript</li></ul>",
      });
  });

  it("falls back to portal-specific job links when JSON-LD is absent", async () => {
    const requestedUrls: string[] = [];
    const connector = new JobPortalConnector({
      platform: "indeed",
      searchUrl: "https://indeed.example/jobs?q={keywords}",
      fetch: async (url) => {
        const requestUrl = String(url);
        requestedUrls.push(requestUrl);
        if (requestUrl === "https://indeed.example/jobs?q=Node") {
          return htmlResponse(`
            <a href="/viewjob?jk=abc123">Node Backend Engineer</a>
            <a href="/companies/example">Example company</a>
          `);
        }
        if (requestUrl === "https://indeed.example/viewjob?jk=abc123") {
          return htmlResponse("<p>Node backend role.</p><ul><li>Node.js</li></ul>");
        }

        throw new Error(`unexpected fetch: ${requestUrl}`);
      },
    });

    const listings = await collect(connector.search({ keywords: ["Node"] }));

    expect(listings).toEqual([
      {
        sourceId: "indeed:abc123",
        platform: "indeed",
        url: "https://indeed.example/viewjob?jk=abc123",
        title: "Node Backend Engineer",
        company: "Indeed",
        location: "Location unknown",
        description: "Node Backend Engineer",
        rawHtml: undefined,
        postedDate: undefined,
      },
    ]);
    await expect(connector.getJobDetails("https://indeed.example/viewjob?jk=abc123"))
      .resolves.toMatchObject({
        description: "Node backend role. Node.js",
        requirements: ["Node.js"],
      });
    expect(requestedUrls).toEqual([
      "https://indeed.example/jobs?q=Node",
      "https://indeed.example/viewjob?jk=abc123",
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
