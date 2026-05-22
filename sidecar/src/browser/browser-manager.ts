import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { ProxyManager, type BrowserProxy } from "./proxy-manager.js";

type PlaywrightLaunchPersistentContextOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[1]
>;

export type BrowserViewport = {
  width: number;
  height: number;
};

export type StealthConfig = {
  userAgent: string;
  viewport: BrowserViewport;
  timezone: string;
  locale: string;
  humanDelay: { min: number; max: number };
  scrollBehavior: "smooth" | "natural";
  mouseMovement: boolean;
  typingSpeed: { min: number; max: number };
  persistCookies: boolean;
  rotateProxy: boolean;
  proxyList: BrowserProxy[];
  maxConcurrentPages: number;
  headless: boolean;
  sessionRoot: string;
};

export type BrowserLaunchOptions = {
  args: string[];
  extraHTTPHeaders: Record<string, string>;
  headless: boolean;
  locale: string;
  maxConcurrentPages: number;
  proxy?: BrowserProxy;
  timezoneId: string;
  userAgent: string;
  viewport: BrowserViewport;
};

export type BrowserSession = Pick<BrowserContext, "close" | "newPage">;

export type BrowserAutomationAdapter = {
  launchPersistentContext: (
    userDataDir: string,
    options: BrowserLaunchOptions,
  ) => Promise<BrowserSession>;
};

export type PlaywrightPersistentContextLauncher = {
  launchPersistentContext: (
    userDataDir: string,
    options: BrowserLaunchOptions,
  ) => Promise<BrowserSession>;
};

type ActiveSession = {
  platform: string;
  session: BrowserSession;
};

export class BrowserManager {
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly proxyManager: ProxyManager;

  constructor(
    private readonly adapter: BrowserAutomationAdapter,
    private readonly config: StealthConfig = createDefaultStealthConfig(),
  ) {
    this.proxyManager = new ProxyManager(config.proxyList);
  }

  async openSession(platform: string): Promise<BrowserSession> {
    const key = platformKey(platform);
    const active = this.activeSessions.get(key);
    if (active) {
      return active.session;
    }

    const session = await this.adapter.launchPersistentContext(
      sessionDirectoryForPlatform(this.config.sessionRoot, platform),
      toBrowserLaunchOptions(this.config, this.proxyForSession()),
    );
    this.activeSessions.set(key, { platform, session });

    return session;
  }

  activePlatforms(): string[] {
    return [...this.activeSessions.values()].map(({ platform }) => platform);
  }

  async closeSession(platform: string): Promise<void> {
    const key = platformKey(platform);
    const active = this.activeSessions.get(key);
    if (!active) {
      return;
    }

    await active.session.close();
    this.activeSessions.delete(key);
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.activePlatforms().map((platform) => this.closeSession(platform)));
  }

  private proxyForSession(): BrowserProxy | undefined {
    if (this.proxyManager.count() === 0) {
      return undefined;
    }

    return this.config.rotateProxy ? this.proxyManager.nextProxy() : this.proxyManager.firstProxy();
  }
}

export function createDefaultStealthConfig(overrides: Partial<StealthConfig> = {}): StealthConfig {
  return {
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    timezone: "UTC",
    locale: "en-US",
    humanDelay: { min: 500, max: 2000 },
    scrollBehavior: "natural",
    mouseMovement: true,
    typingSpeed: { min: 40, max: 120 },
    persistCookies: true,
    rotateProxy: false,
    proxyList: [],
    maxConcurrentPages: 2,
    headless: true,
    sessionRoot: path.join(process.cwd(), "data", "sessions"),
    ...overrides,
  };
}

export function createPlaywrightBrowserAdapter(
  launcher?: PlaywrightPersistentContextLauncher,
): BrowserAutomationAdapter {
  const persistentContextLauncher =
    launcher ??
    ({
      launchPersistentContext: async (userDataDir, options) =>
        chromium.launchPersistentContext(userDataDir, toPlaywrightOptions(options)),
    } satisfies PlaywrightPersistentContextLauncher);

  return {
    launchPersistentContext: (userDataDir, options) =>
      persistentContextLauncher.launchPersistentContext(userDataDir, options),
  };
}

export function sessionDirectoryForPlatform(sessionRoot: string, platform: string): string {
  return path.join(sessionRoot, platformKey(platform));
}

function toBrowserLaunchOptions(
  config: StealthConfig,
  proxy: BrowserProxy | undefined,
): BrowserLaunchOptions {
  return {
    args: ["--disable-blink-features=AutomationControlled"],
    extraHTTPHeaders: { "Accept-Language": config.locale },
    headless: config.headless,
    locale: config.locale,
    maxConcurrentPages: config.maxConcurrentPages,
    ...(proxy ? { proxy } : {}),
    timezoneId: config.timezone,
    userAgent: config.userAgent,
    viewport: config.viewport,
  };
}

function toPlaywrightOptions(options: BrowserLaunchOptions): PlaywrightLaunchPersistentContextOptions {
  return {
    args: options.args,
    extraHTTPHeaders: options.extraHTTPHeaders,
    headless: options.headless,
    locale: options.locale,
    ...(options.proxy ? { proxy: options.proxy } : {}),
    timezoneId: options.timezoneId,
    userAgent: options.userAgent,
    viewport: options.viewport,
  };
}

function platformKey(platform: string): string {
  const key = platform
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!key) {
    throw new Error("Browser session platform cannot be empty");
  }

  return key;
}
