import type { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";

export type AnalyticsApplication = {
  id: string;
  companyName: string;
  platform: string;
  status: string;
  appliedAt: string | null;
  responseDate: string | null;
  responseType: string | null;
  followUpCount: number;
  resumeVersion: string | null;
};

export type AnalyticsJob = {
  id: string;
  platform: string;
  companyName: string;
  matchScore: number | null;
  requiredSkills: string[];
};

export type AnalyticsInputs = {
  applications: AnalyticsApplication[];
  jobs: AnalyticsJob[];
};

export type CountMetric = {
  label: string;
  count: number;
};

export type AnalyticsMetrics = {
  totalApplications: number;
  applicationRate: {
    daily: number;
    weekly: number;
  };
  responseRate: number;
  interviewRate: number;
  offerRate: number;
  averageTimeToResponseDays: number | null;
  topPlatforms: CountMetric[];
  topCompanies: CountMetric[];
  skillDemand: CountMetric[];
  matchScoreDistribution: Array<{ bucket: string; count: number }>;
  followUpEffectiveness: {
    withFollowUp: { applications: number; responses: number; responseRate: number };
    withoutFollowUp: { applications: number; responses: number; responseRate: number };
  };
  resumeVersionPerformance: Array<{
    label: string;
    applications: number;
    responses: number;
    responseRate: number;
  }>;
  weeklyTrend: Array<{ week: string; applications: number; responses: number }>;
  funnel: {
    discovered: number;
    matched: number;
    applied: number;
    response: number;
    interview: number;
    offer: number;
  };
};

export type AnalyticsSnapshot = {
  generatedAt: string;
  metrics: AnalyticsMetrics;
};

export type AnalyticsRefreshWorkerDependencies = {
  loadInputs: () => Promise<AnalyticsInputs>;
  saveSnapshot: (snapshot: AnalyticsSnapshot) => Promise<void>;
};

export type AnalyticsRefreshWorkerOptions = {
  now: Date;
  eventBus?: EventBus<CareerEventMap>;
};

export type AnalyticsRefreshWorkerResult = {
  applications: number;
  jobs: number;
  saved: boolean;
};

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export async function runAnalyticsRefreshWorker(
  dependencies: AnalyticsRefreshWorkerDependencies,
  options: AnalyticsRefreshWorkerOptions,
): Promise<AnalyticsRefreshWorkerResult> {
  const inputs = await dependencies.loadInputs();
  const metrics = calculateAnalyticsMetrics(inputs, options.now);
  const snapshot = {
    generatedAt: options.now.toISOString(),
    metrics,
  };

  await dependencies.saveSnapshot(snapshot);
  options.eventBus?.emit("analytics.refreshed", {
    generatedAt: options.now,
    totalApplications: metrics.totalApplications,
    responseRate: metrics.responseRate,
    interviewRate: metrics.interviewRate,
    offerRate: metrics.offerRate,
  });

  return {
    applications: inputs.applications.length,
    jobs: inputs.jobs.length,
    saved: true,
  };
}

export function calculateAnalyticsMetrics(inputs: AnalyticsInputs, now: Date): AnalyticsMetrics {
  const applications = inputs.applications;
  const jobs = inputs.jobs;
  const totalApplications = applications.length;
  const responses = applications.filter(hasResponse);
  const interviews = applications.filter((application) => application.responseType === "interview");
  const offers = applications.filter((application) => application.responseType === "offer");

  return {
    totalApplications,
    applicationRate: applicationRate(applications, now),
    responseRate: percent(responses.length, totalApplications),
    interviewRate: percent(interviews.length, totalApplications),
    offerRate: percent(offers.length, totalApplications),
    averageTimeToResponseDays: averageTimeToResponseDays(responses),
    topPlatforms: countBy(applications.map((application) => application.platform)),
    topCompanies: countBy(applications.map((application) => application.companyName)),
    skillDemand: countBy(jobs.flatMap((job) => job.requiredSkills)),
    matchScoreDistribution: matchScoreDistribution(jobs),
    followUpEffectiveness: followUpEffectiveness(applications),
    resumeVersionPerformance: resumeVersionPerformance(applications),
    weeklyTrend: weeklyTrend(applications),
    funnel: {
      discovered: jobs.length,
      matched: jobs.filter((job) => job.matchScore !== null).length,
      applied: totalApplications,
      response: responses.length,
      interview: interviews.length,
      offer: offers.length,
    },
  };
}

function applicationRate(applications: AnalyticsApplication[], now: Date) {
  const appliedDates = applications
    .map((application) => parseDate(application.appliedAt))
    .filter((date): date is Date => date !== null);
  if (appliedDates.length === 0) {
    return { daily: 0, weekly: 0 };
  }

  const earliest = new Date(Math.min(...appliedDates.map((date) => date.getTime())));
  const days = Math.max((now.getTime() - earliest.getTime()) / MILLISECONDS_PER_DAY, 1);
  const rawDaily = applications.length / days;

  return {
    daily: round(rawDaily),
    weekly: round(rawDaily * 7),
  };
}

function averageTimeToResponseDays(applications: AnalyticsApplication[]): number | null {
  const durations = applications
    .map((application) => {
      const appliedAt = parseDate(application.appliedAt);
      const responseDate = parseDate(application.responseDate);
      if (appliedAt === null || responseDate === null) {
        return null;
      }

      return (responseDate.getTime() - appliedAt.getTime()) / MILLISECONDS_PER_DAY;
    })
    .filter((duration): duration is number => duration !== null && Number.isFinite(duration));

  if (durations.length === 0) {
    return null;
  }

  return round(durations.reduce((sum, duration) => sum + duration, 0) / durations.length);
}

function countBy(values: string[]): CountMetric[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (value.length === 0) {
      continue;
    }

    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort(sortByCountThenLabel);
}

function matchScoreDistribution(jobs: AnalyticsJob[]): Array<{ bucket: string; count: number }> {
  const distribution = [
    { bucket: "0-49", count: 0 },
    { bucket: "50-69", count: 0 },
    { bucket: "70-89", count: 0 },
    { bucket: "90-100", count: 0 },
  ];

  for (const job of jobs) {
    if (job.matchScore === null) {
      continue;
    }

    if (job.matchScore < 50) {
      distribution[0].count += 1;
    } else if (job.matchScore < 70) {
      distribution[1].count += 1;
    } else if (job.matchScore < 90) {
      distribution[2].count += 1;
    } else {
      distribution[3].count += 1;
    }
  }

  return distribution;
}

function followUpEffectiveness(applications: AnalyticsApplication[]) {
  const withFollowUp = applications.filter((application) => application.followUpCount > 0);
  const withoutFollowUp = applications.filter((application) => application.followUpCount === 0);

  return {
    withFollowUp: responseSummary(withFollowUp),
    withoutFollowUp: responseSummary(withoutFollowUp),
  };
}

function resumeVersionPerformance(applications: AnalyticsApplication[]) {
  const groups = new Map<string, AnalyticsApplication[]>();
  for (const application of applications) {
    const label = application.resumeVersion ?? "unknown";
    groups.set(label, [...(groups.get(label) ?? []), application]);
  }

  return [...groups.entries()]
    .map(([label, groupedApplications]) => ({
      label,
      applications: groupedApplications.length,
      responses: groupedApplications.filter(hasResponse).length,
      responseRate: percent(groupedApplications.filter(hasResponse).length, groupedApplications.length),
    }))
    .sort((left, right) => {
      if (right.applications !== left.applications) {
        return right.applications - left.applications;
      }

      return left.label.localeCompare(right.label);
    });
}

function weeklyTrend(applications: AnalyticsApplication[]) {
  const weeks = new Map<string, { applications: number; responses: number }>();

  for (const application of applications) {
    const appliedAt = parseDate(application.appliedAt);
    if (appliedAt !== null) {
      const week = startOfWeek(appliedAt);
      const entry = weeks.get(week) ?? { applications: 0, responses: 0 };
      entry.applications += 1;
      weeks.set(week, entry);
    }

    const responseDate = parseDate(application.responseDate);
    if (responseDate !== null) {
      const week = startOfWeek(responseDate);
      const entry = weeks.get(week) ?? { applications: 0, responses: 0 };
      entry.responses += 1;
      weeks.set(week, entry);
    }
  }

  return [...weeks.entries()]
    .map(([week, values]) => ({ week, ...values }))
    .sort((left, right) => left.week.localeCompare(right.week));
}

function responseSummary(applications: AnalyticsApplication[]) {
  const responses = applications.filter(hasResponse).length;

  return {
    applications: applications.length,
    responses,
    responseRate: percent(responses, applications.length),
  };
}

function hasResponse(application: AnalyticsApplication): boolean {
  return application.responseDate !== null || application.responseType !== null;
}

function parseDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function percent(value: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return round((value / total) * 100);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function startOfWeek(date: Date): string {
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const weekStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - daysSinceMonday));

  return weekStart.toISOString().slice(0, 10);
}

function sortByCountThenLabel(left: CountMetric, right: CountMetric): number {
  if (right.count !== left.count) {
    return right.count - left.count;
  }

  return left.label.localeCompare(right.label);
}
