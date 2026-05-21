import type { SettingValue } from "./tauri-api";

const CUSTOM_JSON_FEED_ID = "custom-json-feed";

export type DiscoverySettings = {
  searchKeywords: string;
  searchLocation: string;
  remoteOnly: boolean;
  feedSourceUrl: string;
  feedSourcePlatform: string;
  feedSourceName: string;
};

export type SerializedDiscoverySettings = {
  searchQueries: Array<Record<string, unknown>>;
  feedSources: Array<Record<string, unknown>>;
};

export const defaultDiscoverySettings: DiscoverySettings = {
  searchKeywords: "React, TypeScript",
  searchLocation: "Remote",
  remoteOnly: true,
  feedSourceUrl: "",
  feedSourcePlatform: "custom",
  feedSourceName: "Custom JSON feed",
};

export function discoverySettingsFromStoredValues(
  searchQueriesValue: SettingValue | undefined | null,
  feedSourcesValue: SettingValue | undefined | null,
  fallback: DiscoverySettings = defaultDiscoverySettings,
): DiscoverySettings {
  const searchQuery = firstSearchQuery(searchQueriesValue);
  const feedSource = firstFeedSource(feedSourcesValue);
  const hasStoredSearchQueries = Array.isArray(searchQueriesValue);
  const hasStoredFeedSources = Array.isArray(feedSourcesValue);

  return {
    searchKeywords: searchQuery
      ? searchQuery.keywords.map((keyword) => keyword.trim()).filter(Boolean).join(", ")
      : hasStoredSearchQueries
        ? ""
        : fallback.searchKeywords,
    searchLocation: textOrFallback(searchQuery?.location, fallback.searchLocation),
    remoteOnly: typeof searchQuery?.remote === "boolean" ? searchQuery.remote : fallback.remoteOnly,
    feedSourceUrl: feedSource?.url ?? (hasStoredFeedSources ? "" : fallback.feedSourceUrl),
    feedSourcePlatform: textOrFallback(feedSource?.platform, fallback.feedSourcePlatform),
    feedSourceName: textOrFallback(feedSource?.name, fallback.feedSourceName),
  };
}

export function discoverySettingsToStoredValues(
  settings: DiscoverySettings,
): SerializedDiscoverySettings {
  const keywords = splitKeywords(settings.searchKeywords);
  const feedSourceUrl = settings.feedSourceUrl.trim();
  const searchQueries =
    keywords.length > 0
      ? [
          {
            keywords,
            ...(settings.searchLocation.trim() ? { location: settings.searchLocation.trim() } : {}),
            remote: settings.remoteOnly,
          },
        ]
      : [];
  const feedSources =
    feedSourceUrl.length > 0
      ? [
          {
            id: CUSTOM_JSON_FEED_ID,
            name: textOrFallback(settings.feedSourceName, defaultDiscoverySettings.feedSourceName),
            platform: textOrFallback(settings.feedSourcePlatform, defaultDiscoverySettings.feedSourcePlatform),
            url: feedSourceUrl,
          },
        ]
      : [];

  return { searchQueries, feedSources };
}

function splitKeywords(value: string) {
  return value
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}

function firstSearchQuery(value: SettingValue | undefined | null) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.find(isSearchQuery) ?? null;
}

function firstFeedSource(value: SettingValue | undefined | null) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.find(isFeedSource) ?? null;
}

function isSearchQuery(value: unknown): value is {
  keywords: string[];
  location?: string;
  remote?: boolean;
} {
  return (
    isRecord(value) &&
    Array.isArray(value.keywords) &&
    value.keywords.every((keyword) => typeof keyword === "string") &&
    (value.location === undefined || typeof value.location === "string") &&
    (value.remote === undefined || typeof value.remote === "boolean")
  );
}

function isFeedSource(value: unknown): value is {
  url: string;
  platform?: string;
  name?: string;
} {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.trim().length > 0 &&
    (value.platform === undefined || typeof value.platform === "string") &&
    (value.name === undefined || typeof value.name === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrFallback(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}
