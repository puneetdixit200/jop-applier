import path from "node:path";
import { chromium, type BrowserContext } from "playwright-core";
import { ProxyManager, type BrowserProxy } from "./proxy-manager.js";
import type { BrowserSessionStore, BrowserStorageState } from "./session-store.js";

type PlaywrightLaunchPersistentContextOptions = NonNullable<
  Parameters<typeof chromium.launchPersistentContext>[1]
>;
type PlaywrightLaunchOptions = NonNullable<Parameters<typeof chromium.launch>[0]>;
type PlaywrightNewContextOptions = NonNullable<
  Awaited<ReturnType<typeof chromium.launch>>["newContext"] extends (
    options?: infer Options,
  ) => Promise<BrowserContext>
    ? Options
    : never
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
  storageState?: BrowserStorageState;
};

export type BrowserSession = Pick<BrowserContext, "close" | "newPage"> &
  Partial<Pick<BrowserContext, "storageState">>;

export type BrowserAutomationAdapter = {
  launchPersistentContext: (
    userDataDir: string,
    options: BrowserLaunchOptions,
  ) => Promise<BrowserSession>;
  launchEphemeralContext?: (options: BrowserLaunchOptions) => Promise<BrowserSession>;
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

export type BrowserManagerOptions = {
  sessionStore?: BrowserSessionStore;
};

export class BrowserManager {
  private readonly activeSessions = new Map<string, ActiveSession>();
  private readonly proxyManager: ProxyManager;

  constructor(
    private readonly adapter: BrowserAutomationAdapter,
    private readonly config: StealthConfig = createDefaultStealthConfig(),
    private readonly options: BrowserManagerOptions = {},
  ) {
    this.proxyManager = new ProxyManager(config.proxyList);
  }

  async openSession(platform: string): Promise<BrowserSession> {
    const key = platformKey(platform);
    const active = this.activeSessions.get(key);
    if (active) {
      return active.session;
    }

    const launchOptions = toBrowserLaunchOptions(this.config, this.proxyForSession());
    const restoredState = await this.loadEncryptedStorageState(platform);
    if (restoredState) {
      launchOptions.storageState = restoredState;
    }

    const session =
      this.options.sessionStore && this.adapter.launchEphemeralContext
        ? await this.adapter.launchEphemeralContext(launchOptions)
        : await this.adapter.launchPersistentContext(
            sessionDirectoryForPlatform(this.config.sessionRoot, platform),
            launchOptions,
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

    try {
      await this.saveEncryptedStorageState(active);
    } finally {
      await active.session.close();
      this.activeSessions.delete(key);
    }
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

  private async loadEncryptedStorageState(platform: string): Promise<BrowserStorageState | null> {
    if (!this.config.persistCookies || !this.options.sessionStore) {
      return null;
    }

    return this.options.sessionStore.load(platform);
  }

  private async saveEncryptedStorageState(active: ActiveSession): Promise<void> {
    if (
      !this.config.persistCookies ||
      !this.options.sessionStore ||
      typeof active.session.storageState !== "function"
    ) {
      return;
    }

    await this.options.sessionStore.save(active.platform, await active.session.storageState());
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
    launchEphemeralContext: async (options) => {
      const browser = await chromium.launch(toPlaywrightLaunchOptions(options));
      const context = await browser.newContext(toPlaywrightContextOptions(options));
      const close = context.close.bind(context);

      return {
        close: async () => {
          await close();
          await browser.close();
        },
        newPage: context.newPage.bind(context),
        storageState: context.storageState.bind(context),
      };
    },
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

function toPlaywrightLaunchOptions(options: BrowserLaunchOptions): PlaywrightLaunchOptions {
  return {
    args: options.args,
    headless: options.headless,
    ...(options.proxy ? { proxy: options.proxy } : {}),
  };
}

function toPlaywrightContextOptions(options: BrowserLaunchOptions): PlaywrightNewContextOptions {
  return {
    extraHTTPHeaders: options.extraHTTPHeaders,
    locale: options.locale,
    ...(options.storageState ? { storageState: options.storageState } : {}),
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
