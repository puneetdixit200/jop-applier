import { describe, expect, it } from "vitest";
import {
  createExportSyncDependenciesFromWorkflowInput,
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

    await expect(
      runExportSyncWorker(dependencies!, {
        now: new Date("2026-05-29T06:00:00Z"),
      }),
    ).resolves.toEqual({
      exporters: 2,
      succeeded: 2,
      failed: 0,
      skipped: 0,
      recordsWritten: 4,
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
      ],
    });
    expect(savedRuns).toHaveLength(2);
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
    ]);
  });
});
