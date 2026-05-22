import { describe, expect, it } from "vitest";
import {
  createDiscordNotificationAdapter,
  createTelegramNotificationAdapter,
} from "./webhook-adapters.js";
import type { NotificationDelivery } from "./notification-manager.js";

const notification: NotificationDelivery = {
  type: "response.received",
  title: "Response received",
  body: "Northstar Labs replied: Interview availability",
  metadata: {
    applicationId: "app-1",
    companyName: "Northstar Labs",
  },
  channel: "telegram",
  priority: "high",
  createdAt: new Date("2026-05-29T09:30:00Z"),
};

describe("webhook notification adapters", () => {
  it("sends Telegram notifications through the Bot API", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const adapter = createTelegramNotificationAdapter({
      botToken: "telegram-token",
      chatId: "chat-1",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });

    await adapter.send(notification);

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(
      "https://api.telegram.org/bottelegram-token/sendMessage",
    );
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      chat_id: "chat-1",
      disable_web_page_preview: true,
      text: [
        "[high] Response received",
        "Northstar Labs replied: Interview availability",
        "applicationId: app-1",
        "companyName: Northstar Labs",
      ].join("\n"),
    });
  });

  it("sends Discord notifications through a webhook", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    const adapter = createDiscordNotificationAdapter({
      webhookUrl: "https://discord.example/webhook",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(null, { status: 204 });
      },
    });

    await adapter.send({
      ...notification,
      channel: "discord",
      priority: "critical",
      title: "Offer received",
      body: "Northstar Labs sent an offer.",
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://discord.example/webhook");
    expect(requests[0].init?.method).toBe("POST");
    expect(JSON.parse(String(requests[0].init?.body))).toEqual({
      content: "**[critical] Offer received**\nNorthstar Labs sent an offer.",
      embeds: [
        {
          title: "Offer received",
          description: "Northstar Labs sent an offer.",
          color: 14549810,
          timestamp: "2026-05-29T09:30:00.000Z",
          fields: [
            { name: "type", value: "response.received", inline: true },
            { name: "priority", value: "critical", inline: true },
            { name: "applicationId", value: "app-1", inline: true },
            { name: "companyName", value: "Northstar Labs", inline: true },
          ],
        },
      ],
    });
  });

  it("surfaces webhook delivery failures", async () => {
    const adapter = createTelegramNotificationAdapter({
      botToken: "telegram-token",
      chatId: "chat-1",
      fetch: async () => new Response("bad token", { status: 401 }),
    });

    await expect(adapter.send(notification)).rejects.toThrow(
      "Telegram notification failed with HTTP 401",
    );
  });
});
