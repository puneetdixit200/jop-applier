import { describe, expect, it } from "vitest";
import {
  defaultProspectingSettings,
  prospectingSettingsFromStoredValue,
  prospectingSettingsToStoredValue,
} from "./prospecting-settings";

describe("prospecting settings", () => {
  it("serializes funding source, enrichment, and rate controls for the sidecar", () => {
    expect(
      prospectingSettingsToStoredValue({
        ...defaultProspectingSettings,
        sourceEntrackr: true,
        crunchbaseApiKey: " cb-key ",
        hunterApiKey: "hunter-key",
        includeLinkedIn: true,
        maxContacts: 5,
      }),
    ).toEqual({
      minRelevanceScore: 65,
      sources: {
        inc42: true,
        yourstory: true,
        techcrunch: true,
        entrackr: true,
        vccircle: false,
        crunchbaseApiKey: "cb-key",
      },
      enrichment: {
        includeWebsite: true,
        includeLinkedIn: true,
        maxContacts: 5,
        hunterApiKey: "hunter-key",
      },
    });
  });

  it("loads stored prospecting config with defaults for absent values", () => {
    expect(
      prospectingSettingsFromStoredValue({
        minRelevanceScore: 75,
        sources: {
          inc42: false,
          crunchbaseApiKey: "cb-key",
        },
        enrichment: {
          includeWebsite: false,
          apolloApiKey: "apollo-key",
          maxContacts: 4,
        },
      }),
    ).toEqual({
      ...defaultProspectingSettings,
      sourceInc42: false,
      crunchbaseApiKey: "cb-key",
      includeWebsite: false,
      apolloApiKey: "apollo-key",
      minRelevanceScore: 75,
      maxContacts: 4,
    });
  });
});
