import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FetchLike } from "../ai/providers/http.js";
import type {
  ExporterPlugin,
  ExportSyncPayload,
  ExportSyncPayloadInput,
  ExportSyncWorkerDependencies,
} from "./export-sync-worker.js";

export type NotionExporterConfig = {
  enabled: boolean;
  apiKey: string;
  databaseId: string;
};

export type GoogleSheetsExporterConfig = {
  enabled: boolean;
  spreadsheetId: string;
  accessToken?: string;
  apiKey?: string;
  range?: string;
};

export type CsvExporterConfig = {
  enabled: boolean;
  outputPath: string;
};

export type AirtableExporterConfig = {
  enabled: boolean;
  apiKey: string;
  baseId: string;
  tableName: string;
};

export type NotionExporterFactory = (config: NotionExporterConfig) => ExporterPlugin;
export type GoogleSheetsExporterFactory = (config: GoogleSheetsExporterConfig) => ExporterPlugin;
export type CsvExporterFactory = (config: CsvExporterConfig) => ExporterPlugin;
export type AirtableExporterFactory = (config: AirtableExporterConfig) => ExporterPlugin;

export type ConfiguredExportSyncOptions = {
  fallback: ExportSyncWorkerDependencies;
  createNotionExporter?: NotionExporterFactory;
  createGoogleSheetsExporter?: GoogleSheetsExporterFactory;
  createCsvExporter?: CsvExporterFactory;
  createAirtableExporter?: AirtableExporterFactory;
};

export function createExportSyncDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredExportSyncOptions,
): ExportSyncWorkerDependencies | null {
  const exportSync = isRecord(input) && isRecord(input.exportSync) ? input.exportSync : null;
  if (!exportSync) {
    return null;
  }

  const payload = exportSyncPayload(exportSync.payload);
  const configuredExporters: ExporterPlugin[] = [];
  const notion = notionExporterConfig(exportSync.notion);
  const googleSheets = googleSheetsExporterConfig(exportSync.googleSheets);
  const csv = csvExporterConfig(exportSync.csv);
  const airtable = airtableExporterConfig(exportSync.airtable);

  if (notion) {
    configuredExporters.push(
      (options.createNotionExporter ?? createNotionExporter)(notion),
    );
  }
  if (googleSheets) {
    configuredExporters.push(
      (options.createGoogleSheetsExporter ?? createGoogleSheetsExporter)(googleSheets),
    );
  }
  if (csv) {
    configuredExporters.push(
      (options.createCsvExporter ?? createCsvExporter)(csv),
    );
  }
  if (airtable) {
    configuredExporters.push(
      (options.createAirtableExporter ?? createAirtableExporter)(airtable),
    );
  }

  if (!payload && configuredExporters.length === 0) {
    return null;
  }

  return {
    ...options.fallback,
    loadExportPayload: payload
      ? async () => payload
      : options.fallback.loadExportPayload,
    listExporters: configuredExporters.length > 0
      ? async () => configuredExporters
      : options.fallback.listExporters,
  };
}

export function createNotionExporter(
  config: NotionExporterConfig,
  fetchClient: FetchLike = fetch,
): ExporterPlugin {
  return {
    id: "notion",
    name: "Notion",
    isEnabled: config.enabled && config.apiKey.length > 0 && config.databaseId.length > 0,
    sync: async (payload) => {
      const pages = [
        ...payload.applications.map((application) => notionApplicationPage(config, application)),
        ...(payload.analytics ? [notionAnalyticsPage(config, payload)] : []),
      ];

      for (const page of pages) {
        const response = await fetchClient("https://api.notion.com/v1/pages", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify(page),
        });
        if (!response.ok) {
          throw new Error(`Notion export failed with HTTP ${response.status}`);
        }
      }

      return {
        recordsWritten: pages.length,
        externalUrl: `https://www.notion.so/${config.databaseId.replaceAll("-", "")}`,
      };
    },
  };
}

