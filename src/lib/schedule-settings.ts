import type { ScheduledTask, UpsertScheduledTask } from "./tauri-api";

type ScheduleCadence =
  | { kind: "interval"; minutes: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "windowed_interval"; everyHours: number; startHour: number; endHour: number; minute: number };

type DefaultScheduleTemplate = {
  name: string;
  type: string;
  cronExpression: string;
  description: string;
  cadence: ScheduleCadence;
};

export type ScheduledTaskSummary = {
  id: string;
  name: string;
  nextRunLabel: string;
};

export type ScheduleTaskDependencies = {
  listScheduledTasks: () => Promise<ScheduledTask[]>;
  saveScheduledTask: (task: UpsertScheduledTask) => Promise<ScheduledTask>;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const defaultScheduleTemplates: DefaultScheduleTemplate[] = [
  {
    name: "Job Discovery",
    type: "discovery",
    cronExpression: "0 8-20/4 * * *",
    description: "Search all enabled platforms",
    cadence: { kind: "windowed_interval", everyHours: 4, startHour: 8, endHour: 20, minute: 0 },
  },
  {
    name: "Application Processing",
    type: "apply",
    cronExpression: "*/30 * * * *",
    description: "Process queued applications",
    cadence: { kind: "interval", minutes: 30 },
  },
  {
    name: "Follow-up Check",
    type: "follow_up",
    cronExpression: "0 9 * * *",
    description: "Send due follow-ups",
    cadence: { kind: "daily", hour: 9, minute: 0 },
  },
  {
    name: "Email Check",
    type: "email_check",
    cronExpression: "*/15 * * * *",
    description: "Check for responses via IMAP",
    cadence: { kind: "interval", minutes: 15 },
  },
  {
    name: "Funded Company Prospecting",
    type: "prospecting_scan",
    cronExpression: "0 8 * * *",
    description: "Scan recently funded companies and prepare outreach prospects",
    cadence: { kind: "daily", hour: 8, minute: 0 },
  },
  {
    name: "Outreach Sending Window",
    type: "outreach_send",
    cronExpression: "0 9-18/2 * * *",
    description: "Send queued outreach emails during business hours",
    cadence: { kind: "windowed_interval", everyHours: 2, startHour: 9, endHour: 18, minute: 0 },
  },
  {
    name: "Outreach Follow-ups",
    type: "outreach_follow_up",
    cronExpression: "0 10 * * *",
    description: "Queue due outreach follow-up steps",
    cadence: { kind: "daily", hour: 10, minute: 0 },
  },
  {
    name: "Analytics Refresh",
    type: "analytics",
    cronExpression: "0 0 * * *",
    description: "Recalculate all metrics",
    cadence: { kind: "daily", hour: 0, minute: 0 },
  },
  {
    name: "Weekly Analytics Report",
    type: "weekly_analytics_report",
    cronExpression: "0 8 * * 0",
    description: "Send weekly analytics report",
    cadence: { kind: "weekly", dayOfWeek: 0, hour: 8, minute: 0 },
  },
  {
    name: "Daily Digest",
    type: "digest",
    cronExpression: "0 18 * * *",
    description: "Send daily application digest",
    cadence: { kind: "daily", hour: 18, minute: 0 },
  },
  {
    name: "Export Sync",
    type: "export",
    cronExpression: "0 */6 * * *",
    description: "Sync to Notion/Sheets",
    cadence: { kind: "interval", minutes: 360 },
  },
  {
    name: "Session Health",
    type: "session_health",
    cronExpression: "0 */2 * * *",
    description: "Verify browser sessions are valid",
    cadence: { kind: "interval", minutes: 120 },
  },
  {
    name: "Cleanup",
    type: "cleanup",
    cronExpression: "0 3 * * 0",
    description: "Purge old AI cache, archive old jobs",
    cadence: { kind: "weekly", dayOfWeek: 0, hour: 3, minute: 0 },
  },
];

export function buildDefaultScheduledTasks(now: Date = new Date()): UpsertScheduledTask[] {
  return defaultScheduleTemplates.map((task) => ({
    name: task.name,
    type: task.type,
    cron_expression: task.cronExpression,
    is_enabled: true,
    last_run: null,
    next_run: nextRunFromCadence(task.cadence, now).toISOString(),
    config: {
      description: task.description,
      cadence: task.cadence,
    },
  }));
}

export async function loadOrSeedScheduledTasks(
  dependencies: ScheduleTaskDependencies,
  now: Date = new Date(),
): Promise<ScheduledTask[]> {
  const existingTasks = await dependencies.listScheduledTasks();
  if (existingTasks.length > 0) {
    return existingTasks;
  }

  const savedTasks: ScheduledTask[] = [];
  for (const task of buildDefaultScheduledTasks(now)) {
    savedTasks.push(await dependencies.saveScheduledTask(task));
  }
  return savedTasks;
}

export function scheduledTaskSummaries(tasks: ScheduledTask[], limit = 4): ScheduledTaskSummary[] {
  return tasks
    .filter((task) => task.is_enabled && task.next_run !== null && Number.isFinite(new Date(task.next_run).getTime()))
    .sort((left, right) => new Date(left.next_run ?? 0).getTime() - new Date(right.next_run ?? 0).getTime())
    .slice(0, limit)
    .map((task) => ({
      id: task.id,
      name: task.name,
      nextRunLabel: formatUtcDateTime(task.next_run),
    }));
}

function nextRunFromCadence(cadence: ScheduleCadence, now: Date): Date {
  switch (cadence.kind) {
    case "interval":
      return new Date(now.getTime() + cadence.minutes * MINUTE_MS);
    case "daily":
      return nextDailyRun(now, cadence.hour, cadence.minute);
    case "weekly":
      return nextWeeklyRun(now, cadence.dayOfWeek, cadence.hour, cadence.minute);
    case "windowed_interval":
      return nextWindowedIntervalRun(now, cadence);
  }
}

function nextDailyRun(now: Date, hour: number, minute: number): Date {
  const candidate = atUtcTime(now, hour, minute);
  return candidate > now ? candidate : new Date(candidate.getTime() + DAY_MS);
}

function nextWeeklyRun(now: Date, dayOfWeek: number, hour: number, minute: number): Date {
  const candidate = atUtcTime(now, hour, minute);
  const daysUntilTarget = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
  const target = new Date(candidate.getTime() + daysUntilTarget * DAY_MS);

  return target > now ? target : new Date(target.getTime() + 7 * DAY_MS);
}

function nextWindowedIntervalRun(
  now: Date,
  cadence: Extract<ScheduleCadence, { kind: "windowed_interval" }>,
): Date {
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (let hour = cadence.startHour; hour <= cadence.endHour; hour += cadence.everyHours) {
      const candidate = new Date(
        Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + dayOffset,
          hour,
          cadence.minute,
          0,
          0,
        ),
      );
      if (candidate > now) {
        return candidate;
      }
    }
  }

  return new Date(now.getTime() + cadence.everyHours * 60 * MINUTE_MS);
}

function atUtcTime(date: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0));
}

function formatUtcDateTime(value: string | null): string {
  if (value === null) {
    return "Not scheduled";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return "Not scheduled";
  }

  const month = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][
    date.getUTCMonth()
  ];
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");

  return `${month} ${day} ${hour}:${minute} UTC`;
}
