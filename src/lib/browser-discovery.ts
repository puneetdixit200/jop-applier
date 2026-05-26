import type { SerializedDiscoverySettings } from "./discovery-settings";
import type { Job } from "./tauri-api";

export type BrowserDiscoveryProfile = {
  headline: string;
  skills: string[];
};

export type BrowserDiscoveryInput = SerializedDiscoverySettings & {
  profile?: BrowserDiscoveryProfile;
};

export type BrowserDiscoveryResult = {
  workflowStatus: string;
  discovered: number;
  jobs: Job[];
  sources: string[];
};

export async function runBrowserDiscovery(
  discovery: BrowserDiscoveryInput,
): Promise<BrowserDiscoveryResult> {
  const response = await fetch("/api/discovery/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ discovery }),
  });
  const payload = await response.json().catch(() => null);

  if (!response.ok || !isRecord(payload) || payload.ok !== true) {
    const message = isRecord(payload) && typeof payload.error === "string"
      ? payload.error
      : `Browser discovery returned HTTP ${response.status}`;
    throw new Error(message);
  }

  const jobs = Array.isArray(payload.jobs) ? payload.jobs.filter(isJob) : [];
  return {
    workflowStatus:
      typeof payload.workflowStatus === "string"
        ? payload.workflowStatus
        : `job-discovery completed: ${jobs.length} found`,
    discovered: typeof payload.discovered === "number" ? payload.discovered : jobs.length,
    jobs,
    sources: Array.isArray(payload.sources)
      ? payload.sources.filter((source): source is string => typeof source === "string")
      : [],
  };
}

function isJob(value: unknown): value is Job {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.platform === "string" &&
    typeof value.url === "string" &&
    typeof value.title === "string" &&
    typeof value.company_name === "string" &&
    Array.isArray(value.requirements) &&
    Array.isArray(value.matched_skills) &&
    Array.isArray(value.missing_skills) &&
    Array.isArray(value.ai_tags)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
