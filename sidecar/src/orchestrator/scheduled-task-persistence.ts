import { calculateNextRunFromSchedule } from "./default-schedules.js";
import type {
  ScheduledTask,
  ScheduledTaskRunUpdate,
  ScheduledTaskRunnerDependencies,
} from "./scheduled-task-runner.js";

export type PersistedScheduledTask = {
  id: string;
  name: string;
  type: string;
  cron_expression: string | null;
  is_enabled: boolean;
  last_run: string | null;
  next_run: string | null;
  config: Record<string, unknown>;
  created_at: string;
};

export type PersistedScheduledTaskRunUpdate = {
  last_run: string;
  next_run: string | null;
};

export type ScheduledTaskPersistence = {
  listScheduledTasks: () => Promise<PersistedScheduledTask[]>;
  updateScheduledTaskRun: (id: string, update: PersistedScheduledTaskRunUpdate) => Promise<unknown>;
};

export function createScheduledTaskRunnerDependencies(
  persistence: ScheduledTaskPersistence,
  runWorkflow: (workflowId: string) => Promise<unknown>,
): ScheduledTaskRunnerDependencies {
  return {
    listScheduledTasks: async () => {
      const tasks = await persistence.listScheduledTasks();
      return tasks.map(toRunnerScheduledTask);
    },
    runWorkflow,
    updateScheduledTaskRun: async (id, update) => {
      await persistence.updateScheduledTaskRun(id, toPersistedRunUpdate(update));
    },
    calculateNextRun: calculateNextRunFromSchedule,
  };
}

function toRunnerScheduledTask(task: PersistedScheduledTask): ScheduledTask {
  return {
    id: task.id,
    name: task.name,
    type: task.type,
    cronExpression: task.cron_expression,
    isEnabled: task.is_enabled,
    lastRun: task.last_run,
    nextRun: task.next_run,
    config: task.config,
  };
}

function toPersistedRunUpdate(update: ScheduledTaskRunUpdate): PersistedScheduledTaskRunUpdate {
  return {
    last_run: update.lastRun,
    next_run: update.nextRun,
  };
}
