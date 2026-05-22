import { describe, expect, it, vi } from "vitest";
import {
  deliverWorkflowOsNotifications,
  workflowOsNotifications,
  type OsNotificationDependencies,
} from "./os-notifications";

function dependencies(
  overrides: Partial<OsNotificationDependencies> = {},
): OsNotificationDependencies {
  return {
    isDesktopRuntime: () => true,
    isPermissionGranted: vi.fn(async () => true),
    requestPermission: vi.fn(async () => "denied"),
    sendNotification: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("workflow OS notifications", () => {
  it("extracts only valid OS-channel notifications from workflow results", () => {
    expect(
      workflowOsNotifications({
        notifications: [
          notification({ channel: "os", title: "Application failed" }),
          notification({ channel: "in_app", title: "Application failed" }),
          { channel: "os", title: "Missing body" },
        ],
      }),
    ).toEqual([notification({ channel: "os", title: "Application failed" })]);
  });

  it("sends OS notifications when permission is already granted", async () => {
    const sent: Array<{ title: string; body: string }> = [];
    const deps = dependencies({
      isPermissionGranted: vi.fn(async () => true),
      requestPermission: vi.fn(async () => "denied"),
      sendNotification: vi.fn(async (message) => {
        sent.push(message);
      }),
    });

    await expect(
      deliverWorkflowOsNotifications(
        {
          notifications: [
            notification({
              channel: "os",
              title: "Application failed",
              body: "Northstar Labs application failed: captcha challenge",
            }),
            notification({ channel: "in_app", title: "Application failed" }),
          ],
        },
        deps,
      ),
    ).resolves.toEqual({
      attempted: 1,
      delivered: 1,
      skipped: 0,
      permission: "granted",
    });
    expect(deps.requestPermission).not.toHaveBeenCalled();
    expect(sent).toEqual([
      {
        title: "Application failed",
        body: "Northstar Labs application failed: captcha challenge",
      },
    ]);
  });

  it("requests permission once before sending a notification batch", async () => {
    const deps = dependencies({
      isPermissionGranted: vi.fn(async () => false),
      requestPermission: vi.fn(async () => "granted"),
    });

    await expect(
      deliverWorkflowOsNotifications(
        {
          notifications: [
            notification({ channel: "os", title: "Response received" }),
            notification({ channel: "os", title: "Follow-up sent" }),
          ],
        },
        deps,
      ),
    ).resolves.toEqual({
      attempted: 2,
      delivered: 2,
      skipped: 0,
      permission: "granted",
    });
    expect(deps.requestPermission).toHaveBeenCalledOnce();
    expect(deps.sendNotification).toHaveBeenCalledTimes(2);
  });

  it("skips OS notifications outside the desktop runtime", async () => {
    const deps = dependencies({
      isDesktopRuntime: () => false,
    });

    await expect(
      deliverWorkflowOsNotifications(
        { notifications: [notification({ channel: "os" })] },
        deps,
      ),
    ).resolves.toEqual({
      attempted: 1,
      delivered: 0,
      skipped: 1,
      permission: "unavailable",
    });
    expect(deps.isPermissionGranted).not.toHaveBeenCalled();
    expect(deps.sendNotification).not.toHaveBeenCalled();
  });

  it("skips OS notifications when permission is denied", async () => {
    const deps = dependencies({
      isPermissionGranted: vi.fn(async () => false),
      requestPermission: vi.fn(async () => "denied"),
    });

    await expect(
      deliverWorkflowOsNotifications(
        { notifications: [notification({ channel: "os" })] },
        deps,
      ),
    ).resolves.toEqual({
      attempted: 1,
      delivered: 0,
      skipped: 1,
      permission: "denied",
    });
    expect(deps.sendNotification).not.toHaveBeenCalled();
  });
});

function notification(overrides: Record<string, unknown> = {}) {
  return {
    type: "application.failed",
    title: "Application failed",
    body: "Northstar Labs application failed: captcha challenge",
    priority: "high",
    channel: "os",
    createdAt: "2026-05-28T12:45:00.000Z",
    metadata: {
      applicationId: "app-1",
    },
    ...overrides,
  };
}
