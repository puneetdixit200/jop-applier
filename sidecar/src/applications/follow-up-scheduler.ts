export type FollowUpApplication = {
  id: string;
  jobId: string;
  jobTitle?: string | null;
  companyName: string;
  status: string;
  submittedAt: string | null;
  nextFollowUp: string | null;
  lastFollowUp: string | null;
  followUpCount: number;
  responseDate: string | null;
  responseType: string | null;
  contactId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
};

export type FollowUpScheduleOptions = {
  now: Date;
  followUpDelaysDays: number[];
  maxFollowUps: number;
};

export type FollowUpUpdate = {
  status: "follow_up_sent" | "ghosted";
  followUpCount: number;
  lastFollowUp: string;
  nextFollowUp: string | null;
};

const FOLLOW_UP_ELIGIBLE_STATUSES = new Set(["submitted", "no_response", "follow_up_sent"]);
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export function dueFollowUpApplications(
  applications: FollowUpApplication[],
  options: FollowUpScheduleOptions,
): FollowUpApplication[] {
  return applications.filter((application) => isFollowUpDue(application, options));
}

export function scheduleNextFollowUp(
  application: FollowUpApplication,
  options: FollowUpScheduleOptions,
): FollowUpUpdate {
  const followUpCount = application.followUpCount + 1;
  const lastFollowUp = options.now.toISOString();

  if (followUpCount >= options.maxFollowUps) {
    return {
      status: "ghosted",
      followUpCount,
      lastFollowUp,
      nextFollowUp: null,
    };
  }

  return {
    status: "follow_up_sent",
    followUpCount,
    lastFollowUp,
    nextFollowUp: addDays(options.now, nextDelayDays(followUpCount, options.followUpDelaysDays)).toISOString(),
  };
}

function isFollowUpDue(application: FollowUpApplication, options: FollowUpScheduleOptions): boolean {
  if (!FOLLOW_UP_ELIGIBLE_STATUSES.has(application.status)) {
    return false;
  }

  if (application.responseDate !== null || application.responseType !== null) {
    return false;
  }

  if (application.followUpCount >= options.maxFollowUps) {
    return false;
  }

  if (application.nextFollowUp !== null) {
    return isDateDue(application.nextFollowUp, options.now);
  }

  if (application.submittedAt === null) {
    return false;
  }

  return addDays(new Date(application.submittedAt), firstDelayDays(options.followUpDelaysDays)) <= options.now;
}

function isDateDue(value: string, now: Date): boolean {
  const date = new Date(value);

  return Number.isFinite(date.getTime()) && date <= now;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MILLISECONDS_PER_DAY);
}

function firstDelayDays(delays: number[]): number {
  return delays[0] ?? 0;
}

function nextDelayDays(followUpCount: number, delays: number[]): number {
  return delays[Math.min(followUpCount, delays.length - 1)] ?? 0;
}
