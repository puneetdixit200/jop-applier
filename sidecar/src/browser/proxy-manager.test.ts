import { describe, expect, it } from "vitest";
import { ProxyManager } from "./proxy-manager.js";

describe("ProxyManager", () => {
  it("filters empty proxy entries and rotates through configured proxies", () => {
    const manager = new ProxyManager([
      { server: "http://proxy-a.example:8080" },
      { server: " " },
      { server: "http://proxy-b.example:8080", username: "user", password: "pass" },
    ]);

    expect(manager.count()).toBe(2);
    expect(manager.firstProxy()).toEqual({ server: "http://proxy-a.example:8080" });
    expect(manager.nextProxy()).toEqual({ server: "http://proxy-a.example:8080" });
    expect(manager.nextProxy()).toEqual({
      server: "http://proxy-b.example:8080",
      username: "user",
      password: "pass",
    });
    expect(manager.nextProxy()).toEqual({ server: "http://proxy-a.example:8080" });
  });
});
