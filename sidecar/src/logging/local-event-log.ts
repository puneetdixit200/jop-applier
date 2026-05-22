import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type LocalEventLogOptions = {
  logDir: string;
  now?: () => Date;
  onError?: (error: unknown) => void;
};

export type LocalEventLogBinding = {
  logDir: string;
  flush: () => Promise<void>;
  close: () => Promise<void>;
};

type LocalEventLogEntry<Name extends keyof CareerEventMap = keyof CareerEventMap> = {
  timestamp: string;
  event: Name;
  payload: CareerEventMap[Name];
};

export function bindLocalEventLog(
  eventBus: EventBus<CareerEventMap>,
  options: LocalEventLogOptions,
): LocalEventLogBinding {
  const logger = new LocalEventLogger(options);
  const unsubscribe = eventBus.onAny((event) => {
    logger.record(event.name, event.payload);
  });

  return {
    logDir: options.logDir,
    flush: () => logger.flush(),
    close: async () => {
      unsubscribe();
      await logger.flush();
    },
  };
}

export function defaultLocalEventLogDir(cwd: string = process.cwd()): string {
  return join(cwd, "data", "logs");
}

class LocalEventLogger {
  private readonly now: () => Date;
  private readonly onError: (error: unknown) => void;
  private pending = Promise.resolve();

  constructor(private readonly options: LocalEventLogOptions) {
    this.now = options.now ?? (() => new Date());
    this.onError = options.onError ?? ((error) => console.error(error));
  }

  record<Name extends keyof CareerEventMap>(event: Name, payload: CareerEventMap[Name]): void {
    const entry: LocalEventLogEntry<Name> = {
      timestamp: this.now().toISOString(),
      event,
      payload,
    };

    this.pending = this.pending
      .then(() => this.write(entry))
      .catch((error: unknown) => {
        this.onError(error);
      });
  }

  async flush(): Promise<void> {
    await this.pending;
  }

  private async write(entry: LocalEventLogEntry): Promise<void> {
    await mkdir(this.options.logDir, { recursive: true });
    await appendFile(
      join(this.options.logDir, `events-${entry.timestamp.slice(0, 10)}.jsonl`),
      `${JSON.stringify(entry, errorReplacer)}\n`,
      "utf8",
    );
  }
}

function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return value;
}
