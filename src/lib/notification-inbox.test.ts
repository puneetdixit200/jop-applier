import { describe, expect, it } from "vitest";
import { buildNotificationInbox } from "./notification-inbox";
import type { Notification } from "./tauri-api";

describe("notification inbox", () => {
  it("shows in-app notifications with unread and high-priority counts", () => {
    const inbox = buildNotificationInbox([
      notification({
        id: "read-response",
        type: "response.received",
        title: "Response received",
        body: "Northstar Labs replied: Interview availability",
        priority: "high",
        channel: "in_app",
        read_at: "2026-05-29T11:00:00Z",
        created_at: "2026-05-29T09:30:00Z",
      }),
      notification({
        id: "telegram-only",
        type: "offer.received",
        title: "Offer received",
        body: "Telegram-only notification",
        priority: "critical",
        channel: "telegram",
        created_at: "2026-05-29T10:00:00Z",
      }),
      notification({
        id: "unread-failure",
        type: "application.failed",
        title: "Application failed",
        body: "Northstar Labs application failed: captcha challenge",
        priority: "high",
        channel: "in_app",
        created_at: "2026-05-29T10:30:00Z",
      }),
      notification({
        id: "unread-submitted",
        type: "application.submitted",
        title: "Application submitted",
        body: "Application submitted to Helio Systems.",
        priority: "medium",
        channel: "in_app",
        created_at: "2026-05-29T08:00:00Z",
      }),
    ]);

    expect(inbox.summary).toEqual({
      total: 3,
      unread: 2,
      highPriorityUnread: 1,
    });
    expect(inbox.items.map((item) => [item.id, item.isUnread, item.priorityLabel])).toEqual([
      ["unread-failure", true, "High"],
      ["unread-submitted", true, "Medium"],
      ["read-response", false, "High"],
    ]);
    expect(inbox.items[0]).toMatchObject({
      title: "Application failed",
      body: "Northstar Labs application failed: captcha challenge",
      timestampLabel: "May 29 10:30 UTC",
    });
  });

  it("returns an empty inbox for non-in-app notifications", () => {
    expect(
      buildNotificationInbox([
        notification({
          id: "os-only",
          channel: "os",
          priority: "high",
        }),
      ]),
    ).toEqual({
      summary: {
        total: 0,
        unread: 0,
        highPriorityUnread: 0,
      },
      items: [],
    });
  });
});

function notification(overrides: Partial<Notification>): Notification {
  return {
    id: "notification",
    type: "application.submitted",
    title: "Application submitted",
    body: "Application submitted.",
    priority: "medium",
    channel: "in_app",
    metadata: {},
    read_at: null,
    created_at: "2026-05-29T09:00:00Z",
    ...overrides,
  };
}
