import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { BrowserSession } from "./browser-manager.js";

export type BrowserSessionHealthTarget = {
  platform: string;
  isEnabled: boolean;
};

export type BrowserSessionHealthResult = {
  platform: string;
  ok: boolean;
  message: string;
};

export type BrowserSessionHealthSummary = {
  checked: number;
  healthy: number;
  unhealthy: number;
  skipped: number;
  results: BrowserSessionHealthResult[];
};

export type BrowserSessionHealthDependencies = {
  openSession: (platform: string) => Promise<BrowserSession>;
  validateSession?: (
    target: BrowserSessionHealthTarget,
    session: BrowserSession,
  ) => Promise<{ ok: boolean; message: string }>;
};

export type BrowserSessionHealthOptions = {
  targets: BrowserSessionHealthTarget[];
  checkedAt: Date;
  eventBus?: EventBus<CareerEventMap>;
};

export async function runBrowserSessionHealthCheck(
  dependencies: BrowserSessionHealthDependencies,
  options: BrowserSessionHealthOptions,
): Promise<BrowserSessionHealthSummary> {
  const enabledTargets = options.targets.filter((target) => target.isEnabled);
  const results: BrowserSessionHealthResult[] = [];

  for (const target of enabledTargets) {
    let session: BrowserSession | null = null;

    try {
      session = await dependencies.openSession(target.platform);
      const validation = await validateSession(dependencies, target, session);
      results.push({
        platform: target.platform,
        ok: validation.ok,
        message: validation.message,
      });

      if (validation.ok) {
        options.eventBus?.emit("browser.session.healthy", {
          platform: target.platform,
          message: validation.message,
          checkedAt: options.checkedAt,
        });
      } else {
        options.eventBus?.emit("browser.session.unhealthy", {
          platform: target.platform,
          reason: validation.message,
          checkedAt: options.checkedAt,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      results.push({
        platform: target.platform,
        ok: false,
        message,
      });
      options.eventBus?.emit("browser.session.unhealthy", {
        platform: target.platform,
        reason: message,
        checkedAt: options.checkedAt,
      });
    } finally {
      if (session) {
        await session.close();
      }
    }
  }

  const healthy = results.filter((result) => result.ok).length;
  const unhealthy = results.length - healthy;

  return {
    checked: enabledTargets.length,
    healthy,
    unhealthy,
    skipped: options.targets.length - enabledTargets.length,
    results,
  };
}

async function validateSession(
  dependencies: BrowserSessionHealthDependencies,
  target: BrowserSessionHealthTarget,
  session: BrowserSession,
): Promise<{ ok: boolean; message: string }> {
  if (!dependencies.validateSession) {
    return {
      ok: true,
      message: `${target.platform} session opened successfully`,
    };
  }

  return dependencies.validateSession(target, session);
}
