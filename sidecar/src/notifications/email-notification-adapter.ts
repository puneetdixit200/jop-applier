import {
  createSmtpEmailSender,
  type EmailAccountConfig,
  type OutboundEmail,
  type SentEmailResult,
} from "../communications/email-adapter.js";
import type { NotificationAdapter, NotificationDelivery } from "./notification-manager.js";

export type EmailNotificationAdapterConfig = {
  account: EmailAccountConfig;
  to: string | string[];
  sendEmail?: (email: OutboundEmail) => Promise<SentEmailResult>;
};

export function createEmailNotificationAdapter(
  config: EmailNotificationAdapterConfig,
): NotificationAdapter {
  const sendEmail = config.sendEmail ?? createSmtpEmailSender(config.account).sendEmail;

  return {
    channel: "email",
    send: async (notification) => {
      await sendEmail({
        to: config.to,
        subject: `[${notification.priority}] ${notification.title}`,
        body: notificationEmailBody(notification),
      });
    },
  };
}

function notificationEmailBody(notification: NotificationDelivery): string {
  return [
    notification.body,
    "",
    `Type: ${notification.type}`,
    `Priority: ${notification.priority}`,
    `Created: ${notification.createdAt.toISOString()}`,
    ...metadataEntries(notification).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

function metadataEntries(notification: NotificationDelivery): Array<[string, string]> {
  return Object.entries(notification.metadata ?? {}).flatMap(([key, value]) => {
    const text = metadataValue(value);
    return text ? [[key, text]] : [];
  });
}

function metadataValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
