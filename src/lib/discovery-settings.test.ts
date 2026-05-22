import { describe, expect, it } from "vitest";
import {
  discoverySettingsFromStoredValues,
  discoverySettingsToStoredValues,
} from "./discovery-settings";

describe("discovery settings", () => {
  it("maps persisted search queries and feed sources into form settings", () => {
    const settings = discoverySettingsFromStoredValues(
      [{ keywords: ["react", "typescript"], location: "Remote", remote: true }],
      [
        {
          id: "custom-json-feed",
          name: "Curated internships",
          platform: "greenhouse",
          url: "https://feeds.example/jobs.json",
        },
      ],
      [
        { type: "greenhouse", boardToken: "northstar" },
        { type: "lever", company: "atlas" },
        { type: "workday", tenant: "northstar", site: "careers" },
        { type: "bamboohr", subdomain: "northstar" },
        {
          type: "icims",
          searchUrl: "https://northstar.icims.com/jobs/search",
          company: "Northstar Labs",
        },
      ],
      [
        {
          id: "northstar-careers",
          company: "Northstar Labs",
          url: "https://northstar.example/careers",
        },
      ],
    );

    expect(settings).toEqual({
      searchKeywords: "react, typescript",
      searchLocation: "Remote",
      remoteOnly: true,
      feedSourceUrl: "https://feeds.example/jobs.json",
      feedSourcePlatform: "greenhouse",
      feedSourceName: "Curated internships",
      greenhouseBoardToken: "northstar",
      leverCompany: "atlas",
      workdayTenant: "northstar",
      workdaySite: "careers",
      bambooHrSubdomain: "northstar",
      icimsSearchUrl: "https://northstar.icims.com/jobs/search",
      icimsCompany: "Northstar Labs",
      careerPageUrl: "https://northstar.example/careers",
      careerPageCompany: "Northstar Labs",
    });
  });

  it("serializes form settings into sidecar discovery inputs", () => {
    const values = discoverySettingsToStoredValues({
      searchKeywords: "react, typescript",
      searchLocation: "Remote",
      remoteOnly: true,
      feedSourceUrl: "https://feeds.example/jobs.json",
      feedSourcePlatform: "greenhouse",
      feedSourceName: "Curated internships",
      greenhouseBoardToken: "northstar",
      leverCompany: "atlas",
      workdayTenant: "northstar",
      workdaySite: "careers",
      bambooHrSubdomain: "northstar",
      icimsSearchUrl: "https://northstar.icims.com/jobs/search",
      icimsCompany: "Northstar Labs",
      careerPageUrl: "https://northstar.example/careers",
      careerPageCompany: "Northstar Labs",
    });

    expect(values).toEqual({
      searchQueries: [{ keywords: ["react", "typescript"], location: "Remote", remote: true }],
      feedSources: [
        {
          id: "custom-json-feed",
          name: "Curated internships",
          platform: "greenhouse",
          url: "https://feeds.example/jobs.json",
        },
      ],
      atsSources: [
        { type: "greenhouse", boardToken: "northstar" },
        { type: "lever", company: "atlas" },
        { type: "workday", tenant: "northstar", site: "careers" },
        { type: "bamboohr", subdomain: "northstar" },
        {
          type: "icims",
          searchUrl: "https://northstar.icims.com/jobs/search",
          company: "Northstar Labs",
        },
      ],
      careerPageSources: [
        {
          id: "northstar-labs",
          company: "Northstar Labs",
          url: "https://northstar.example/careers",
        },
      ],
    });
  });

  it("omits empty search queries and feed sources", () => {
    const values = discoverySettingsToStoredValues({
      searchKeywords: "  ",
      searchLocation: "Remote",
      remoteOnly: true,
      feedSourceUrl: "  ",
      feedSourcePlatform: "custom",
      feedSourceName: "Custom JSON feed",
      greenhouseBoardToken: " ",
      leverCompany: " ",
      workdayTenant: "northstar",
      workdaySite: " ",
      bambooHrSubdomain: " ",
      icimsSearchUrl: " ",
      icimsCompany: "Northstar Labs",
      careerPageUrl: " ",
      careerPageCompany: " ",
    });

    expect(values).toEqual({
      searchQueries: [],
      feedSources: [],
      atsSources: [],
      careerPageSources: [],
    });
  });
});
