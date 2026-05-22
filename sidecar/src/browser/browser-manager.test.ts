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
    const manager = new BrowserManager(
      adapter,
      createDefaultStealthConfig({
        headless: false,
        locale: "en-IN",
        maxConcurrentPages: 2,
        sessionRoot: "/tmp/careercaveman-sessions",
        timezone: "Asia/Kolkata",
        userAgent: "CareerCaveman Test Browser",
        viewport: { width: 1366, height: 768 },
      }),
    );

    const firstSession = await manager.openSession("LinkedIn Jobs");
    const secondSession = await manager.openSession("LinkedIn Jobs");

    expect(firstSession).toBe(secondSession);
    expect(manager.activePlatforms()).toEqual(["LinkedIn Jobs"]);
    expect(sessionDirectoryForPlatform("/tmp/careercaveman-sessions", "LinkedIn Jobs")).toBe(
      "/tmp/careercaveman-sessions/linkedin-jobs",
    );
    expect(launches).toHaveLength(1);
    expect(launches[0]).toMatchObject({
      userDataDir: "/tmp/careercaveman-sessions/linkedin-jobs",
      options: {
        headless: false,
        locale: "en-IN",
        maxConcurrentPages: 2,
        timezoneId: "Asia/Kolkata",
        userAgent: "CareerCaveman Test Browser",
        viewport: { width: 1366, height: 768 },
      },
    });
    expect(launches[0]?.options.args).toContain("--disable-blink-features=AutomationControlled");
    expect(launches[0]?.options.extraHTTPHeaders).toEqual({ "Accept-Language": "en-IN" });

    await manager.closeSession("LinkedIn Jobs");

    expect(manager.activePlatforms()).toEqual([]);
    expect(closedSessions).toEqual(["/tmp/careercaveman-sessions/linkedin-jobs"]);
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
      userAgent: "CareerCaveman Test Browser",
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
          userAgent: "CareerCaveman Test Browser",
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
        sessionRoot: "/tmp/careercaveman-sessions",
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
});
