export type WorkflowOsNotification = {
  type: string;
  title: string;
  body: string;
  priority: string;
  channel: "os";
  createdAt?: string;
  metadata?: Record<string, unknown>;
};

export type OsNotificationDependencies = {
  isDesktopRuntime: () => boolean;
  isPermissionGranted: () => Promise<boolean>;
  requestPermission: () => Promise<string>;
  sendNotification: (notification: { title: string; body: string }) => Promise<void> | void;
};

export type OsNotificationDeliveryResult = {
  attempted: number;
  delivered: number;
  skipped: number;
  permission: "granted" | "denied" | "unavailable" | "not_required";
};

export function workflowOsNotifications(result: unknown): WorkflowOsNotification[] {
  if (!isRecord(result) || !Array.isArray(result.notifications)) {
    return [];
  }

  return result.notifications.filter(isWorkflowOsNotification);
}

export async function deliverWorkflowOsNotifications(
  result: unknown,
  dependencies: OsNotificationDependencies,
): Promise<OsNotificationDeliveryResult> {
  const notifications = workflowOsNotifications(result);
  const attempted = notifications.length;

  if (attempted === 0) {
    return {
      attempted,
      delivered: 0,
      skipped: 0,
      permission: "not_required",
    };
  }

  if (!dependencies.isDesktopRuntime()) {
    return {
      attempted,
      delivered: 0,
      skipped: attempted,
      permission: "unavailable",
    };
  }

  const permission = await notificationPermission(dependencies);
  if (permission !== "granted") {
    return {
      attempted,
      delivered: 0,
      skipped: attempted,
      permission: "denied",
    };
  }

  for (const notification of notifications) {
    await dependencies.sendNotification({
      title: notification.title,
      body: notification.body,
    });
  }

  return {
    attempted,
    delivered: attempted,
    skipped: 0,
    permission,
  };
}

async function notificationPermission(
  dependencies: OsNotificationDependencies,
): Promise<"granted" | "denied"> {
  if (await dependencies.isPermissionGranted()) {
    return "granted";
  }

  return (await dependencies.requestPermission()) === "granted" ? "granted" : "denied";
}

function isWorkflowOsNotification(value: unknown): value is WorkflowOsNotification {
  return (
    isRecord(value) &&
    value.channel === "os" &&
    typeof value.type === "string" &&
    typeof value.title === "string" &&
    typeof value.body === "string" &&
    typeof value.priority === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
