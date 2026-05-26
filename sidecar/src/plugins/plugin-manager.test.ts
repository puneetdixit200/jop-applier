import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import { WorkflowEngine } from "../orchestrator/workflow-engine.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  PluginManager,
  parsePluginManifest,
  type Plugin,
  type PluginContext,
  type PluginManifest,
} from "./plugin-manager.js";

function manifest(overrides: Partial<PluginManifest> = {}): PluginManifest {
  return {
    name: "test-job-connector",
    version: "1.0.0",
    type: "job-connector",
    author: "community",
    description: "Connector for a test job portal",
    entry: "./dist/index.js",
    config: {
      baseUrl: { type: "string", required: true },
      apiKey: { type: "string", secret: true },
    },
    permissions: ["network", "browser"],
    compatibility: ">=1.0.0",
    ...overrides,
  };
}

function plugin(
  pluginManifest: PluginManifest,
  calls: string[],
  onInitialize?: (context: PluginContext) => void,
): Plugin {
  return {
    manifest: pluginManifest,
    initialize: async (context) => {
      calls.push(`initialize:${pluginManifest.name}`);
      onInitialize?.(context);
    },
    destroy: async () => {
      calls.push(`destroy:${pluginManifest.name}`);
    },
    healthCheck: async () => ({
      ok: true,
      message: `${pluginManifest.name} healthy`,
    }),
  };
}

describe("PluginManager", () => {
  it("parses and validates plugin manifests", () => {
    expect(
      parsePluginManifest({
        name: "my-job-connector",
        version: "1.0.0",
        type: "job-connector",
        author: "community",
        description: "Connector for XYZ job portal",
        entry: "./dist/index.js",
        config: {
          baseUrl: { type: "string", required: true },
          apiKey: { type: "string", secret: true },
        },
        permissions: ["network", "browser"],
        compatibility: ">=1.0.0",
      }),
    ).toEqual(
      manifest({
        name: "my-job-connector",
        description: "Connector for XYZ job portal",
      }),
    );

    expect(() =>
      parsePluginManifest({
        name: "bad-plugin",
        version: "1.0.0",
        type: "unknown",
        entry: "./dist/index.js",
      }),
    ).toThrow("Invalid plugin type: unknown");
  });

  it("initializes plugins with runtime context and destroys them in reverse order", async () => {
    const calls: string[] = [];
    const eventBus = new EventBus<CareerEventMap>();
    const workflowEngine = new WorkflowEngine(eventBus);
    const manager = new PluginManager({
      eventBus,
      workflowEngine,
      env: { CLUELYY_TEST: "enabled" },
    });
    manager.register(
      plugin(manifest({ name: "jobs", type: "job-connector" }), calls, (context) => {
        expect(context.eventBus).toBe(eventBus);
        expect(context.workflowEngine).toBe(workflowEngine);
        expect(context.env.CLUELYY_TEST).toBe("enabled");
      }),
    );
    manager.register(plugin(manifest({ name: "notifier", type: "notifier" }), calls));

    await expect(manager.initializeAll()).resolves.toEqual([
      {
        name: "jobs",
        status: "initialized",
      },
      {
        name: "notifier",
        status: "initialized",
      },
    ]);
    expect(manager.plugins({ type: "notifier" })).toEqual([
      {
        name: "notifier",
        version: "1.0.0",
        type: "notifier",
        status: "initialized",
      },
    ]);

    await manager.destroyAll();

    expect(calls).toEqual([
      "initialize:jobs",
      "initialize:notifier",
      "destroy:notifier",
      "destroy:jobs",
    ]);
  });

  it("rejects duplicate plugin names and reports health by plugin", async () => {
    const calls: string[] = [];
    const manager = new PluginManager({
      eventBus: new EventBus<CareerEventMap>(),
      workflowEngine: new WorkflowEngine(new EventBus<CareerEventMap>()),
      env: {},
    });
    manager.register(plugin(manifest({ name: "jobs" }), calls));

    expect(() => manager.register(plugin(manifest({ name: "jobs" }), calls))).toThrow(
      "Plugin already registered: jobs",
    );
    await manager.initializeAll();

    await expect(manager.health()).resolves.toEqual({
      jobs: {
        ok: true,
        message: "jobs healthy",
      },
    });
  });
});
