import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import { WorkflowEngine } from "../orchestrator/workflow-engine.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { loadPluginFromDirectory } from "./plugin-loader.js";

describe("plugin loader", () => {
  it("loads a manifest-scoped plugin module with optional SHA-256 integrity", async () => {
    const pluginDir = await mkdtemp(join(tmpdir(), "careercaveman-plugin-"));

    try {
      await writeFile(
        join(pluginDir, "manifest.json"),
        JSON.stringify({
          name: "example-connector",
          version: "1.0.0",
          type: "job-connector",
          entry: "./dist/index.mjs",
          permissions: ["network"],
        }),
        "utf8",
      );
      await mkdir(join(pluginDir, "dist"));
      const moduleSource = `
export function createPlugin(manifest) {
  return {
    manifest,
    async initialize(context) {
      context.eventBus.emit("workflow.started", { workflowId: manifest.name, startedAt: new Date("2026-05-28T00:00:00Z") });
    },
    async destroy() {},
    async healthCheck() {
      return { ok: true, message: "ready" };
    },
  };
}
`;
      const entryPath = join(pluginDir, "dist/index.mjs");
      await writeFile(entryPath, moduleSource, "utf8");
      const integrity = createHash("sha256").update(await readFile(entryPath)).digest("hex");

      const plugin = await loadPluginFromDirectory({
        rootDir: pluginDir,
        integrity: { algorithm: "sha256", value: integrity },
      });
      const events: Array<CareerEventMap["workflow.started"]> = [];
      const eventBus = new EventBus<CareerEventMap>();
      eventBus.on("workflow.started", (event) => events.push(event));

      await plugin.initialize({
        eventBus,
        workflowEngine: new WorkflowEngine(eventBus),
        env: {},
      });

      expect(plugin.manifest.name).toBe("example-connector");
      expect(await plugin.healthCheck()).toEqual({ ok: true, message: "ready" });
      expect(events).toEqual([
        {
          workflowId: "example-connector",
          startedAt: new Date("2026-05-28T00:00:00Z"),
        },
      ]);
    } finally {
      await rm(pluginDir, { recursive: true, force: true });
    }
  });

  it("rejects plugin entries that escape the plugin directory", async () => {
    const pluginDir = await mkdtemp(join(tmpdir(), "careercaveman-plugin-"));

    try {
      await writeFile(
        join(pluginDir, "manifest.json"),
        JSON.stringify({
          name: "bad-connector",
          version: "1.0.0",
          type: "job-connector",
          entry: "../bad.mjs",
          permissions: ["network"],
        }),
        "utf8",
      );

      await expect(loadPluginFromDirectory({ rootDir: pluginDir })).rejects.toThrow(
        "Plugin path escapes the plugin directory",
      );
    } finally {
      await rm(pluginDir, { recursive: true, force: true });
    }
  });
});
