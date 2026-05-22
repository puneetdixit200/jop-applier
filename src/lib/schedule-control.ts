import {
  scheduledTaskSummaries,
  type ScheduledTaskSummary,
} from "./schedule-settings";
import type { ScheduledTask, ScheduledTaskRunResult } from "./tauri-api";

export type ScheduleControlDependencies = {
  isDesktopRuntime: () => boolean;
  runDueScheduledTasks: () => Promise<ScheduledTaskRunResult>;
  listScheduledTasks: () => Promise<ScheduledTask[]>;
  deliverWorkflowOsNotifications?: (result: unknown) => Promise<unknown>;
};

export type ScheduleControlResult = {
  workflowStatus: string;
  schedules?: ScheduledTaskSummary[];
};

export async function runScheduleControl(
  dependencies: ScheduleControlDependencies,
): Promise<ScheduleControlResult> {
  if (!dependencies.isDesktopRuntime()) {
    return { workflowStatus: "Browser preview" };
  }

  const result = await dependencies.runDueScheduledTasks();
  if (result.notifications && result.notifications.length > 0) {
    await dependencies
      .deliverWorkflowOsNotifications?.({ notifications: result.notifications })
      .catch(() => undefined);
  }
  const tasks = await dependencies.listScheduledTasks();

  return {
    workflowStatus: `Scheduled tasks: ${result.completed}/${result.due} completed`,
    schedules: scheduledTaskSummaries(tasks, 8),
  };
}
