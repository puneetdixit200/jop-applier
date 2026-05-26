import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BrowserManager,
  createDefaultStealthConfig,
  createPlaywrightBrowserAdapter,
  sessionDirectoryForPlatform,
  type BrowserAutomationAdapter,
  type BrowserLaunchOptions,
  type BrowserSession,
} from "./browser-manager.js";
import type { BrowserSessionStore, BrowserStorageState } from "./session-store.js";

describe("browser manager", () => {
  it("launches persistent platform sessions with stealth defaults and reuses active sessions", async () => {
    const launches: Array<{ userDataDir: string; options: BrowserLaunchOptions }> = [];
    const closedSessions: string[] = [];
    const adapter: BrowserAutomationAdapter = {
      launchPersistentContext: async (userDataDir, options): Promise<BrowserSession> => {
        launches.push({ userDataDir, options });

        return {
          close: async () => {
            closedSessions.push(userDataDir);
          },
          newPage: async () => {
            throw new Error("not used in this test");
          },
        };
      },
    };
    const sessionRoot = path.join("/tmp", "cluelyy-sessions");
    const expectedSessionDirectory = path.join(sessionRoot, "linkedin-jobs");
    const manager = new BrowserManager(
      adapter,
      createDefaultStealthConfig({
        headless: false,
        locale: "en-IN",
        maxConcurrentPages: 2,
        sessionRoot,
        timezone: "Asia/Kolkata",
        userAgent: "cluelyy Test Browser",
        viewport: { width: 1366, height: 768 },
      }),
    );

    const firstSession = await manager.openSession("LinkedIn Jobs");
    const secondSession = await manager.openSession("LinkedIn Jobs");

    expect(firstSession).toBe(secondSession);
    expect(manager.activePlatforms()).toEqual(["LinkedIn Jobs"]);
    expect(sessionDirectoryForPlatform(sessionRoot, "LinkedIn Jobs")).toBe(expectedSessionDirectory);
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatchObject({
      userDataDir: expectedSessionDirectory,
      options: {
        headless: false,
        locale: "en-IN",
        maxConcurrentPages: 2,
        timezoneId: "Asia/Kolkata",
        userAgent: "cluelyy Test Browser",
        viewport: { width: 1366, height: 768 },
      },
    });
    expect(launches[0]?.options.args).toContain("--disable-blink-features=AutomationControlled");
    expect(launches[0]?.options.extraHTTPHeaders).toEqual({ "Accept-Language": "en-IN" });

    await manager.closeSession("LinkedIn Jobs");

    expect(manager.activePlatforms()).toEqual([]);
    expect(closedSessions).toEqual([expectedSessionDirectory]);
  });

  it("adapts Playwright persistent contexts behind the browser automation interface", async () => {
    const launchedContexts: Array<{ userDataDir: string; options: BrowserLaunchOptions }> = [];
    const playwright = {
      launchPersistentContext: async (userDataDir: string, options: BrowserLaunchOptions) => {
        launchedContexts.push({ userDataDir, options });
        return {
          close: async () => {},
          newPage: async () => {
            throw new Error("not used in this test");
          },
        };
      },
    };
    const adapter = createPlaywrightBrowserAdapter(playwright);

    const session = await adapter.launchPersistentContext("/tmp/session", {
      args: ["--disable-blink-features=AutomationControlled"],
      extraHTTPHeaders: { "Accept-Language": "en-IN" },
      headless: true,
      locale: "en-IN",
      maxConcurrentPages: 2,
      timezoneId: "Asia/Kolkata",
      userAgent: "cluelyy Test Browser",
      viewport: { width: 1366, height: 768 },
    });

    expect(typeof session.close).toBe("function");
    expect(launchedContexts).toEqual([
      {
        userDataDir: "/tmp/session",
        options: {
          args: ["--disable-blink-features=AutomationControlled"],
          extraHTTPHeaders: { "Accept-Language": "en-IN" },
          headless: true,
          locale: "en-IN",
          maxConcurrentPages: 2,
          timezoneId: "Asia/Kolkata",
          userAgent: "cluelyy Test Browser",
          viewport: { width: 1366, height: 768 },
        },
      },
    ]);
  });

  it("rotates configured proxies across newly opened browser sessions", async () => {
    const launches: Array<{ userDataDir: string; options: BrowserLaunchOptions }> = [];
    const adapter: BrowserAutomationAdapter = {
      launchPersistentContext: async (userDataDir, options): Promise<BrowserSession> => {
        launches.push({ userDataDir, options });

        return {
          close: async () => {},
          newPage: async () => {
            throw new Error("not used in this test");
          },
        };
      },
    };
    const manager = new BrowserManager(
      adapter,
      createDefaultStealthConfig({
        rotateProxy: true,
        proxyList: [
          { server: "http://proxy-a.example:8080" },
          { server: "http://proxy-b.example:8080", username: "user", password: "pass" },
        ],
        sessionRoot: "/tmp/cluelyy-sessions",
      }),
    );

    await manager.openSession("LinkedIn");
    await manager.openSession("Indeed");
    await manager.openSession("Internshala");

    expect(launches.map((launch) => launch.options.proxy)).toEqual([
      { server: "http://proxy-a.example:8080" },
      { server: "http://proxy-b.example:8080", username: "user", password: "pass" },
      { server: "http://proxy-a.example:8080" },
    ]);
  });

  it("restores and snapshots encrypted storage state when a session store is configured", async () => {
    const initialState: BrowserStorageState = {
      cookies: [
        {
          name: "li_at",
          value: "stored-cookie",
          domain: ".linkedin.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    };
    const updatedState: BrowserStorageState = {
      cookies: [
        {
          name: "li_at",
          value: "updated-cookie",
          domain: ".linkedin.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [],
    };
    const loadedPlatforms: string[] = [];
    const savedSnapshots: Array<{ platform: string; state: BrowserStorageState }> = [];
    const launchedEphemeral: BrowserLaunchOptions[] = [];
    const closedSessions: string[] = [];
    const store: BrowserSessionStore = {
      pathFor: (platform) => `/tmp/${platform}.session.enc`,
      load: async (platform) => {
        loadedPlatforms.push(platform);
        return initialState;
      },
      save: async (platform, state) => {
        savedSnapshots.push({ platform, state });
        return `/tmp/${platform}.session.enc`;
      },
      delete: async () => undefined,
    };
    const adapter: BrowserAutomationAdapter = {
      launchPersistentContext: async () => {
        throw new Error("encrypted session mode should not use persistent profile storage");
      },
      launchEphemeralContext: async (options): Promise<BrowserSession> => {
        launchedEphemeral.push(options);

        return {
          close: async () => {
            closedSessions.push("LinkedIn Jobs");
          },
          newPage: async () => {
            throw new Error("not used in this test");
          },
          storageState: async () => updatedState,
        };
      },
    };
    const manager = new BrowserManager(
      adapter,
      createDefaultStealthConfig({ sessionRoot: "/tmp/cluelyy-sessions" }),
      { sessionStore: store },
    );

    await manager.openSession("LinkedIn Jobs");
    await manager.closeSession("LinkedIn Jobs");

    expect(loadedPlatforms).toEqual(["LinkedIn Jobs"]);
    expect(launchedEphemeral).toHaveLength(1);
    expect(launchedEphemeral[0]?.storageState).toEqual(initialState);
    expect(savedSnapshots).toEqual([{ platform: "LinkedIn Jobs", state: updatedState }]);
    expect(closedSessions).toEqual(["LinkedIn Jobs"]);
  });
});
