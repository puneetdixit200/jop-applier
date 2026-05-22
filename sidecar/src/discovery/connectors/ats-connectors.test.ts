import { describe, expect, it } from "vitest";
import { BambooHrConnector } from "./bamboohr-connector.js";
import { GreenhouseConnector } from "./greenhouse-connector.js";
import { IcimsConnector } from "./icims-connector.js";
import { LeverConnector } from "./lever-connector.js";
import { WorkdayConnector } from "./workday-connector.js";

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

  it("searches Workday CXS postings and maps them to raw listings", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const connector = new WorkdayConnector({
      tenant: "northstar",
      site: "careers",
      baseUrl: "https://northstar.wd1.myworkdayjobs.com",
      fetch: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });

        return jsonResponse({
          total: 2,
          jobPostings: [
            {
              id: "wd-101",
              title: "React Platform Intern",
              externalPath: "/en-US/careers/job/Bengaluru/React-Platform-Intern_JR-101",
              locationsText: "Remote - Bengaluru",
              jobDescription:
                "<p>Build React workflow tools.</p><ul><li>React</li><li>TypeScript</li></ul>",
              postedOn: "2026-05-29T00:00:00Z",
              timeType: "Full time",
            },
            {
              id: "wd-102",
              title: "Finance Analyst",
              externalPath: "/en-US/careers/job/Mumbai/Finance-Analyst_JR-102",
              locationsText: "Mumbai",
              jobDescription: "<p>Finance role.</p>",
              timeType: "Full time",
            },
          ],
        });
      },
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(requests).toEqual([
      {
        url: "https://northstar.wd1.myworkdayjobs.com/wday/cxs/northstar/careers/jobs",
        body: {
          appliedFacets: {},
          limit: 50,
          offset: 0,
          searchText: "React",
        },
      },
    ]);
    expect(listings).toEqual([
      {
        sourceId: "wd-101",
        platform: "workday",
        url: "https://northstar.wd1.myworkdayjobs.com/en-US/careers/job/Bengaluru/React-Platform-Intern_JR-101",
        title: "React Platform Intern",
        company: "northstar",
        location: "Remote - Bengaluru",
        description: "Build React workflow tools. React TypeScript",
        rawHtml:
          "<p>Build React workflow tools.</p><ul><li>React</li><li>TypeScript</li></ul>",
        postedDate: new Date("2026-05-29T00:00:00Z"),
      },
    ]);
    await expect(
      connector.getJobDetails(
        "https://northstar.wd1.myworkdayjobs.com/en-US/careers/job/Bengaluru/React-Platform-Intern_JR-101",
      ),
    ).resolves.toEqual({
      url: "https://northstar.wd1.myworkdayjobs.com/en-US/careers/job/Bengaluru/React-Platform-Intern_JR-101",
      description: "Build React workflow tools. React TypeScript",
      requirements: ["React", "TypeScript"],
      rawHtml: "<p>Build React workflow tools.</p><ul><li>React</li><li>TypeScript</li></ul>",
    });
  });

  it("searches BambooHR public career listings and maps them to raw listings", async () => {
    const requestedUrls: string[] = [];
    const connector = new BambooHrConnector({
      subdomain: "northstar",
      fetch: async (url) => {
        requestedUrls.push(String(url));
        return jsonResponse({
          result: [
            {
              id: 404,
              jobOpeningName: "React Support Intern",
              locationLabel: "Remote",
              departmentLabel: "Engineering",
              employmentStatus: "Internship",
              datePosted: "2026-05-29T00:00:00Z",
              description: "<p>Support React applicants.</p><ul><li>React</li><li>TypeScript</li></ul>",
            },
            {
              id: 405,
              jobOpeningName: "Office Manager",
              locationLabel: "Mumbai",
              description: "<p>Office coordination.</p>",
            },
          ],
        });
      },
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(requestedUrls).toEqual(["https://northstar.bamboohr.com/careers/list"]);
    expect(listings).toEqual([
      {
        sourceId: "404",
        platform: "bamboohr",
        url: "https://northstar.bamboohr.com/careers/404",
        title: "React Support Intern",
        company: "northstar",
        location: "Remote",
        description: "Support React applicants. React TypeScript",
        rawHtml: "<p>Support React applicants.</p><ul><li>React</li><li>TypeScript</li></ul>",
        postedDate: new Date("2026-05-29T00:00:00Z"),
      },
    ]);
    await expect(connector.getJobDetails("https://northstar.bamboohr.com/careers/404"))
      .resolves.toEqual({
        url: "https://northstar.bamboohr.com/careers/404",
        description: "Support React applicants. React TypeScript",
        requirements: ["React", "TypeScript"],
        rawHtml: "<p>Support React applicants.</p><ul><li>React</li><li>TypeScript</li></ul>",
      });
  });

  it("searches iCIMS public career pages and maps them to raw listings", async () => {
    const requestedUrls: string[] = [];
    const connector = new IcimsConnector({
      searchUrl: "https://northstar.icims.com/jobs/search",
      company: "Northstar Labs",
      fetch: async (url) => {
        const requestUrl = String(url);
        requestedUrls.push(requestUrl);

        if (requestUrl === "https://northstar.icims.com/jobs/search?ss=1&searchKeyword=React") {
          return htmlResponse(`
            <a href="/jobs/501/react-platform-intern/job">React Platform Intern</a>
            <a href="/jobs/502/finance-analyst/job">Finance Analyst</a>
          `);
        }
        if (requestUrl === "https://northstar.icims.com/jobs/501/react-platform-intern/job") {
          return htmlResponse(`
            <h1>React Platform Intern</h1>
            <span class="job-location">Remote - Bengaluru</span>
            <section><p>Build React tooling.</p><ul><li>React</li><li>Node.js</li></ul></section>
          `);
        }
        if (requestUrl === "https://northstar.icims.com/jobs/502/finance-analyst/job") {
          return htmlResponse(`
            <h1>Finance Analyst</h1>
            <span class="job-location">Mumbai</span>
            <p>Finance reporting.</p>
          `);
        }

        throw new Error(`unexpected fetch: ${requestUrl}`);
      },
    });

    const listings = await collect(connector.search({ keywords: ["React"], remote: true }));

    expect(requestedUrls).toEqual([
      "https://northstar.icims.com/jobs/search?ss=1&searchKeyword=React",
      "https://northstar.icims.com/jobs/501/react-platform-intern/job",
      "https://northstar.icims.com/jobs/502/finance-analyst/job",
    ]);
    expect(listings).toEqual([
      {
        sourceId: "501",
        platform: "icims",
        url: "https://northstar.icims.com/jobs/501/react-platform-intern/job",
        title: "React Platform Intern",
        company: "Northstar Labs",
        location: "Remote - Bengaluru",
        description: "React Platform Intern Remote - Bengaluru Build React tooling. React Node.js",
        rawHtml:
          "\n            <h1>React Platform Intern</h1>\n            <span class=\"job-location\">Remote - Bengaluru</span>\n            <section><p>Build React tooling.</p><ul><li>React</li><li>Node.js</li></ul></section>\n          ",
        postedDate: undefined,
      },
    ]);
    await expect(
      connector.getJobDetails("https://northstar.icims.com/jobs/501/react-platform-intern/job"),
    ).resolves.toMatchObject({
      url: "https://northstar.icims.com/jobs/501/react-platform-intern/job",
      requirements: ["React", "Node.js"],
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

function htmlResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "text/html" },
  });
}
