import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { deliverWorkflowOsNotifications } from "./os-notifications";
import { isDesktopRuntime } from "./tauri-api";

export function deliverTauriWorkflowOsNotifications(result: unknown) {
  return deliverWorkflowOsNotifications(result, {
    isDesktopRuntime,
    isPermissionGranted,
    requestPermission,
    sendNotification,
  });
}
