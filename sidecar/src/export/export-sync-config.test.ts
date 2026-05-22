import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createAirtableExporter,
  createCsvExporter,
  createExportSyncDependenciesFromWorkflowInput,
  type AirtableExporterConfig,
  type CsvExporterConfig,
  type GoogleSheetsExporterConfig,
  type NotionExporterConfig,
} from "./export-sync-config.js";
import { runExportSyncWorker, type ExportSyncWorkerDependencies } from "./export-sync-worker.js";

const fallback: ExportSyncWorkerDependencies = {
  loadExportPayload: async () => ({
    applications: [],
    analytics: null,
  }),
  listExporters: async () => [],
  saveExportRun: async () => undefined,
};

describe("export sync config", () => {
  it("loads payload and configured Notion and Google Sheets exporters from workflow input", async () => {
    const notionConfigs: NotionExporterConfig[] = [];
    const sheetsConfigs: GoogleSheetsExporterConfig[] = [];
    const csvConfigs: CsvExporterConfig[] = [];
    const airtableConfigs: AirtableExporterConfig[] = [];
    const syncedPayloads: Array<{ exporterId: string; payload: Record<string, unknown> }> = [];
    const savedRuns: Array<Record<string, unknown>> = [];
    const dependencies = createExportSyncDependenciesFromWorkflowInput(
      {
        exportSync: {
          payload: {
            applications: [
              {
                id: "app-1",
                companyName: "Northstar Labs",
                roleTitle: "Frontend Engineer",
                status: "submitted",
              },
            ],
            analytics: {
              metrics: {
                totalApplications: 1,
                responseRate: 100,
              },
            },
          },
          notion: {
            enabled: true,
            apiKey: "secret_notion",
            databaseId: "notion-db-1",
          },
          googleSheets: {
            enabled: true,
            spreadsheetId: "sheet-1",
            accessToken: "ya29-token",
            range: "Applications!A1",
          },
          csv: {
            enabled: true,
            outputPath: "/tmp/careercaveman-applications.csv",
          },
          airtable: {
            enabled: true,
            apiKey: "pat_airtable",
            baseId: "appBase1",
            tableName: "Applications",
          },
        },
      },
      {
        fallback: {
          ...fallback,
          saveExportRun: async (run) => {
            savedRuns.push(run);
          },
        },
        createNotionExporter: (config) => {
          notionConfigs.push(config);

          return {
            id: "notion",
            name: "Notion",
            isEnabled: config.enabled,
            sync: async (payload) => {
              syncedPayloads.push({ exporterId: "notion", payload });
              return {
                recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
                externalUrl: `https://notion.example/${config.databaseId}`,
              };
            },
          };
        },
        createGoogleSheetsExporter: (config) => {
          sheetsConfigs.push(config);

          return {
            id: "google-sheets",
            name: "Google Sheets",
            isEnabled: config.enabled,
            sync: async (payload) => {
              syncedPayloads.push({ exporterId: "google-sheets", payload });
              return {
                recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
                externalUrl: `https://docs.google.com/spreadsheets/d/${config.spreadsheetId}`,
              };
            },
          };
        },
        createCsvExporter: (config) => {
          csvConfigs.push(config);

          return {
            id: "csv",
            name: "CSV",
            isEnabled: config.enabled,
            sync: async (payload) => {
              syncedPayloads.push({ exporterId: "csv", payload });
              return {
                recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
                externalUrl: `file://${config.outputPath}`,
              };
            },
          };
        },
        createAirtableExporter: (config) => {
          airtableConfigs.push(config);

          return {
            id: "airtable",
            name: "Airtable",
            isEnabled: config.enabled,
            sync: async (payload) => {
              syncedPayloads.push({ exporterId: "airtable", payload });
              return {
                recordsWritten: payload.applications.length + (payload.analytics ? 1 : 0),
                externalUrl: `https://airtable.com/${config.baseId}`,
              };
            },
          };
        },
      },
    );

    await expect(dependencies?.loadExportPayload()).resolves.toEqual({
      applications: [
        {
          id: "app-1",
          companyName: "Northstar Labs",
          roleTitle: "Frontend Engineer",
          status: "submitted",
        },
      ],
      analytics: {
        metrics: {
          totalApplications: 1,
          responseRate: 100,
        },
      },
    });
    await expect(dependencies?.listExporters()).resolves.toMatchObject([
      { id: "notion", name: "Notion", isEnabled: true },
      { id: "google-sheets", name: "Google Sheets", isEnabled: true },
      { id: "csv", name: "CSV", isEnabled: true },
      { id: "airtable", name: "Airtable", isEnabled: true },
    ]);
    expect(notionConfigs).toEqual([
      {
        enabled: true,
        apiKey: "secret_notion",
        databaseId: "notion-db-1",
      },
    ]);
    expect(sheetsConfigs).toEqual([
      {
        enabled: true,
        spreadsheetId: "sheet-1",
        accessToken: "ya29-token",
        range: "Applications!A1",
      },
    ]);
    expect(csvConfigs).toEqual([
      {
        enabled: true,
        outputPath: "/tmp/careercaveman-applications.csv",
      },
    ]);
    expect(airtableConfigs).toEqual([
      {
        enabled: true,
        apiKey: "pat_airtable",
        baseId: "appBase1",
        tableName: "Applications",
      },
    ]);

    await expect(
      runExportSyncWorker(dependencies!, {
        now: new Date("2026-05-29T06:00:00Z"),
      }),
    ).resolves.toEqual({
      exporters: 4,
      succeeded: 4,
      failed: 0,
      skipped: 0,
      recordsWritten: 8,
      runs: [
        {
          exporterId: "notion",
          exporterName: "Notion",
          status: "completed",
          recordsWritten: 2,
          externalUrl: "https://notion.example/notion-db-1",
          syncedAt: "2026-05-29T06:00:00.000Z",
        },
        {
          exporterId: "google-sheets",
          exporterName: "Google Sheets",
          status: "completed",
          recordsWritten: 2,
          externalUrl: "https://docs.google.com/spreadsheets/d/sheet-1",
          syncedAt: "2026-05-29T06:00:00.000Z",
        },
        {
          exporterId: "csv",
          exporterName: "CSV",
          status: "completed",
          recordsWritten: 2,
          externalUrl: "file:///tmp/careercaveman-applications.csv",
          syncedAt: "2026-05-29T06:00:00.000Z",
        },
        {
          exporterId: "airtable",
          exporterName: "Airtable",
          status: "completed",
          recordsWritten: 2,
          externalUrl: "https://airtable.com/appBase1",
          syncedAt: "2026-05-29T06:00:00.000Z",
        },
      ],
    });
    expect(savedRuns).toHaveLength(4);
    expect(syncedPayloads).toEqual([
      {
        exporterId: "notion",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
            },
          ],
          analytics: {
            metrics: {
              totalApplications: 1,
              responseRate: 100,
            },
          },
        },
      },
      {
        exporterId: "google-sheets",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
            },
          ],
          analytics: {
            metrics: {
              totalApplications: 1,
              responseRate: 100,
            },
          },
        },
      },
      {
        exporterId: "csv",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
            },
          ],
          analytics: {
            metrics: {
              totalApplications: 1,
              responseRate: 100,
            },
          },
        },
      },
      {
        exporterId: "airtable",
        payload: {
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar Labs",
              roleTitle: "Frontend Engineer",
              status: "submitted",
            },
          ],
          analytics: {
            metrics: {
              totalApplications: 1,
              responseRate: 100,
            },
          },
        },
      },
    ]);
  });

  it("writes local CSV exports with escaped application and analytics rows", async () => {
    const directory = await mkdtemp(join(tmpdir(), "careercaveman-export-"));
    const outputPath = join(directory, "applications.csv");

    try {
      const exporter = createCsvExporter({
        enabled: true,
        outputPath,
      });

      await expect(
        exporter.sync({
          generatedAt: "2026-05-29T06:00:00.000Z",
          applications: [
            {
              id: "app-1",
              companyName: "Northstar, Labs",
              jobTitle: "Frontend Engineer",
              status: "submitted",
              submittedAt: "2026-05-28T10:00:00.000Z",
              responseType: "positive",
              followUpCount: 1,
            },
          ],
          analytics: { totalApplications: 1 },
        }),
      ).resolves.toEqual({
        recordsWritten: 2,
        externalUrl: `file://${outputPath}`,
      });
      await expect(readFile(outputPath, "utf8")).resolves.toBe(
        [
          "Generated At,Application ID,Company,Role,Status,Submitted At,Response Type,Follow-up Count",
          "2026-05-29T06:00:00.000Z,app-1,\"Northstar, Labs\",Frontend Engineer,submitted,2026-05-28T10:00:00.000Z,positive,1",
          "2026-05-29T06:00:00.000Z,analytics,,Analytics Snapshot,\"{\"\"totalApplications\"\":1}\",,,",
          "",
        ].join("\n"),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("exports application and analytics rows to Airtable in batches", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const exporter = createAirtableExporter(
      {
        enabled: true,
        apiKey: "pat_airtable",
        baseId: "appBase1",
        tableName: "Applications",
      },
      async (url, init) => {
        requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
        return jsonResponse({ records: [] });
      },
    );

    await expect(
      exporter.sync({
        generatedAt: "2026-05-29T06:00:00.000Z",
        applications: [
          {
            id: "app-1",
            companyName: "Northstar Labs",
            jobTitle: "Frontend Engineer",
            status: "submitted",
            submittedAt: "2026-05-28T10:00:00.000Z",
            responseType: "positive",
            followUpCount: 1,
          },
        ],
        analytics: { totalApplications: 1 },
      }),
    ).resolves.toEqual({
      recordsWritten: 2,
      externalUrl: "https://airtable.com/appBase1",
    });
    expect(requests).toEqual([
      {
        url: "https://api.airtable.com/v0/appBase1/Applications",
        body: {
          records: [
            {
              fields: {
                "Generated At": "2026-05-29T06:00:00.000Z",
                "Application ID": "app-1",
                Company: "Northstar Labs",
                Role: "Frontend Engineer",
                Status: "submitted",
                "Submitted At": "2026-05-28T10:00:00.000Z",
                "Response Type": "positive",
                "Follow-up Count": 1,
              },
            },
            {
              fields: {
                "Generated At": "2026-05-29T06:00:00.000Z",
                "Application ID": "analytics",
                Company: "",
                Role: "Analytics Snapshot",
                Status: "{\"totalApplications\":1}",
                "Submitted At": "",
                "Response Type": "",
                "Follow-up Count": 0,
              },
            },
          ],
        },
      },
    ]);
  });
});

function jsonResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as Response;
}
