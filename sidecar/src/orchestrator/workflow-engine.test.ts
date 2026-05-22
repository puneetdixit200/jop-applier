import { describe, expect, it } from "vitest";
import { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";
import { WorkflowEngine } from "./workflow-engine.js";

describe("WorkflowEngine", () => {
  it("runs registered workflows and emits lifecycle events", async () => {
    const bus = new EventBus<CareerEventMap>();
    const engine = new WorkflowEngine(bus);
    const events: string[] = [];

    bus.on("workflow.started", (event) => events.push(`start:${event.workflowId}`));
    bus.on("workflow.completed", (event) => events.push(`done:${event.workflowId}:${event.status}`));

    engine.register({
      id: "profile-refresh",
      description: "Refresh profile-derived data",
      run: async () => ({ refreshed: true }),
    });

    await expect(engine.run("profile-refresh")).resolves.toEqual({ refreshed: true });
    expect(events).toEqual(["start:profile-refresh", "done:profile-refresh:completed"]);
  });

  it("records failed workflow runs before rethrowing", async () => {
    const bus = new EventBus<CareerEventMap>();
    const engine = new WorkflowEngine(bus);
    const events: string[] = [];

    bus.on("workflow.completed", (event) => events.push(`${event.workflowId}:${event.status}`));
    engine.register({
      id: "broken",
      description: "Broken workflow",
      run: async () => {
        throw new Error("provider unavailable");
      },
    });

    await expect(engine.run("broken")).rejects.toThrow("provider unavailable");
    expect(events).toEqual(["broken:failed"]);
  });

  it("retries workflows that opt into retry error strategy", async () => {
    const bus = new EventBus<CareerEventMap>();
    const delays: number[] = [];
    const engine = new WorkflowEngine(bus, {
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });
    let attempts = 0;

    engine.register({
      id: "retryable",
      description: "Retryable workflow",
      errorStrategy: "retry",
      maxRetries: 2,
      retryDelayMs: 10,
      run: async () => {
        attempts += 1;
        if (attempts === 1) {
          throw new Error("temporary network failure");
        }
        return { attempts };
      },
    });

    await expect(engine.run("retryable")).resolves.toEqual({ attempts: 2 });
    expect(delays).toEqual([10]);
  });
});
