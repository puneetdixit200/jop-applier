import type { RawJobListing } from "./connectors/connector-interface.js";

export function deduplicateListings(listings: RawJobListing[]): RawJobListing[] {
  const seen = new Set<string>();
  const unique: RawJobListing[] = [];

  for (const listing of listings) {
    const keys = listingKeys(listing);
    if (keys.some((key) => seen.has(key))) {
      continue;
    }
    for (const key of keys) {
      seen.add(key);
    }
    unique.push(listing);
  }

  return unique;
}

function listingKeys(listing: RawJobListing): string[] {
  const keys = [`title-company:${normalize(listing.title)}:${normalize(listing.company)}`];
  const normalizedSourceId = normalize(listing.sourceId);
  if (normalizedSourceId.length > 0) {
    keys.push(`source:${normalize(listing.platform)}:${normalizedSourceId}`);
  }

  return keys;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
