import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import {
  NotificationManager,
  bindNotificationManager,
  type NotificationAdapter,
  type NotificationDelivery,
} from "./notification-manager.js";

class RecordingAdapter implements NotificationAdapter {
  readonly sent: NotificationDelivery[] = [];

  constructor(readonly channel: NotificationAdapter["channel"]) {}

  async send(notification: NotificationDelivery): Promise<void> {
    this.sent.push(notification);
  }
}

describe("NotificationManager", () => {
  it("routes application failures to OS and in-app channels with high priority", async () => {
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const telegram = new RecordingAdapter("telegram");
    const manager = new NotificationManager({ adapters: [os, inApp, telegram] });

    const deliveries = await manager.notify({
      type: "application.failed",
      title: "Application failed",
      body: "Lever returned a validation error",
      metadata: { applicationId: "app-1" },
    });

    expect(deliveries.map((delivery) => delivery.channel)).toEqual(["os", "in_app"]);
    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(telegram.sent).toHaveLength(0);
    expect(os.sent[0]).toMatchObject({
      type: "application.failed",
      priority: "high",
      title: "Application failed",
      body: "Lever returned a validation error",
      metadata: { applicationId: "app-1" },
    });
  });

  it("subscribes to career events and emits AI provider outage notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const manager = new NotificationManager({ adapters: [os, inApp] });

    const unsubscribe = bindNotificationManager(bus, manager);

    bus.emit("ai.provider.offline", {
      provider: "ollama",
      model: "llama3.1",
      reason: "connection refused",
    });
    await Promise.resolve();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(os.sent[0]).toMatchObject({
      type: "ai.provider.offline",
      priority: "high",
      title: "AI provider went offline",
      body: "ollama llama3.1 is unavailable: connection refused",
      metadata: {
        provider: "ollama",
        model: "llama3.1",
        reason: "connection refused",
      },
    });

    unsubscribe();
    bus.emit("ai.provider.offline", {
      provider: "openrouter",
      model: "auto",
      reason: "rate limited",
    });
    await Promise.resolve();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
  });

  it("subscribes to follow-up sent events and emits follow-up notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const manager = new NotificationManager({ adapters: [os, inApp] });

    const unsubscribe = bindNotificationManager(bus, manager);

    bus.emit("follow_up.sent", {
      applicationId: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      status: "follow_up_sent",
      followUpCount: 1,
      nextFollowUp: "2026-06-03T09:00:00.000Z",
      communicationId: "comm-1",
      sentAt: new Date("2026-05-27T09:00:00Z"),
    });
    await Promise.resolve();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(os.sent[0]).toMatchObject({
      type: "follow_up.reminder",
      priority: "medium",
      title: "Follow-up sent",
      body: "Follow-up 1 sent to Northstar Labs.",
      metadata: {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        followUpCount: 1,
        nextFollowUp: "2026-06-03T09:00:00.000Z",
        communicationId: "comm-1",
      },
    });

    unsubscribe();
    bus.emit("follow_up.sent", {
      applicationId: "app-2",
      jobId: "job-2",
      companyName: "Signal Ridge",
      status: "follow_up_sent",
      followUpCount: 1,
      nextFollowUp: null,
      communicationId: "comm-2",
      sentAt: new Date("2026-05-27T09:00:00Z"),
    });
    await Promise.resolve();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
  });
});
