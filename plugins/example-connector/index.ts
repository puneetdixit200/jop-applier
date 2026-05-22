import type { Plugin, PluginManifest } from "../../sidecar/src/plugins/plugin-manager";

export function createPlugin(manifest: PluginManifest): Plugin {
  return {
    manifest,
    async initialize() {},
    async destroy() {},
    async healthCheck() {
      return { ok: true, message: "example connector ready" };
    },
  };
}
