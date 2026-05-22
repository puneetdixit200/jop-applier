import type { FetchLike } from "../ai/providers/http.js";
import type { NotificationAdapter, NotificationDelivery } from "./notification-manager.js";

export type TelegramNotificationAdapterConfig = {
  botToken: string;
  chatId: string;
  fetch?: FetchLike;
};

export type DiscordNotificationAdapterConfig = {
  webhookUrl: string;
  fetch?: FetchLike;
};

export function createTelegramNotificationAdapter(
  config: TelegramNotificationAdapterConfig,
): NotificationAdapter {
  const fetchClient = config.fetch ?? fetch;

  return {
    channel: "telegram",
    send: async (notification) => {
      const response = await fetchClient(
        `https://api.telegram.org/bot${encodeURIComponent(config.botToken)}/sendMessage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            chat_id: config.chatId,
            disable_web_page_preview: true,
            text: notificationText(notification),
          }),
        },
      );

      if (!response.ok) {
        throw new Error(`Telegram notification failed with HTTP ${response.status}`);
      }
    },
  };
}

export function createDiscordNotificationAdapter(
  config: DiscordNotificationAdapterConfig,
): NotificationAdapter {
  const fetchClient = config.fetch ?? fetch;

  return {
    channel: "discord",
    send: async (notification) => {
      const response = await fetchClient(config.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `**[${notification.priority}] ${notification.title}**\n${notification.body}`,
          embeds: [
            {
              title: notification.title,
              description: notification.body,
              color: priorityColor(notification.priority),
              timestamp: notification.createdAt.toISOString(),
              fields: discordFields(notification),
            },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`Discord notification failed with HTTP ${response.status}`);
      }
    },
  };
}

function notificationText(notification: NotificationDelivery): string {
  return [
    `[${notification.priority}] ${notification.title}`,
    notification.body,
    ...metadataEntries(notification).map(([key, value]) => `${key}: ${value}`),
  ].join("\n");
}

function discordFields(notification: NotificationDelivery) {
  return [
    { name: "type", value: notification.type, inline: true },
    { name: "priority", value: notification.priority, inline: true },
    ...metadataEntries(notification).map(([key, value]) => ({
      name: key,
      value,
      inline: true,
    })),
  ];
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

function priorityColor(priority: NotificationDelivery["priority"]): number {
  switch (priority) {
    case "critical":
      return 0xde0332;
    case "high":
      return 0xf39c12;
    case "medium":
      return 0x5865f2;
    case "low":
      return 0x95a5a6;
  }
}
