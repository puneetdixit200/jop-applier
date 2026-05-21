import { describe, expect, it } from "vitest";
import { deduplicateListings } from "./deduplicator.js";
import type { RawJobListing } from "./connectors/connector-interface.js";

const baseListing: RawJobListing = {
  sourceId: "1",
  platform: "linkedin",
  url: "https://jobs.example.com/1",
  title: "Frontend Engineer",
  company: "Northstar Labs",
  location: "Remote",
};

describe("deduplicateListings", () => {
  it("keeps unique listings by platform and source id", () => {
    const listings = [
      baseListing,
      { ...baseListing, sourceId: "2", title: "Backend Engineer", url: "https://jobs.example.com/2" },
      { ...baseListing, sourceId: "1", url: "https://jobs.example.com/duplicate" },
    ];

    expect(deduplicateListings(listings).map((listing) => listing.url)).toEqual([
      "https://jobs.example.com/1",
      "https://jobs.example.com/2",
    ]);
  });

  it("falls back to normalized title and company when source id is missing", () => {
    const listings = [
      { ...baseListing, sourceId: "", title: "Frontend Engineer", company: "Northstar Labs" },
      { ...baseListing, sourceId: "", title: " frontend   engineer ", company: "northstar labs" },
      { ...baseListing, sourceId: "", title: "Backend Engineer", company: "Northstar Labs" },
    ];

    expect(deduplicateListings(listings).map((listing) => listing.title.trim())).toEqual([
      "Frontend Engineer",
      "Backend Engineer",
    ]);
  });
});
