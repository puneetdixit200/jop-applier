export type ProspectingSettings = {
  sourceInc42: boolean;
  sourceYourStory: boolean;
  sourceTechCrunch: boolean;
  sourceEntrackr: boolean;
  sourceVcCircle: boolean;
  crunchbaseApiKey: string;
  tracxnApiKey: string;
  hunterApiKey: string;
  apolloApiKey: string;
  snovApiKey: string;
  includeWebsite: boolean;
  includeLinkedIn: boolean;
  minRelevanceScore: number;
  maxContacts: number;
};

export type StoredProspectingConfig = {
  minRelevanceScore: number;
  sources: Record<string, unknown>;
  enrichment: Record<string, unknown>;
};

export const defaultProspectingSettings: ProspectingSettings = {
  sourceInc42: true,
  sourceYourStory: true,
  sourceTechCrunch: true,
  sourceEntrackr: false,
  sourceVcCircle: false,
  crunchbaseApiKey: "",
  tracxnApiKey: "",
  hunterApiKey: "",
  apolloApiKey: "",
  snovApiKey: "",
  includeWebsite: true,
  includeLinkedIn: false,
  minRelevanceScore: 65,
  maxContacts: 3,
};

export function prospectingSettingsFromStoredValue(
  value: unknown,
  fallback: ProspectingSettings = defaultProspectingSettings,
): ProspectingSettings {
  const config = isRecord(value) ? value : {};
  const sources = isRecord(config.sources) ? config.sources : {};
  const enrichment = isRecord(config.enrichment) ? config.enrichment : {};

  return {
    sourceInc42: booleanValue(sources.inc42, fallback.sourceInc42),
    sourceYourStory: booleanValue(sources.yourstory, fallback.sourceYourStory),
    sourceTechCrunch: booleanValue(sources.techcrunch, fallback.sourceTechCrunch),
    sourceEntrackr: booleanValue(sources.entrackr, fallback.sourceEntrackr),
    sourceVcCircle: booleanValue(sources.vccircle, fallback.sourceVcCircle),
    crunchbaseApiKey: stringValue(sources.crunchbaseApiKey, fallback.crunchbaseApiKey),
    tracxnApiKey: stringValue(sources.tracxnApiKey, fallback.tracxnApiKey),
    hunterApiKey: stringValue(enrichment.hunterApiKey, fallback.hunterApiKey),
    apolloApiKey: stringValue(enrichment.apolloApiKey, fallback.apolloApiKey),
    snovApiKey: stringValue(enrichment.snovApiKey, fallback.snovApiKey),
    includeWebsite: booleanValue(enrichment.includeWebsite, fallback.includeWebsite),
    includeLinkedIn: booleanValue(enrichment.includeLinkedIn, fallback.includeLinkedIn),
    minRelevanceScore: positiveNumber(config.minRelevanceScore, fallback.minRelevanceScore),
    maxContacts: positiveInteger(enrichment.maxContacts, fallback.maxContacts),
  };
}

export function prospectingSettingsToStoredValue(
  settings: ProspectingSettings,
): StoredProspectingConfig {
  const crunchbaseApiKey = settings.crunchbaseApiKey.trim();
  const tracxnApiKey = settings.tracxnApiKey.trim();
  const hunterApiKey = settings.hunterApiKey.trim();
  const apolloApiKey = settings.apolloApiKey.trim();
  const snovApiKey = settings.snovApiKey.trim();

  return {
    minRelevanceScore: clamp(settings.minRelevanceScore, 0, 100),
    sources: {
      inc42: settings.sourceInc42,
      yourstory: settings.sourceYourStory,
      techcrunch: settings.sourceTechCrunch,
      entrackr: settings.sourceEntrackr,
      vccircle: settings.sourceVcCircle,
      ...(crunchbaseApiKey ? { crunchbaseApiKey } : {}),
      ...(tracxnApiKey ? { tracxnApiKey } : {}),
    },
    enrichment: {
      includeWebsite: settings.includeWebsite,
      includeLinkedIn: settings.includeLinkedIn,
      maxContacts: Math.max(1, Math.floor(settings.maxContacts || defaultProspectingSettings.maxContacts)),
      ...(hunterApiKey ? { hunterApiKey } : {}),
      ...(apolloApiKey ? { apolloApiKey } : {}),
      ...(snovApiKey ? { snovApiKey } : {}),
    },
  };
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
