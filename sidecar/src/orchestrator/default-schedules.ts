export type ScheduleCadence =
  | {
      kind: "interval";
      minutes: number;
    }
  | {
      kind: "daily";
      hour: number;
      minute: number;
    }
  | {
      kind: "weekly";
      dayOfWeek: number;
      hour: number;
      minute: number;
    }
  | {
      kind: "windowed_interval";
      everyHours: number;
      startHour: number;
      endHour: number;
      minute: number;
    };

export type DefaultScheduledTask = {
  name: string;
  type: string;
  cronExpression: string;
  isEnabled: boolean;
  config: {
    description: string;
    cadence: ScheduleCadence;
  };
};

export const DEFAULT_WORKFLOWS_BY_TASK_TYPE: Record<string, string> = {
  discovery: "job-discovery",
  apply: "application-processing",
  follow_up: "follow-up-check",
  email_check: "email-check",
  analytics: "analytics-refresh",
  export: "export-sync",
  session_health: "session-health",
  cleanup: "cleanup",
};

export const DEFAULT_SCHEDULED_TASKS: DefaultScheduledTask[] = [
  {
    name: "Job Discovery",
    type: "discovery",
    cronExpression: "0 8-20/4 * * *",
    isEnabled: true,
    config: {
      description: "Search all enabled platforms",
      cadence: { kind: "windowed_interval", everyHours: 4, startHour: 8, endHour: 20, minute: 0 },
    },
  },
  {
    name: "Application Processing",
    type: "apply",
    cronExpression: "*/30 * * * *",
    isEnabled: true,
    config: {
      description: "Process queued applications",
      cadence: { kind: "interval", minutes: 30 },
    },
  },
  {
    name: "Follow-up Check",
    type: "follow_up",
    cronExpression: "0 9 * * *",
    isEnabled: true,
    config: {
      description: "Send due follow-ups",
      cadence: { kind: "daily", hour: 9, minute: 0 },
    },
  },
  {
    name: "Email Check",
    type: "email_check",
    cronExpression: "*/15 * * * *",
    isEnabled: true,
    config: {
      description: "Check for responses via IMAP",
      cadence: { kind: "interval", minutes: 15 },
    },
  },
  {
    name: "Analytics Refresh",
    type: "analytics",
    cronExpression: "0 0 * * *",
    isEnabled: true,
    config: {
      description: "Recalculate all metrics",
      cadence: { kind: "daily", hour: 0, minute: 0 },
    },
  },
  {
    name: "Export Sync",
    type: "export",
    cronExpression: "0 */6 * * *",
    isEnabled: true,
    config: {
      description: "Sync to Notion/Sheets",
      cadence: { kind: "interval", minutes: 360 },
    },
  },
  {
    name: "Session Health",
    type: "session_health",
    cronExpression: "0 */2 * * *",
    isEnabled: true,
    config: {
      description: "Verify browser sessions are valid",
      cadence: { kind: "interval", minutes: 120 },
    },
  },
  {
    name: "Cleanup",
    type: "cleanup",
    cronExpression: "0 3 * * 0",
    isEnabled: true,
    config: {
      description: "Purge old AI cache, archive old jobs",
      cadence: { kind: "weekly", dayOfWeek: 0, hour: 3, minute: 0 },
    },
  },
];

const MILLISECONDS_PER_MINUTE = 60 * 1000;
const MILLISECONDS_PER_DAY = 24 * 60 * MILLISECONDS_PER_MINUTE;

export function calculateNextRunFromSchedule(
  task: { config: { cadence?: unknown } },
  now: Date,
): string | null {
  const cadence = task.config.cadence;
  if (!isScheduleCadence(cadence)) {
    return null;
  }

  switch (cadence.kind) {
    case "interval":
      return addMinutes(now, cadence.minutes).toISOString();
    case "daily":
      return nextDailyRun(now, cadence.hour, cadence.minute).toISOString();
    case "weekly":
      return nextWeeklyRun(now, cadence.dayOfWeek, cadence.hour, cadence.minute).toISOString();
    case "windowed_interval":
      return nextWindowedIntervalRun(now, cadence).toISOString();
  }
}

function isScheduleCadence(value: unknown): value is ScheduleCadence {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return false;
  }

  const cadence = value as Record<string, unknown>;
  switch (cadence.kind) {
    case "interval":
      return isPositiveNumber(cadence.minutes);
    case "daily":
      return isHour(cadence.hour) && isMinute(cadence.minute);
    case "weekly":
      return isDayOfWeek(cadence.dayOfWeek) && isHour(cadence.hour) && isMinute(cadence.minute);
    case "windowed_interval":
      return (
        isPositiveNumber(cadence.everyHours) &&
        isHour(cadence.startHour) &&
        isHour(cadence.endHour) &&
        isMinute(cadence.minute)
      );
    default:
      return false;
  }
}

function nextDailyRun(now: Date, hour: number, minute: number): Date {
  const candidate = atUtcTime(now, hour, minute);
  if (candidate > now) {
    return candidate;
  }

  return new Date(candidate.getTime() + MILLISECONDS_PER_DAY);
}

function nextWeeklyRun(now: Date, dayOfWeek: number, hour: number, minute: number): Date {
  const candidate = atUtcTime(now, hour, minute);
  const daysUntilTarget = (dayOfWeek - candidate.getUTCDay() + 7) % 7;
  const target = new Date(candidate.getTime() + daysUntilTarget * MILLISECONDS_PER_DAY);

  if (target > now) {
    return target;
  }

  return new Date(target.getTime() + 7 * MILLISECONDS_PER_DAY);
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

  return addMinutes(now, cadence.everyHours * 60);
}

function atUtcTime(date: Date, hour: number, minute: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), hour, minute, 0, 0));
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * MILLISECONDS_PER_MINUTE);
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function isDayOfWeek(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function isHour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 23;
}

function isMinute(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 59;
}
