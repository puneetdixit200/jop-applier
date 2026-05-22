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
    await flushNotifications();

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
    await flushNotifications();

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
    await flushNotifications();

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
    await flushNotifications();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
  });

  it("subscribes to high-match discovery events and emits job notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const manager = new NotificationManager({ adapters: [os, inApp] });

    bindNotificationManager(bus, manager);

    bus.emit("job.discovered", {
      jobId: "job-1",
      platform: "linkedin",
      title: "Frontend Engineer Intern",
      companyName: "Northstar Labs",
      matchScore: 91,
      priority: "high",
      shouldApply: true,
    });
    await flushNotifications();

    expect(os.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(os.sent[0]).toMatchObject({
      type: "job.high_match_found",
      priority: "high",
      title: "High-match job found",
      body: "Frontend Engineer Intern at Northstar Labs matched your profile.",
      metadata: {
        jobId: "job-1",
        platform: "linkedin",
        companyName: "Northstar Labs",
        matchScore: 91,
        priority: "high",
      },
    });
  });

  it("subscribes to application submitted events and emits in-app notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const manager = new NotificationManager({ adapters: [os, inApp] });

    bindNotificationManager(bus, manager);

    bus.emit("application.submitted", {
      applicationId: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      confirmationId: "CONF-42",
      submittedAt: new Date("2026-05-28T12:00:00Z"),
    });
    await flushNotifications();

    expect(os.sent).toHaveLength(0);
    expect(inApp.sent).toHaveLength(1);
    expect(inApp.sent[0]).toMatchObject({
      type: "application.submitted",
      priority: "medium",
      title: "Application submitted",
      body: "Application submitted to Northstar Labs.",
      metadata: {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        confirmationId: "CONF-42",
      },
    });
  });

  it("subscribes to response received events and emits high-priority response notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const telegram = new RecordingAdapter("telegram");
    const manager = new NotificationManager({ adapters: [os, inApp, telegram] });

    bindNotificationManager(bus, manager);

    bus.emit("response.received", {
      applicationId: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      communicationId: "comm-1",
      responseType: "positive",
      subject: "Interview availability",
      receivedAt: new Date("2026-05-29T09:30:00Z"),
    });
    await flushNotifications();

    expect(os.sent).toHaveLength(1);
    expect(telegram.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(os.sent[0]).toMatchObject({
      type: "response.received",
      priority: "high",
      title: "Response received",
      body: "Northstar Labs replied: Interview availability",
      metadata: {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        communicationId: "comm-1",
        responseType: "positive",
        subject: "Interview availability",
      },
    });
  });

  it("maps interview and offer responses to critical notification types", async () => {
    const bus = new EventBus<CareerEventMap>();
    const os = new RecordingAdapter("os");
    const inApp = new RecordingAdapter("in_app");
    const telegram = new RecordingAdapter("telegram");
    const email = new RecordingAdapter("email");
    const manager = new NotificationManager({ adapters: [os, inApp, telegram, email] });

    bindNotificationManager(bus, manager);

    bus.emit("response.received", {
      applicationId: "app-1",
      jobId: "job-1",
      companyName: "Northstar Labs",
      communicationId: "comm-1",
      responseType: "interview",
      subject: "Interview availability",
      receivedAt: new Date("2026-05-29T09:30:00Z"),
    });
    bus.emit("response.received", {
      applicationId: "app-2",
      jobId: "job-2",
      companyName: "Signal Ridge",
      communicationId: "comm-2",
      responseType: "offer",
      subject: "Offer details",
      receivedAt: new Date("2026-05-29T10:30:00Z"),
    });
    await flushNotifications();

    expect(os.sent.map((notification) => notification.type)).toEqual([
      "interview.scheduled",
      "offer.received",
    ]);
    expect(email.sent.map((notification) => notification.type)).toEqual([
      "interview.scheduled",
      "offer.received",
    ]);
    expect(telegram.sent.map((notification) => notification.type)).toEqual([
      "interview.scheduled",
      "offer.received",
    ]);
    expect(inApp.sent.map((notification) => notification.title)).toContain("Offer received");
  });

  it("subscribes to analytics refresh events and emits weekly report notifications", async () => {
    const bus = new EventBus<CareerEventMap>();
    const inApp = new RecordingAdapter("in_app");
    const email = new RecordingAdapter("email");
    const manager = new NotificationManager({ adapters: [inApp, email] });

    bindNotificationManager(bus, manager);

    bus.emit("analytics.refreshed", {
      generatedAt: new Date("2026-05-31T08:00:00Z"),
      totalApplications: 42,
      responseRate: 21.4,
      interviewRate: 9.5,
      offerRate: 2.4,
    });
    await flushNotifications();

    expect(email.sent).toHaveLength(1);
    expect(inApp.sent).toHaveLength(1);
    expect(email.sent[0]).toMatchObject({
      type: "analytics.weekly_report",
      priority: "low",
      title: "Weekly analytics report",
      body: "Applications 42; response rate 21.4%; interview rate 9.5%; offer rate 2.4%.",
    });
  });
});

async function flushNotifications(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}
