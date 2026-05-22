import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parsePluginManifest, type Plugin, type PluginManifest } from "./plugin-manager.js";

export type PluginIntegrity = {
  algorithm: "sha256";
  value: string;
};

export type LoadPluginOptions = {
  rootDir: string;
  manifestFile?: string;
  integrity?: PluginIntegrity;
};

type PluginModule = {
  default?: Plugin | ((manifest: PluginManifest) => Plugin) | { createPlugin?: (manifest: PluginManifest) => Plugin };
  createPlugin?: (manifest: PluginManifest) => Plugin;
};

export async function loadPluginFromDirectory(options: LoadPluginOptions): Promise<Plugin> {
  const rootDir = resolve(options.rootDir);
  const manifestPath = safePluginPath(rootDir, options.manifestFile ?? "manifest.json");
  const manifest = parsePluginManifest(JSON.parse(await readFile(manifestPath, "utf8")));
  const entryPath = safePluginPath(rootDir, manifest.entry);

  if (options.integrity) {
    await verifyPluginIntegrity(entryPath, options.integrity);
  }

  const module = (await import(pathToFileURL(entryPath).href)) as PluginModule;
  return pluginFromModule(module, manifest);
}

export async function verifyPluginIntegrity(entryPath: string, integrity: PluginIntegrity): Promise<void> {
  const digest = createHash(integrity.algorithm).update(await readFile(entryPath)).digest("hex");
  if (digest !== integrity.value.toLowerCase()) {
    throw new Error(`Plugin integrity check failed for ${entryPath}`);
  }
}

function pluginFromModule(module: PluginModule, manifest: PluginManifest): Plugin {
  if (typeof module.createPlugin === "function") {
    return module.createPlugin(manifest);
  }
  if (typeof module.default === "function") {
    return module.default(manifest);
  }
  if (hasCreatePlugin(module.default)) {
    return module.default.createPlugin(manifest);
  }
  if (module.default && typeof module.default === "object" && "manifest" in module.default) {
    return module.default as Plugin;
  }

  throw new Error(`Plugin module for ${manifest.name} must export a plugin or createPlugin()`);
}

function hasCreatePlugin(value: unknown): value is { createPlugin: (manifest: PluginManifest) => Plugin } {
  return typeof value === "object" && value !== null && "createPlugin" in value && typeof value.createPlugin === "function";
}

function safePluginPath(rootDir: string, pluginPath: string): string {
  if (isAbsolute(pluginPath)) {
    throw new Error("Plugin paths must be relative to the plugin directory");
  }

  const candidate = resolve(rootDir, normalize(pluginPath));
  if (candidate !== rootDir && !candidate.startsWith(`${rootDir}/`)) {
    throw new Error("Plugin path escapes the plugin directory");
  }
  return candidate;
}
