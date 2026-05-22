export type Sleep = (delayMs: number) => Promise<void>;

export type RetryOptions = {
  maxRetries: number;
  initialDelayMs?: number;
  sleep?: Sleep;
};

export type CircuitBreakerState = "closed" | "open" | "half-open";

export type CircuitBreakerOptions = {
  failureThreshold?: number;
  resetTimeoutMs?: number;
  now?: () => number;
};

export type CircuitBreakerStatus = {
  state: CircuitBreakerState;
  failures: number;
  lastFailureAt: number | null;
};

export class CircuitOpenError extends Error {
  constructor(message = "Circuit is open, backing off") {
    super(message);
    this.name = "CircuitOpenError";
  }
}

export class CircuitBreaker {
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly now: () => number;
  private failures = 0;
  private lastFailureAt: number | null = null;
  private state: CircuitBreakerState = "closed";

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "open") {
      if (this.canAttemptReset()) {
        this.state = "half-open";
      } else {
        throw new CircuitOpenError();
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  status(): CircuitBreakerStatus {
    return {
      state: this.state,
      failures: this.failures,
      lastFailureAt: this.lastFailureAt,
    };
  }

  private canAttemptReset(): boolean {
    return this.lastFailureAt !== null && this.now() - this.lastFailureAt >= this.resetTimeoutMs;
  }

  private onSuccess(): void {
    this.state = "closed";
    this.failures = 0;
    this.lastFailureAt = null;
  }

  private onFailure(): void {
    this.failures += 1;
    this.lastFailureAt = this.now();
    if (this.state === "half-open" || this.failures >= this.failureThreshold) {
      this.state = "open";
    }
  }
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxRetries);
  const initialDelayMs = options.initialDelayMs ?? 1_000;
  const sleep = options.sleep ?? defaultSleep;
  let attempt = 1;

  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxAttempts) {
        throw error;
      }
      await sleep(initialDelayMs * 2 ** (attempt - 1));
      attempt += 1;
    }
  }
}

export async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return fn();
  }

  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function defaultSleep(delayMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}
