import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { bindLocalEventLog } from "./local-event-log.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("local event log", () => {
  it("writes workflow events as daily JSONL records", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "job-hunt-log-"));
    tempDirs.push(logDir);
    const bus = new EventBus<CareerEventMap>();
    const binding = bindLocalEventLog(bus, {
      logDir,
      now: () => new Date("2026-05-28T10:15:00.000Z"),
    });

    bus.emit("workflow.started", {
      workflowId: "job-discovery",
      startedAt: new Date("2026-05-28T10:15:00.000Z"),
    });
    bus.emit("workflow.completed", {
      workflowId: "job-discovery",
      status: "completed",
      durationMs: 42,
    });
    await binding.flush();

    const jsonl = await readFile(join(logDir, "events-2026-05-28.jsonl"), "utf8");
    expect(jsonl.trim().split("\n").map((line) => JSON.parse(line))).toEqual([
      {
        timestamp: "2026-05-28T10:15:00.000Z",
        event: "workflow.started",
        payload: {
          workflowId: "job-discovery",
          startedAt: "2026-05-28T10:15:00.000Z",
        },
      },
      {
        timestamp: "2026-05-28T10:15:00.000Z",
        event: "workflow.completed",
        payload: {
          workflowId: "job-discovery",
          status: "completed",
          durationMs: 42,
        },
      },
    ]);
  });

  it("stops recording after close", async () => {
    const logDir = await mkdtemp(join(tmpdir(), "job-hunt-log-"));
    tempDirs.push(logDir);
    const bus = new EventBus<CareerEventMap>();
    const binding = bindLocalEventLog(bus, {
      logDir,
      now: () => new Date("2026-05-28T10:15:00.000Z"),
    });

    bus.emit("workflow.completed", {
      workflowId: "first",
      status: "completed",
      durationMs: 1,
    });
    await binding.close();
    bus.emit("workflow.completed", {
      workflowId: "second",
      status: "completed",
      durationMs: 2,
    });
    await binding.flush();

    const jsonl = await readFile(join(logDir, "events-2026-05-28.jsonl"), "utf8");
    expect(jsonl).toContain('"workflowId":"first"');
    expect(jsonl).not.toContain('"workflowId":"second"');
  });
});
