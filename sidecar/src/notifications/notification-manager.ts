import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type NotificationChannel = "os" | "in_app" | "telegram" | "discord" | "email";

export type NotificationPriority = "low" | "medium" | "high" | "critical";

export type NotificationEventType =
  | "job.high_match_found"
  | "application.submitted"
  | "application.failed"
  | "response.received"
  | "follow_up.reminder"
  | "interview.scheduled"
  | "offer.received"
  | "digest.daily"
  | "ai.provider.offline"
  | "analytics.weekly_report";

export type NotificationRequest = {
  type: NotificationEventType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export type NotificationDelivery = NotificationRequest & {
  channel: NotificationChannel;
  priority: NotificationPriority;
  createdAt: Date;
};

export type NotificationAdapter = {
  channel: NotificationChannel;
  send(notification: NotificationDelivery): Promise<void>;
};

export type NotificationManagerOptions = {
  adapters: NotificationAdapter[];
  disabledChannels?: NotificationChannel[];
};

type NotificationRule = {
  priority: NotificationPriority;
  channels: NotificationChannel[];
};

const NOTIFICATION_RULES: Record<NotificationEventType, NotificationRule> = {
  "job.high_match_found": { priority: "high", channels: ["os", "in_app"] },
  "application.submitted": { priority: "medium", channels: ["in_app"] },
  "application.failed": { priority: "high", channels: ["os", "in_app"] },
  "response.received": { priority: "high", channels: ["os", "telegram", "in_app"] },
  "follow_up.reminder": { priority: "medium", channels: ["os", "in_app"] },
  "interview.scheduled": { priority: "critical", channels: ["os", "telegram", "email", "in_app"] },
  "offer.received": { priority: "critical", channels: ["os", "in_app", "telegram", "discord", "email"] },
  "digest.daily": { priority: "low", channels: ["email", "telegram", "in_app"] },
  "ai.provider.offline": { priority: "high", channels: ["os", "in_app"] },
  "analytics.weekly_report": { priority: "low", channels: ["email", "in_app"] },
};

export class NotificationManager {
  private readonly adapters = new Map<NotificationChannel, NotificationAdapter>();
  private readonly disabledChannels: Set<NotificationChannel>;

  constructor(options: NotificationManagerOptions) {
    for (const adapter of options.adapters) {
      this.adapters.set(adapter.channel, adapter);
    }
    this.disabledChannels = new Set(options.disabledChannels ?? []);
  }

  async notify(request: NotificationRequest): Promise<NotificationDelivery[]> {
    const rule = NOTIFICATION_RULES[request.type];
    const createdAt = new Date();
    const deliveries = rule.channels
      .filter((channel) => !this.disabledChannels.has(channel))
      .map((channel) => ({
        ...request,
        channel,
        priority: rule.priority,
        createdAt,
      }));

    for (const delivery of deliveries) {
      const adapter = this.adapters.get(delivery.channel);
      if (adapter) {
        await adapter.send(delivery);
      }
    }

    return deliveries;
  }
}

export function bindNotificationManager(
  bus: EventBus<CareerEventMap>,
  manager: NotificationManager,
): () => void {
  const unsubscribeProviderOffline = bus.on("ai.provider.offline", (event) => {
    void manager.notify({
      type: "ai.provider.offline",
      title: "AI provider went offline",
      body: `${event.provider} ${event.model} is unavailable: ${event.reason}`,
      metadata: {
        provider: event.provider,
        model: event.model,
        reason: event.reason,
      },
    });
  });
  const unsubscribeFollowUpSent = bus.on("follow_up.sent", (event) => {
    void manager.notify({
      type: "follow_up.reminder",
      title: event.status === "ghosted" ? "Application marked ghosted" : "Follow-up sent",
      body:
        event.status === "ghosted"
          ? `Final follow-up sent to ${event.companyName}; application marked ghosted.`
          : `Follow-up ${event.followUpCount} sent to ${event.companyName}.`,
      metadata: {
        applicationId: event.applicationId,
        jobId: event.jobId,
        companyName: event.companyName,
        followUpCount: event.followUpCount,
        nextFollowUp: event.nextFollowUp,
        communicationId: event.communicationId,
      },
    });
  });
  const unsubscribeApplicationFailed = bus.on("application.failed", (event) => {
    void manager.notify({
      type: "application.failed",
      title: event.status === "permanently_failed" ? "Application permanently failed" : "Application failed",
      body: `${event.companyName} application failed: ${event.reason}`,
      metadata: {
        applicationId: event.applicationId,
        jobId: event.jobId,
        companyName: event.companyName,
        status: event.status,
        reason: event.reason,
      },
    });
  });

  return () => {
    unsubscribeProviderOffline();
    unsubscribeFollowUpSent();
    unsubscribeApplicationFailed();
  };
}
