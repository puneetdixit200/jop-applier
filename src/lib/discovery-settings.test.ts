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
    );

    expect(settings).toEqual({
      searchKeywords: "react, typescript",
      searchLocation: "Remote",
      remoteOnly: true,
      feedSourceUrl: "https://feeds.example/jobs.json",
      feedSourcePlatform: "greenhouse",
      feedSourceName: "Curated internships",
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
    });

    expect(values).toEqual({ searchQueries: [], feedSources: [] });
  });
});
