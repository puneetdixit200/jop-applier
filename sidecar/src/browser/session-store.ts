import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserContext } from "playwright-core";

export type BrowserStorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

export type BrowserSessionStore = {
  pathFor: (platform: string) => string;
  load: (platform: string) => Promise<BrowserStorageState | null>;
  save: (platform: string, state: BrowserStorageState) => Promise<string>;
  delete: (platform: string) => Promise<void>;
};

export type EncryptedBrowserSessionStoreOptions = {
  rootDir: string;
  key: Buffer | string;
  now?: () => Date;
};

type EncryptedSessionEnvelope = {
  version: 1;
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  ciphertext: string;
};

type SessionPayload = {
  version: 1;
  platform: string;
  savedAt: string;
  state: BrowserStorageState;
};

const algorithm = "aes-256-gcm";
const keyBytes = 32;
const ivBytes = 12;

export class EncryptedBrowserSessionStore implements BrowserSessionStore {
  private readonly key: Buffer;
  private readonly now: () => Date;

  constructor(private readonly options: EncryptedBrowserSessionStoreOptions) {
    this.key = normalizeSessionEncryptionKey(options.key);
    this.now = options.now ?? (() => new Date());
  }

  pathFor(platform: string): string {
    return path.join(this.options.rootDir, `${platformKey(platform)}.session.enc`);
  }

  async load(platform: string): Promise<BrowserStorageState | null> {
    const filePath = this.pathFor(platform);
    let raw: string;

    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) {
        return null;
      }
      throw error;
    }

    const envelope = parseEnvelope(raw, filePath);
    const payload = decryptPayload(envelope, this.key, filePath);

    return payload.state;
  }

  async save(platform: string, state: BrowserStorageState): Promise<string> {
    const filePath = this.pathFor(platform);
    const payload: SessionPayload = {
      version: 1,
      platform,
      savedAt: this.now().toISOString(),
      state,
    };
    const iv = randomBytes(ivBytes);
    const cipher = createCipheriv(algorithm, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
      cipher.final(),
    ]);
    const envelope: EncryptedSessionEnvelope = {
      version: 1,
      algorithm,
      iv: iv.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });

    return filePath;
  }

  async delete(platform: string): Promise<void> {
    await rm(this.pathFor(platform), { force: true });
  }
}

export function normalizeSessionEncryptionKey(key: Buffer | string): Buffer {
  if (Buffer.isBuffer(key)) {
    if (key.byteLength !== keyBytes) {
      throw new Error(`Browser session encryption key must be ${keyBytes} bytes`);
    }
    return key;
  }

  const trimmed = key.trim();
  if (!trimmed) {
    throw new Error("Browser session encryption key cannot be empty");
  }

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  if (trimmed.startsWith("base64:")) {
    const decoded = Buffer.from(trimmed.slice("base64:".length), "base64");
    if (decoded.byteLength !== keyBytes) {
      throw new Error(`Base64 browser session encryption key must decode to ${keyBytes} bytes`);
    }
    return decoded;
  }

  return createHash("sha256").update(trimmed, "utf8").digest();
}

function parseEnvelope(raw: string, filePath: string): EncryptedSessionEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Browser session file is not valid JSON: ${filePath}`, { cause: error });
  }

  if (
    !isRecord(parsed) ||
    parsed.version !== 1 ||
    parsed.algorithm !== algorithm ||
    typeof parsed.iv !== "string" ||
    typeof parsed.authTag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error(`Browser session file has an unsupported format: ${filePath}`);
  }

  return parsed as EncryptedSessionEnvelope;
}

function decryptPayload(
  envelope: EncryptedSessionEnvelope,
  key: Buffer,
  filePath: string,
): SessionPayload {
  try {
    const decipher = createDecipheriv(algorithm, key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.authTag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    const payload: unknown = JSON.parse(plaintext.toString("utf8"));

    if (!isSessionPayload(payload)) {
      throw new Error("decrypted payload failed validation");
    }

    return payload;
  } catch (error) {
    throw new Error(`Browser session file could not be decrypted: ${filePath}`, { cause: error });
  }
}

function isSessionPayload(payload: unknown): payload is SessionPayload {
  return (
    isRecord(payload) &&
    payload.version === 1 &&
    typeof payload.platform === "string" &&
    typeof payload.savedAt === "string" &&
    isRecord(payload.state) &&
    Array.isArray(payload.state.cookies) &&
    Array.isArray(payload.state.origins)
  );
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}
