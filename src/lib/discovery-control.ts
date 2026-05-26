import {
  loadRuntimeControlStatus,
  runRuntimeWorkflow,
  type RuntimeControlDependencies,
  type RuntimeControlStatus,
} from "./runtime-control";
import type { Job } from "./tauri-api";

export type JobSummary = {
  title: string;
  company: string;
  score: number | null;
  source: string;
  url: string | null;
  location: string;
  priority: string;
};

export type DiscoveryControlDependencies = RuntimeControlDependencies & {
  listJobs: () => Promise<Job[]>;
};

export type DiscoveryControlResult = {
  workflowStatus: string;
  runtimeStatus: RuntimeControlStatus | null;
  jobs: JobSummary[] | null;
};

export async function runDiscoveryControl(
  dependencies: DiscoveryControlDependencies,
): Promise<DiscoveryControlResult> {
  if (!dependencies.isDesktopRuntime()) {
    return {
      workflowStatus: "Browser preview",
      runtimeStatus: null,
      jobs: null,
    };
  }

  const workflow = await runRuntimeWorkflow(dependencies, "job-discovery");
  if (!workflow.ok) {
    return {
      workflowStatus: workflow.statusMessage,
      runtimeStatus: null,
      jobs: null,
    };
  }

  const [runtimeStatus, jobs] = await Promise.all([
    loadRuntimeControlStatus(dependencies),
    loadJobSummaries(dependencies.listJobs),
  ]);

  return {
    workflowStatus: workflow.statusMessage,
    runtimeStatus,
    jobs,
  };
}

export async function loadJobSummaries(listJobs: () => Promise<Job[]>): Promise<JobSummary[]> {
  return (await listJobs()).map(jobFromRecord);
}

export function jobFromRecord(job: Job): JobSummary {
  return {
    title: job.title,
    company: job.company_name,
    score: job.match_score,
    source: job.platform,
    url: job.url,
    location: job.location ?? (job.is_remote ? "Remote" : "Location unknown"),
    priority: job.ai_priority ?? "unscored",
  };
}
