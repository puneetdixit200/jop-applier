import type { SettingValue } from "./tauri-api";

const CUSTOM_JSON_FEED_ID = "custom-json-feed";

export type DiscoverySettings = {
  searchKeywords: string;
  searchLocation: string;
  remoteOnly: boolean;
  portalLinkedIn: boolean;
  portalIndeed: boolean;
  portalInternshala: boolean;
  portalNaukri: boolean;
  portalWellfound: boolean;
  feedSourceUrl: string;
  feedSourcePlatform: string;
  feedSourceName: string;
  greenhouseBoardToken: string;
  leverCompany: string;
  workdayTenant: string;
  workdaySite: string;
  bambooHrSubdomain: string;
  icimsSearchUrl: string;
  icimsCompany: string;
  careerPageUrl: string;
  careerPageCompany: string;
};

export type SerializedDiscoverySettings = {
  searchQueries: Array<Record<string, unknown>>;
  portalSources: Array<Record<string, unknown>>;
  feedSources: Array<Record<string, unknown>>;
  atsSources: Array<Record<string, unknown>>;
  careerPageSources: Array<Record<string, unknown>>;
};

export const defaultDiscoverySettings: DiscoverySettings = {
  searchKeywords: "React, TypeScript",
  searchLocation: "Remote",
  remoteOnly: true,
  portalLinkedIn: false,
  portalIndeed: false,
  portalInternshala: false,
  portalNaukri: false,
  portalWellfound: false,
  feedSourceUrl: "",
  feedSourcePlatform: "custom",
  feedSourceName: "Custom JSON feed",
  greenhouseBoardToken: "",
  leverCompany: "",
  workdayTenant: "",
  workdaySite: "",
  bambooHrSubdomain: "",
  icimsSearchUrl: "",
  icimsCompany: "",
  careerPageUrl: "",
  careerPageCompany: "",
};

export function discoverySettingsFromStoredValues(
  searchQueriesValue: SettingValue | undefined | null,
  feedSourcesValue: SettingValue | undefined | null,
  atsSourcesValue: SettingValue | undefined | null = null,
  careerPageSourcesValue: SettingValue | undefined | null = null,
  portalSourcesValue: SettingValue | undefined | null = null,
  fallback: DiscoverySettings = defaultDiscoverySettings,
): DiscoverySettings {
  const searchQuery = firstSearchQuery(searchQueriesValue);
  const portalSources = portalSourcesFromStoredValue(portalSourcesValue);
  const feedSource = firstFeedSource(feedSourcesValue);
  const greenhouseSource = firstAtsSource(atsSourcesValue, "greenhouse");
  const leverSource = firstAtsSource(atsSourcesValue, "lever");
  const workdaySource = firstAtsSource(atsSourcesValue, "workday");
  const bambooHrSource = firstAtsSource(atsSourcesValue, "bamboohr");
  const icimsSource = firstAtsSource(atsSourcesValue, "icims");
  const careerPageSource = firstCareerPageSource(careerPageSourcesValue);
  const hasStoredSearchQueries = Array.isArray(searchQueriesValue);
  const hasStoredFeedSources = Array.isArray(feedSourcesValue);
  const hasStoredAtsSources = Array.isArray(atsSourcesValue);
  const hasStoredCareerPageSources = Array.isArray(careerPageSourcesValue);

  return {
    searchKeywords: searchQuery
      ? searchQuery.keywords.map((keyword) => keyword.trim()).filter(Boolean).join(", ")
      : hasStoredSearchQueries
        ? ""
        : fallback.searchKeywords,
    searchLocation: textOrFallback(searchQuery?.location, fallback.searchLocation),
    remoteOnly: typeof searchQuery?.remote === "boolean" ? searchQuery.remote : fallback.remoteOnly,
    portalLinkedIn: portalSources.has("linkedin") || (!hasStoredSearchQueries && fallback.portalLinkedIn),
    portalIndeed: portalSources.has("indeed") || (!hasStoredSearchQueries && fallback.portalIndeed),
    portalInternshala:
      portalSources.has("internshala") || (!hasStoredSearchQueries && fallback.portalInternshala),
    portalNaukri: portalSources.has("naukri") || (!hasStoredSearchQueries && fallback.portalNaukri),
    portalWellfound:
      portalSources.has("wellfound") || (!hasStoredSearchQueries && fallback.portalWellfound),
    feedSourceUrl: feedSource?.url ?? (hasStoredFeedSources ? "" : fallback.feedSourceUrl),
    feedSourcePlatform: textOrFallback(feedSource?.platform, fallback.feedSourcePlatform),
    feedSourceName: textOrFallback(feedSource?.name, fallback.feedSourceName),
    greenhouseBoardToken:
      greenhouseSource?.boardToken ?? (hasStoredAtsSources ? "" : fallback.greenhouseBoardToken),
    leverCompany: leverSource?.company ?? (hasStoredAtsSources ? "" : fallback.leverCompany),
    workdayTenant: workdaySource?.tenant ?? (hasStoredAtsSources ? "" : fallback.workdayTenant),
    workdaySite: workdaySource?.site ?? (hasStoredAtsSources ? "" : fallback.workdaySite),
    bambooHrSubdomain:
      bambooHrSource?.subdomain ?? (hasStoredAtsSources ? "" : fallback.bambooHrSubdomain),
    icimsSearchUrl: icimsSource?.searchUrl ?? (hasStoredAtsSources ? "" : fallback.icimsSearchUrl),
    icimsCompany: textOrFallback(icimsSource?.company, fallback.icimsCompany),
    careerPageUrl: careerPageSource?.url ?? (hasStoredCareerPageSources ? "" : fallback.careerPageUrl),
    careerPageCompany: textOrFallback(careerPageSource?.company, fallback.careerPageCompany),
  };
}

