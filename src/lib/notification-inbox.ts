import type { Notification } from "./tauri-api";

export type NotificationInboxItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  priority: string;
  priorityLabel: string;
  channel: string;
  timestamp: string;
  timestampLabel: string;
  isUnread: boolean;
};

export type NotificationInbox = {
  summary: {
    total: number;
    unread: number;
    highPriorityUnread: number;
  };
  items: NotificationInboxItem[];
};

export function buildNotificationInbox(notifications: Notification[]): NotificationInbox {
  const items = notifications
    .filter((notification) => notification.channel === "in_app")
    .map(notificationInboxItem)
    .sort((left, right) => {
      if (left.isUnread !== right.isUnread) {
        return left.isUnread ? -1 : 1;
      }
      const timeDiff = timestampValue(right.timestamp) - timestampValue(left.timestamp);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      return left.id.localeCompare(right.id);
    });
  const unread = items.filter((item) => item.isUnread);

  return {
    summary: {
      total: items.length,
      unread: unread.length,
      highPriorityUnread: unread.filter((item) => isHighPriority(item.priority)).length,
    },
    items,
  };
}

function notificationInboxItem(notification: Notification): NotificationInboxItem {
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    priority: notification.priority,
    priorityLabel: titleCase(notification.priority),
    channel: notification.channel,
    timestamp: notification.created_at,
    timestampLabel: formatTimestamp(notification.created_at),
    isUnread: notification.read_at === null,
  };
}

function isHighPriority(priority: string) {
  return priority === "high" || priority === "critical";
}

function timestampValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return `${date
    .toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
    })
    .replace(",", "")} UTC`;
}

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