export function createGoogleSheetsExporter(
  config: GoogleSheetsExporterConfig,
  fetchClient: FetchLike = fetch,
): ExporterPlugin {
  return {
    id: "google-sheets",
    name: "Google Sheets",
    isEnabled: config.enabled && config.spreadsheetId.length > 0,
    sync: async (payload) => {
      const authQuery = config.apiKey ? `&key=${encodeURIComponent(config.apiKey)}` : "";
      const range = encodeURIComponent(config.range ?? "Applications!A1");
      const response = await fetchClient(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
          config.spreadsheetId,
        )}/values/${range}:append?valueInputOption=USER_ENTERED${authQuery}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.accessToken ? { Authorization: `Bearer ${config.accessToken}` } : {}),
          },
          body: JSON.stringify({
            values: googleSheetsRows(payload),
          }),
        },
      );
      if (!response.ok) {
        throw new Error(`Google Sheets export failed with HTTP ${response.status}`);
      }

      return {
        recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
        externalUrl: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`,
      };
    },
  };
}

export function createCsvExporter(config: CsvExporterConfig): ExporterPlugin {
  return {
    id: "csv",
    name: "CSV",
    isEnabled: config.enabled && config.outputPath.trim().length > 0,
    sync: async (payload) => {
      await mkdir(dirname(config.outputPath), { recursive: true });
      await writeFile(config.outputPath, csvRows(payload), "utf8");

      return {
        recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
        externalUrl: `file://${config.outputPath}`,
      };
    },
  };
}

export function createAirtableExporter(
  config: AirtableExporterConfig,
  fetchClient: FetchLike = fetch,
): ExporterPlugin {
  return {
    id: "airtable",
    name: "Airtable",
    isEnabled:
      config.enabled &&
      config.apiKey.length > 0 &&
      config.baseId.length > 0 &&
      config.tableName.length > 0,
    sync: async (payload) => {
      const records = airtableRecords(payload);
      if (records.length === 0) {
        return {
          recordsWritten: 0,
          externalUrl: `https://airtable.com/${config.baseId}`,
        };
      }

      for (const batch of chunks(records, 10)) {
        const response = await fetchClient(
          `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(
            config.tableName,
          )}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ records: batch }),
          },
        );
        if (!response.ok) {
          throw new Error(`Airtable export failed with HTTP ${response.status}`);
        }
      }

      return {
        recordsWritten: records.length,
        externalUrl: `https://airtable.com/${config.baseId}`,
      };
    },
  };
}

function exportSyncPayload(value: unknown): ExportSyncPayloadInput | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    applications: Array.isArray(value.applications)
      ? value.applications.filter(isRecord)
      : [],
    analytics: value.analytics === null || value.analytics === undefined
      ? null
      : isRecord(value.analytics)
        ? value.analytics
        : null,
  };
}

function notionExporterConfig(value: unknown): NotionExporterConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    enabled: booleanValue(value.enabled),
    apiKey: nonEmptyString(value.apiKey) ?? "",
    databaseId: nonEmptyString(value.databaseId) ?? "",
  };
}

function googleSheetsExporterConfig(value: unknown): GoogleSheetsExporterConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    enabled: booleanValue(value.enabled),
    spreadsheetId: nonEmptyString(value.spreadsheetId) ?? "",
    accessToken: nonEmptyString(value.accessToken) ?? undefined,
    apiKey: nonEmptyString(value.apiKey) ?? undefined,
    range: nonEmptyString(value.range) ?? undefined,
  };
}

function csvExporterConfig(value: unknown): CsvExporterConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    enabled: booleanValue(value.enabled),
    outputPath: nonEmptyString(value.outputPath) ?? "",
  };
}

