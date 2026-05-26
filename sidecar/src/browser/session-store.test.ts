import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EncryptedBrowserSessionStore,
  normalizeSessionEncryptionKey,
  type BrowserStorageState,
} from "./session-store.js";

describe("encrypted browser session store", () => {
  it("stores per-platform browser storage state as AES-GCM encrypted files", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "job-hunt-sessions-"));
    const store = new EncryptedBrowserSessionStore({
      rootDir,
      key: "local test passphrase",
      now: () => new Date("2026-05-29T12:00:00.000Z"),
    });
    const state: BrowserStorageState = {
      cookies: [
        {
          name: "li_at",
          value: "sensitive-cookie",
          domain: ".linkedin.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [
        {
          origin: "https://www.linkedin.com",
          localStorage: [{ name: "auth", value: "sensitive-local-storage" }],
        },
      ],
    };

    try {
      const filePath = await store.save("LinkedIn Jobs", state);
      const raw = await readFile(filePath, "utf8");

      expect(filePath).toBe(join(rootDir, "linkedin-jobs.session.enc"));
      expect(raw).not.toContain("sensitive-cookie");
      expect(raw).not.toContain("sensitive-local-storage");
      await expect(store.load("LinkedIn Jobs")).resolves.toEqual(state);

      await store.delete("LinkedIn Jobs");
      await expect(store.load("LinkedIn Jobs")).resolves.toBeNull();
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("rejects encrypted session files when the key does not match", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "job-hunt-sessions-"));
    const state: BrowserStorageState = { cookies: [], origins: [] };

    try {
      await new EncryptedBrowserSessionStore({ rootDir, key: "correct key" }).save(
        "Indeed",
        state,
      );
      await expect(
        new EncryptedBrowserSessionStore({ rootDir, key: "wrong key" }).load("Indeed"),
      ).rejects.toThrow(/could not be decrypted/);
    } finally {
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("accepts hex, base64-prefixed, and passphrase encryption keys", () => {
    const hexKey = "00".repeat(32);
    const base64Key = `base64:${Buffer.alloc(32, 1).toString("base64")}`;

    expect(normalizeSessionEncryptionKey(hexKey)).toHaveLength(32);
    expect(normalizeSessionEncryptionKey(base64Key)).toHaveLength(32);
    expect(normalizeSessionEncryptionKey("passphrase")).toHaveLength(32);
    expect(() => normalizeSessionEncryptionKey(Buffer.alloc(16))).toThrow(/must be 32 bytes/);
  });
});
