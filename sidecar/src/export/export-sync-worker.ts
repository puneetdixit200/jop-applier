import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type ExportSyncPayloadInput = {
  applications: Array<Record<string, unknown>>;
  analytics: Record<string, unknown> | null;
};

export type ExportSyncPayload = ExportSyncPayloadInput & {
  generatedAt: string;
};

export type ExportSyncResult = {
  recordsWritten: number;
  externalUrl: string | null;
};

export type ExporterPlugin = {
  id: string;
  name: string;
  isEnabled: boolean;
  sync: (payload: ExportSyncPayload) => Promise<ExportSyncResult>;
};

export type ExportRunRecord = {
  exporterId: string;
  exporterName: string;
  status: "completed" | "failed";
  recordsWritten: number;
  externalUrl: string | null;
  syncedAt: string;
  error?: string;
};

export type ExportSyncWorkerDependencies = {
  loadExportPayload: () => Promise<ExportSyncPayloadInput>;
  listExporters: () => Promise<ExporterPlugin[]>;
  saveExportRun: (run: ExportRunRecord) => Promise<void>;
};

export type ExportSyncWorkerOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
};

export type ExportSyncWorkerResult = {
  exporters: number;
  succeeded: number;
  failed: number;
  skipped: number;
  recordsWritten: number;
};

export async function runExportSyncWorker(
  dependencies: ExportSyncWorkerDependencies,
  options: ExportSyncWorkerOptions,
): Promise<ExportSyncWorkerResult> {
  const [payloadInput, exporters] = await Promise.all([
    dependencies.loadExportPayload(),
    dependencies.listExporters(),
  ]);
  const payload = {
    generatedAt: options.now.toISOString(),
    ...payloadInput,
  };
  const result: ExportSyncWorkerResult = {
    exporters: exporters.length,
    succeeded: 0,
    failed: 0,
    skipped: exporters.filter((exporter) => !exporter.isEnabled).length,
    recordsWritten: 0,
  };

  for (const exporter of exporters.filter((exporter) => exporter.isEnabled)) {
    try {
      const syncResult = await exporter.sync(payload);
      const run = {
        exporterId: exporter.id,
        exporterName: exporter.name,
        status: "completed" as const,
        recordsWritten: syncResult.recordsWritten,
        externalUrl: syncResult.externalUrl,
        syncedAt: options.now.toISOString(),
      };
      await dependencies.saveExportRun(run);

      result.succeeded += 1;
      result.recordsWritten += syncResult.recordsWritten;
      options.eventBus?.emit("export.synced", {
        exporterId: exporter.id,
        exporterName: exporter.name,
        recordsWritten: syncResult.recordsWritten,
        externalUrl: syncResult.externalUrl,
        syncedAt: options.now,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await dependencies.saveExportRun({
        exporterId: exporter.id,
        exporterName: exporter.name,
        status: "failed",
        recordsWritten: 0,
        externalUrl: null,
        syncedAt: options.now.toISOString(),
        error: reason,
      });

      result.failed += 1;
      options.eventBus?.emit("export.failed", {
        exporterId: exporter.id,
        exporterName: exporter.name,
        reason,
        failedAt: options.now,
      });
    }
  }

  return result;
}