export function discoverySettingsToStoredValues(
  settings: DiscoverySettings,
): SerializedDiscoverySettings {
  const keywords = splitKeywords(settings.searchKeywords);
  const feedSourceUrl = settings.feedSourceUrl.trim();
  const greenhouseBoardToken = settings.greenhouseBoardToken.trim();
  const leverCompany = settings.leverCompany.trim();
  const workdayTenant = settings.workdayTenant.trim();
  const workdaySite = settings.workdaySite.trim();
  const bambooHrSubdomain = settings.bambooHrSubdomain.trim();
  const icimsSearchUrl = settings.icimsSearchUrl.trim();
  const icimsCompany = settings.icimsCompany.trim();
  const careerPageUrl = settings.careerPageUrl.trim();
  const careerPageCompany = settings.careerPageCompany.trim();
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
  const portalSources = [
    ...(settings.portalLinkedIn ? [{ platform: "linkedin" }] : []),
    ...(settings.portalIndeed ? [{ platform: "indeed" }] : []),
    ...(settings.portalInternshala ? [{ platform: "internshala" }] : []),
    ...(settings.portalNaukri ? [{ platform: "naukri" }] : []),
    ...(settings.portalWellfound ? [{ platform: "wellfound" }] : []),
  ];
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
  const atsSources = [
    ...(greenhouseBoardToken ? [{ type: "greenhouse", boardToken: greenhouseBoardToken }] : []),
    ...(leverCompany ? [{ type: "lever", company: leverCompany }] : []),
    ...(workdayTenant && workdaySite
      ? [{ type: "workday", tenant: workdayTenant, site: workdaySite }]
      : []),
    ...(bambooHrSubdomain ? [{ type: "bamboohr", subdomain: bambooHrSubdomain }] : []),
    ...(icimsSearchUrl
      ? [
          {
            type: "icims",
            searchUrl: icimsSearchUrl,
            ...(icimsCompany ? { company: icimsCompany } : {}),
          },
        ]
      : []),
  ];
  const careerPageSources =
    careerPageUrl.length > 0
      ? [
          {
            id: sourceIdFromText(careerPageCompany || careerPageUrl, "career-page"),
            ...(careerPageCompany ? { company: careerPageCompany } : {}),
            url: careerPageUrl,
          },
        ]
      : [];

  return { searchQueries, portalSources, feedSources, atsSources, careerPageSources };
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

function portalSourcesFromStoredValue(value: SettingValue | undefined | null): Set<string> {
  if (!Array.isArray(value)) {
    return new Set();
  }

  return new Set(
    value
      .filter(isPortalSource)
      .map((source) => source.platform),
  );
}

function firstAtsSource<Type extends AtsSource["type"]>(
  value: SettingValue | undefined | null,
  type: Type,
): Extract<AtsSource, { type: Type }> | null {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.find((source): source is Extract<AtsSource, { type: Type }> =>
    isAtsSource(source, type),
  ) ?? null;
}

function firstCareerPageSource(value: SettingValue | undefined | null) {
  if (!Array.isArray(value)) {
    return null;
  }

  return value.find(isCareerPageSource) ?? null;
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

function isPortalSource(value: unknown): value is {
  platform: string;
} {
  return (
    isRecord(value) &&
    typeof value.platform === "string" &&
    ["linkedin", "indeed", "internshala", "naukri", "wellfound"].includes(value.platform)
  );
}

function isAtsSource<Type extends AtsSource["type"]>(
  value: unknown,
  type: Type,
): value is Extract<AtsSource, { type: Type }> {
  if (!isRecord(value) || value.type !== type) {
    return false;
  }
  if (type === "greenhouse") {
    return typeof value.boardToken === "string";
  }
  if (type === "lever") {
    return typeof value.company === "string";
  }
  if (type === "bamboohr") {
    return typeof value.subdomain === "string";
  }
  if (type === "icims") {
    return (
      (typeof value.searchUrl === "string" || typeof value.customerId === "string") &&
      (value.company === undefined || typeof value.company === "string")
    );
  }

  return typeof value.tenant === "string" && typeof value.site === "string";
}

type AtsSource =
  | { type: "greenhouse"; boardToken: string }
  | { type: "lever"; company: string }
  | { type: "workday"; tenant: string; site: string; baseUrl?: string }
  | { type: "bamboohr"; subdomain: string; baseUrl?: string }
  | {
      type: "icims";
      searchUrl?: string;
      customerId?: string;
      portal?: string;
      company?: string;
      apiBaseUrl?: string;
    };

function isCareerPageSource(value: unknown): value is {
  url: string;
  company?: string;
} {
  return (
    isRecord(value) &&
    typeof value.url === "string" &&
    value.url.trim().length > 0 &&
    (value.company === undefined || typeof value.company === "string")
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOrFallback(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function sourceIdFromText(value: string, fallback: string) {
  const id = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return id || fallback;
}
