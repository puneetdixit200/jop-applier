import type {
  AnalyticsApplication,
  AnalyticsInputs,
  AnalyticsJob,
  AnalyticsRefreshWorkerDependencies,
} from "./analytics-refresh-worker.js";

export type ConfiguredAnalyticsOptions = {
  fallback: AnalyticsRefreshWorkerDependencies;
};

export function createAnalyticsDependenciesFromWorkflowInput(
  input: unknown,
  options: ConfiguredAnalyticsOptions,
): AnalyticsRefreshWorkerDependencies | null {
  const analyticsRefresh = isRecord(input) && isRecord(input.analyticsRefresh)
    ? input.analyticsRefresh
    : null;
  if (!analyticsRefresh) {
    return null;
  }

  const inputs = analyticsInputs(analyticsRefresh.inputs);
  if (!inputs) {
    return null;
  }

  return {
    ...options.fallback,
    loadInputs: async () => inputs,
  };
}

function analyticsInputs(value: unknown): AnalyticsInputs | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    applications: Array.isArray(value.applications)
      ? value.applications.flatMap((item) => analyticsApplication(item) ?? [])
      : [],
    jobs: Array.isArray(value.jobs)
      ? value.jobs.flatMap((item) => analyticsJob(item) ?? [])
      : [],
  };
}

function analyticsApplication(value: unknown): AnalyticsApplication | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id);
  const companyName = nonEmptyString(value.companyName);
  const platform = nonEmptyString(value.platform);
  const status = nonEmptyString(value.status);
  const followUpCount = nonNegativeInteger(value.followUpCount);

  if (!id || !companyName || !platform || !status || followUpCount === null) {
    return null;
  }

  return {
    id,
    companyName,
    platform,
    status,
    appliedAt: nullableString(value.appliedAt),
    responseDate: nullableString(value.responseDate),
    responseType: nullableString(value.responseType),
    followUpCount,
    resumeVersion: nullableString(value.resumeVersion),
  };
}

function analyticsJob(value: unknown): AnalyticsJob | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = nonEmptyString(value.id);
  const platform = nonEmptyString(value.platform);
  const companyName = nonEmptyString(value.companyName);
  if (!id || !platform || !companyName) {
    return null;
  }

  return {
    id,
    platform,
    companyName,
    matchScore: nullableNumber(value.matchScore),
    requiredSkills: stringArray(value.requiredSkills),
  };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    const text = nonEmptyString(item);
    return text ? [text] : [];
  });
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : null;
}

function nullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
