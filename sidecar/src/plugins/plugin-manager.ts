import type { WorkflowEngine } from "../orchestrator/workflow-engine.js";
import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type PluginType =
  | "job-connector"
  | "ai-provider"
  | "notifier"
  | "exporter"
  | "workflow"
  | "maintenance";

export type PluginPermission =
  | "network"
  | "browser"
  | "filesystem"
  | "database"
  | "notifications"
  | "secrets";

export type PluginConfigField = {
  type: "string" | "number" | "boolean" | "object" | "array";
  required?: boolean;
  secret?: boolean;
  default?: unknown;
};

export type PluginManifest = {
  name: string;
  version: string;
  type: PluginType;
  entry: string;
  author?: string;
  description?: string;
  config?: Record<string, PluginConfigField>;
  permissions: PluginPermission[];
  compatibility?: string;
};

export type PluginHealth = {
  ok: boolean;
  message: string;
};

export type PluginContext = {
  eventBus: EventBus<CareerEventMap>;
  workflowEngine: WorkflowEngine;
  env: NodeJS.ProcessEnv;
};

export type Plugin = {
  manifest: PluginManifest;
  initialize(context: PluginContext): Promise<void>;
  destroy(): Promise<void>;
  healthCheck(): Promise<PluginHealth>;
};

export type PluginStatus = "registered" | "initialized" | "failed";

export type PluginSummary = {
  name: string;
  version: string;
  type: PluginType;
  status: PluginStatus;
};

export type PluginLifecycleResult = {
  name: string;
  status: "initialized" | "destroyed";
};

export class PluginManager {
  private readonly pluginsByName = new Map<string, Plugin>();
  private readonly statusByName = new Map<string, PluginStatus>();
  private readonly initializedOrder: string[] = [];

  constructor(private readonly context: PluginContext) {}

  register(plugin: Plugin): void {
    const manifest = parsePluginManifest(plugin.manifest);
    if (this.pluginsByName.has(manifest.name)) {
      throw new Error(`Plugin already registered: ${manifest.name}`);
    }

    this.pluginsByName.set(manifest.name, {
      ...plugin,
      manifest,
    });
    this.statusByName.set(manifest.name, "registered");
  }

  async initializeAll(): Promise<PluginLifecycleResult[]> {
    const results: PluginLifecycleResult[] = [];
    for (const plugin of this.pluginsByName.values()) {
      results.push(await this.initialize(plugin.manifest.name));
    }

    return results;
  }

  async initialize(name: string): Promise<PluginLifecycleResult> {
    const plugin = this.plugin(name);
    if (this.statusByName.get(name) === "initialized") {
      return { name, status: "initialized" };
    }

    try {
      await plugin.initialize(this.context);
      this.statusByName.set(name, "initialized");
      if (!this.initializedOrder.includes(name)) {
        this.initializedOrder.push(name);
      }
      return { name, status: "initialized" };
    } catch (error) {
      this.statusByName.set(name, "failed");
      throw new Error(
        `Plugin initialization failed for ${name}: ${errorMessage(error)}`,
      );
    }
  }

  async destroyAll(): Promise<PluginLifecycleResult[]> {
    const results: PluginLifecycleResult[] = [];
    for (const name of [...this.initializedOrder].reverse()) {
      results.push(await this.destroy(name));
    }

    return results;
  }

  async destroy(name: string): Promise<PluginLifecycleResult> {
    const plugin = this.plugin(name);
    if (this.statusByName.get(name) === "initialized") {
      await plugin.destroy();
    }
    this.statusByName.set(name, "registered");
    const index = this.initializedOrder.indexOf(name);
    if (index >= 0) {
      this.initializedOrder.splice(index, 1);
    }

    return { name, status: "destroyed" };
  }

  plugins(filter: { type?: PluginType } = {}): PluginSummary[] {
    return [...this.pluginsByName.values()]
      .filter((plugin) => !filter.type || plugin.manifest.type === filter.type)
      .map((plugin) => ({
        name: plugin.manifest.name,
        version: plugin.manifest.version,
        type: plugin.manifest.type,
        status: this.statusByName.get(plugin.manifest.name) ?? "registered",
      }));
  }

  async health(): Promise<Record<string, PluginHealth>> {
    const entries = await Promise.all(
      [...this.pluginsByName.values()].map(async (plugin) => {
        try {
          return [plugin.manifest.name, await plugin.healthCheck()] as const;
        } catch (error) {
          return [
            plugin.manifest.name,
            { ok: false, message: errorMessage(error) },
          ] as const;
        }
      }),
    );

    return Object.fromEntries(entries);
  }

  private plugin(name: string): Plugin {
    const plugin = this.pluginsByName.get(name);
    if (!plugin) {
      throw new Error(`Unknown plugin: ${name}`);
    }

    return plugin;
  }
}

export function parsePluginManifest(value: unknown): PluginManifest {
  if (!isRecord(value)) {
    throw new Error("Plugin manifest must be an object");
  }

  const name = requiredString(value.name, "name");
  const version = requiredString(value.version, "version");
  const type = pluginType(value.type);
  const entry = requiredString(value.entry, "entry");

  return {
    name,
    version,
    type,
    entry,
    author: optionalString(value.author),
    description: optionalString(value.description),
    config: pluginConfig(value.config),
    permissions: pluginPermissions(value.permissions),
    compatibility: optionalString(value.compatibility),
  };
}

function pluginType(value: unknown): PluginType {
  const type = requiredString(value, "type");
  if (
    [
      "job-connector",
      "ai-provider",
      "notifier",
      "exporter",
      "workflow",
      "maintenance",
    ].includes(type)
  ) {
    return type as PluginType;
  }

  throw new Error(`Invalid plugin type: ${type}`);
}

function pluginPermissions(value: unknown): PluginPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const permission = optionalString(item);
    return permission && isPluginPermission(permission)
      ? [permission as PluginPermission]
      : [];
  });
}

function isPluginPermission(value: string): boolean {
  return [
    "network",
    "browser",
    "filesystem",
    "database",
    "notifications",
    "secrets",
  ].includes(value);
}

function pluginConfig(value: unknown): Record<string, PluginConfigField> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, field]) => {
      const configField = pluginConfigField(field);
      return configField ? [[key, configField]] : [];
    }),
  );
}

function pluginConfigField(value: unknown): PluginConfigField | null {
  if (!isRecord(value)) {
    return null;
  }
  const type = optionalString(value.type);
  if (!type || !["string", "number", "boolean", "object", "array"].includes(type)) {
    return null;
  }

  return {
    type: type as PluginConfigField["type"],
    ...(optionalBoolean(value.required) === undefined
      ? {}
      : { required: optionalBoolean(value.required) }),
    ...(optionalBoolean(value.secret) === undefined
      ? {}
      : { secret: optionalBoolean(value.secret) }),
    ...(value.default === undefined ? {} : { default: value.default }),
  };
}

function requiredString(value: unknown, field: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new Error(`Plugin manifest field is required: ${field}`);
  }

  return text;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
