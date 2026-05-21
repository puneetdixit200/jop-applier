import { describe, expect, it } from "vitest";
import { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";

describe("EventBus", () => {
  it("delivers typed workflow events and supports unsubscribe", () => {
    const bus = new EventBus<CareerEventMap>();
    const seen: string[] = [];

    const unsubscribe = bus.on("workflow.completed", (event) => {
      seen.push(`${event.workflowId}:${event.status}`);
    });

    bus.emit("workflow.completed", {
      workflowId: "daily-discovery",
      status: "completed",
      durationMs: 42,
    });
    unsubscribe();
    bus.emit("workflow.completed", {
      workflowId: "daily-discovery",
      status: "completed",
      durationMs: 99,
    });

    expect(seen).toEqual(["daily-discovery:completed"]);
  });
});