function airtableExporterConfig(value: unknown): AirtableExporterConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    enabled: booleanValue(value.enabled),
    apiKey: nonEmptyString(value.apiKey) ?? "",
    baseId: nonEmptyString(value.baseId) ?? "",
    tableName: nonEmptyString(value.tableName) ?? "",
  };
}

function notionApplicationPage(
  config: NotionExporterConfig,
  application: Record<string, unknown>,
) {
  const companyName = textValue(application.companyName, "Unknown company");
  const jobTitle = textValue(application.jobTitle, textValue(application.roleTitle, "Unknown role"));
  const status = textValue(application.status, "unknown");

  return {
    parent: { database_id: config.databaseId },
    properties: {
      Name: notionTitle(`${companyName} - ${jobTitle}`),
      Company: notionRichText(companyName),
      Role: notionRichText(jobTitle),
      Status: { select: { name: status } },
      "Application ID": notionRichText(textValue(application.id, "")),
    },
  };
}

function notionAnalyticsPage(config: NotionExporterConfig, payload: ExportSyncPayload) {
  return {
    parent: { database_id: config.databaseId },
    properties: {
      Name: notionTitle(`Analytics snapshot ${payload.generatedAt}`),
      Company: notionRichText("Analytics"),
      Role: notionRichText("Snapshot"),
      Status: { select: { name: "analytics" } },
      "Application ID": notionRichText(`analytics-${payload.generatedAt}`),
    },
    children: [
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [
            {
              type: "text",
              text: {
                content: JSON.stringify(payload.analytics),
              },
            },
          ],
        },
      },
    ],
  };
}

function notionTitle(content: string) {
  return {
    title: [
      {
        text: { content },
      },
    ],
  };
}

function notionRichText(content: string) {
  return {
    rich_text: [
      {
        text: { content },
      },
    ],
  };
}

function googleSheetsRows(payload: ExportSyncPayload): string[][] {
  const rows = [
    [
      "Generated At",
      "Application ID",
      "Company",
      "Role",
      "Status",
      "Submitted At",
      "Response Type",
      "Follow-up Count",
    ],
    ...payload.applications.map((application) => [
      payload.generatedAt,
      textValue(application.id, ""),
      textValue(application.companyName, ""),
      textValue(application.jobTitle, textValue(application.roleTitle, "")),
      textValue(application.status, ""),
      textValue(application.submittedAt, ""),
      textValue(application.responseType, ""),
      textValue(application.followUpCount, "0"),
    ]),
  ];

  if (payload.analytics) {
    rows.push([
      payload.generatedAt,
      "analytics",
      "",
      "Analytics Snapshot",
      JSON.stringify(payload.analytics),
      "",
      "",
      "",
    ]);
  }

  return rows;
}

function csvRows(payload: ExportSyncPayload): string {
  return `${googleSheetsRows(payload).map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string): string {
  if (!/[",\n\r]/.test(value)) {
    return value;
  }

  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function airtableRecords(payload: ExportSyncPayload) {
  return [
    ...payload.applications.map((application) => ({
      fields: {
        "Generated At": payload.generatedAt,
        "Application ID": textValue(application.id, ""),
        Company: textValue(application.companyName, ""),
        Role: textValue(application.jobTitle, textValue(application.roleTitle, "")),
        Status: textValue(application.status, ""),
        "Submitted At": textValue(application.submittedAt, ""),
        "Response Type": textValue(application.responseType, ""),
        "Follow-up Count": Number(textValue(application.followUpCount, "0")),
      },
    })),
    ...(payload.analytics
      ? [
          {
            fields: {
              "Generated At": payload.generatedAt,
              "Application ID": "analytics",
              Company: "",
              Role: "Analytics Snapshot",
              Status: JSON.stringify(payload.analytics),
              "Submitted At": "",
              "Response Type": "",
              "Follow-up Count": 0,
            },
          },
        ]
      : []),
  ];
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function textValue(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return fallback;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function booleanValue(value: unknown): boolean {
  return typeof value === "boolean" ? value : false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
