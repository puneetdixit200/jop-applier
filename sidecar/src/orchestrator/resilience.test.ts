import { describe, expect, it } from "vitest";
import {
  CircuitBreaker,
  CircuitOpenError,
  retryWithBackoff,
} from "./resilience.js";

describe("resilience utilities", () => {
  it("retries transient failures with exponential backoff", async () => {
    const delays: number[] = [];
    let attempts = 0;

    await expect(
      retryWithBackoff(
        async () => {
          attempts += 1;
          if (attempts < 3) {
            throw new Error(`temporary-${attempts}`);
          }
          return "ok";
        },
        {
          maxRetries: 3,
          initialDelayMs: 25,
          sleep: async (delayMs) => {
            delays.push(delayMs);
          },
        },
      ),
    ).resolves.toBe("ok");

    expect(attempts).toBe(3);
    expect(delays).toEqual([25, 50]);
  });

  it("opens the circuit after repeated failures and recovers after reset timeout", async () => {
    let now = 1_000;
    const breaker = new CircuitBreaker({
      failureThreshold: 2,
      resetTimeoutMs: 500,
      now: () => now,
    });

    await expect(breaker.execute(async () => {
      throw new Error("first failure");
    })).rejects.toThrow("first failure");
    await expect(breaker.execute(async () => {
      throw new Error("second failure");
    })).rejects.toThrow("second failure");
    expect(breaker.status()).toEqual({
      state: "open",
      failures: 2,
      lastFailureAt: 1_000,
    });

    await expect(breaker.execute(async () => "blocked")).rejects.toBeInstanceOf(
      CircuitOpenError,
    );

    now = 1_600;

    await expect(breaker.execute(async () => "recovered")).resolves.toBe("recovered");
    expect(breaker.status()).toEqual({
      state: "closed",
      failures: 0,
      lastFailureAt: null,
    });
  });
});
