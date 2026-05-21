import type { Application } from "./tauri-api";

export type ApplicationTrackerColumnId = "queued" | "applying" | "applied" | "response" | "closed";

export type ApplicationTrackerRow = {
  id: string;
  company: string;
  role: string;
  status: string;
  statusLabel: string;
  mode: string;
  nextAction: string;
  documentLabel: string;
  followUpDue: boolean;
  tags: string[];
  bucket: ApplicationTrackerColumnId;
};

export type ApplicationTrackerColumn = {
  id: ApplicationTrackerColumnId;
  label: string;
  count: number;
  rows: ApplicationTrackerRow[];
};

export type ApplicationTrackerMetrics = {
  total: number;
  active: number;
  queued: number;
  followUpsDue: number;
};

export type ApplicationTracker = {
  metrics: ApplicationTrackerMetrics;
  columns: ApplicationTrackerColumn[];
  rows: ApplicationTrackerRow[];
};

const columnDefinitions: Array<{ id: ApplicationTrackerColumnId; label: string }> = [
  { id: "queued", label: "Queued" },
  { id: "applying", label: "Applying" },
  { id: "applied", label: "Applied" },
  { id: "response", label: "Responses" },
  { id: "closed", label: "Closed" },
];

const statusLabels: Record<string, string> = {
  discovered: "Discovered",
  matched: "Matched",
  queued: "Queued",
  preparing: "Preparing",
  applying: "Applying",
  applied: "Applied",
  failed: "Failed",
  responseReceived: "Response Received",
  noResponse: "No Response",
  followUpSent: "Follow Up Sent",
  interviewScheduled: "Interview Scheduled",
  offerReceived: "Offer Received",
  accepted: "Accepted",
  declined: "Declined",
  negotiating: "Negotiating",
  rejected: "Rejected",
  ghosted: "Ghosted",
};

export function buildApplicationTracker(
  applications: Application[],
  now = new Date(),
): ApplicationTracker {
  const indexedRows = applications.map((application, index) => ({
    index,
    row: applicationTrackerRow(application, now),
  }));
  indexedRows.sort((left, right) => {
    if (left.row.followUpDue !== right.row.followUpDue) {
      return left.row.followUpDue ? -1 : 1;
    }
    return left.index - right.index;
  });

  const rows = indexedRows.map((item) => item.row);
  const columns = columnDefinitions.map((definition) => {
    const columnRows = rows.filter((row) => row.bucket === definition.id);
    return {
      ...definition,
      count: columnRows.length,
      rows: columnRows,
    };
  });

  return {
    metrics: {
      total: rows.length,
      active: rows.filter((row) => row.bucket !== "closed").length,
      queued: columns.find((column) => column.id === "queued")?.count ?? 0,
      followUpsDue: rows.filter((row) => row.followUpDue).length,
    },
    columns,
    rows,
  };
}

export function statusLabelForApplication(status: string) {
  return statusLabels[status] ?? titleCaseStatus(status);
}

function applicationTrackerRow(application: Application, now: Date): ApplicationTrackerRow {
  const bucket = bucketForStatus(application.status);
  const followUpDue = isFollowUpDue(application.next_follow_up, now);

  return {
    id: application.id,
    company: application.company_name,
    role: application.job_title,
    status: application.status,
    statusLabel: statusLabelForApplication(application.status),
    mode: application.mode,
    nextAction: nextActionForApplication(application, followUpDue, bucket),
    documentLabel: documentLabelForApplication(application),
    followUpDue,
    tags: application.tags,
    bucket,
  };
}

function bucketForStatus(status: string): ApplicationTrackerColumnId {
  const value = status.trim().toLowerCase();
  if (["matched", "queued"].includes(value)) {
    return "queued";
  }
  if (["preparing", "applying", "failed"].includes(value)) {
    return "applying";
  }
  if (["applied", "noresponse", "followupsent"].includes(value)) {
    return "applied";
  }
  if (["responsereceived", "interviewscheduled", "offerreceived", "negotiating"].includes(value)) {
    return "response";
  }
  if (["rejected", "accepted", "declined", "ghosted"].includes(value)) {
    return "closed";
  }
  return "queued";
}

function nextActionForApplication(
  application: Application,
  followUpDue: boolean,
  bucket: ApplicationTrackerColumnId,
) {
  if (followUpDue) {
    return "Follow up due";
  }
  if (bucket === "closed") {
    return statusLabelForApplication(application.status);
  }
  if (bucket === "response" || application.response_type || application.response_date) {
    return "Review response";
  }
  if (bucket === "queued") {
    return "Review match";
  }
  if (bucket === "applying" || application.error_message) {
    return "Resume workflow";
  }
  if (application.next_follow_up) {
    return `Follow up ${formatShortDate(application.next_follow_up)}`;
  }
  if (!application.resume_path || !application.cover_letter_path) {
    return "Generate documents";
  }
  return "Monitor response";
}

function documentLabelForApplication(application: Application) {
  if (application.resume_path && application.cover_letter_path) {
    return "Resume and cover ready";
  }
  if (application.resume_path) {
    return "Cover letter needed";
  }
  if (application.cover_letter_path) {
    return "Resume needed";
  }
  return "Documents needed";
}

function isFollowUpDue(value: string | null, now: Date) {
  if (!value) {
    return false;
  }
  const nextFollowUp = new Date(value);
  return !Number.isNaN(nextFollowUp.getTime()) && nextFollowUp.getTime() <= now.getTime();
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "later";
  }
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function titleCaseStatus(status: string) {
  return status
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
