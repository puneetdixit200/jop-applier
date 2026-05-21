import type { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";

export type ScheduledTask = {
  id: string;
  name: string;
  type: string;
  cronExpression: string | null;
  isEnabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  config: Record<string, unknown>;
};

export type ScheduledTaskRunUpdate = {
  lastRun: string;
  nextRun: string | null;
};

export type ScheduledTaskRunnerDependencies = {
  listScheduledTasks: () => Promise<ScheduledTask[]>;
  runWorkflow: (workflowId: string) => Promise<unknown>;
  updateScheduledTaskRun: (taskId: string, update: ScheduledTaskRunUpdate) => Promise<void>;
  calculateNextRun: (task: ScheduledTask, now: Date) => string | null;
};

export type ScheduledTaskRunnerOptions = {
  now: Date;
  workflowsByTaskType: Record<string, string>;
  eventBus?: EventBus<CareerEventMap>;
};

export type ScheduledTaskRunnerResult = {
  scanned: number;
  due: number;
  completed: number;
  failed: number;
  skipped: number;
};

export async function runDueScheduledTasks(
  dependencies: ScheduledTaskRunnerDependencies,
  options: ScheduledTaskRunnerOptions,
): Promise<ScheduledTaskRunnerResult> {
  const tasks = await dependencies.listScheduledTasks();
  const dueTasks = tasks.filter((task) => isTaskDue(task, options.now));
  const result: ScheduledTaskRunnerResult = {
    scanned: tasks.length,
    due: dueTasks.length,
    completed: 0,
    failed: 0,
    skipped: tasks.length - dueTasks.length,
  };

  for (const task of dueTasks) {
    const workflowId = options.workflowsByTaskType[task.type] ?? null;
    if (workflowId === null) {
      result.failed += 1;
      options.eventBus?.emit("scheduled_task.failed", {
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        workflowId: null,
        reason: `No workflow registered for scheduled task type: ${task.type}`,
        failedAt: options.now,
      });
      continue;
    }

    options.eventBus?.emit("scheduled_task.started", {
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      workflowId,
      startedAt: options.now,
    });

    try {
      await dependencies.runWorkflow(workflowId);
      const update = {
        lastRun: options.now.toISOString(),
        nextRun: dependencies.calculateNextRun(task, options.now),
      };
      await dependencies.updateScheduledTaskRun(task.id, update);

      result.completed += 1;
      options.eventBus?.emit("scheduled_task.completed", {
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        workflowId,
        nextRun: update.nextRun,
        completedAt: options.now,
      });
    } catch (error) {
      result.failed += 1;
      options.eventBus?.emit("scheduled_task.failed", {
        taskId: task.id,
        taskName: task.name,
        taskType: task.type,
        workflowId,
        reason: error instanceof Error ? error.message : String(error),
        failedAt: options.now,
      });
    }
  }

  return result;
}

function isTaskDue(task: ScheduledTask, now: Date): boolean {
  if (!task.isEnabled || task.nextRun === null) {
    return false;
  }

  const nextRun = new Date(task.nextRun);
  return Number.isFinite(nextRun.getTime()) && nextRun <= now;
}
