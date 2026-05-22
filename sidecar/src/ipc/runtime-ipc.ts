import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { AIEngine } from "../ai/ai-engine.js";
import type {
  ApplicationReviewDecision,
  ApplicationReviewDecisionResult,
} from "../applications/application-review-decision.js";
import type { ApplicationProcessingApplication } from "../applications/application-worker.js";
import type { ApplicationStatus } from "../applications/application-workflow.js";
import type { WorkflowEngine } from "../orchestrator/workflow-engine.js";

export type SidecarRuntimeHost = {
  aiEngine: Pick<AIEngine, "activeProvider">;
  drainNotifications?: () => Promise<unknown[]>;
  flushLogs?: () => Promise<void>;
  reviewApplication: (
    application: ApplicationProcessingApplication,
    decision: ApplicationReviewDecision,
  ) => Promise<ApplicationReviewDecisionResult>;
  workflowEngine: Pick<WorkflowEngine, "registeredWorkflows" | "run">;
};

export type SidecarIpcRequest = {
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export type SidecarIpcResponse =
  | {
      id: string | number | null;
      ok: true;
      result: unknown;
    }
  | {
      id: string | number | null;
      ok: false;
      error: {
        message: string;
      };
    };

export async function handleSidecarIpcRequest(
  runtime: SidecarRuntimeHost,
  request: SidecarIpcRequest,
): Promise<SidecarIpcResponse> {
  const id = request.id ?? null;

  try {
    if (!isRecord(request) || typeof request.method !== "string") {
      throw new Error("IPC request must include a string method");
    }

    switch (request.method) {
      case "runtime.status":
        return {
          id,
          ok: true,
          result: {
            status: "ready",
            workflows: runtime.workflowEngine.registeredWorkflows(),
            provider: runtime.aiEngine.activeProvider(),
          },
        };
      case "workflow.run": {
        const params = requireRecord(request.params, "workflow.run params");
        const workflowId = requireString(params.workflowId, "workflowId");
        const result = await runtime.workflowEngine.run(workflowId, params);
        const notifications = (await runtime.drainNotifications?.()) ?? [];
        await flushRuntimeLogs(runtime);
        return {
          id,
          ok: true,
          result: withWorkflowNotifications(result, notifications),
        };
      }
      case "application.reviewDecision": {
        const params = requireRecord(request.params, "application.reviewDecision params");
        const result = await runtime.reviewApplication(
          requireApplicationProcessingApplication(params.application),
          requireApplicationReviewDecision(params.decision),
        );
        await flushRuntimeLogs(runtime);

        return {
          id,
          ok: true,
          result,
        };
      }
      default:
        throw new Error(`Unknown IPC method: ${request.method}`);
    }
  } catch (error) {
    await flushRuntimeLogs(runtime);
    return errorResponse(id, error);
  }
}

async function flushRuntimeLogs(runtime: SidecarRuntimeHost): Promise<void> {
  try {
    await runtime.flushLogs?.();
  } catch {
    // Logging must not break IPC responses.
  }
}

function withWorkflowNotifications(result: unknown, notifications: unknown[]): unknown {
  if (notifications.length === 0) {
    return result;
  }

  if (isRecord(result)) {
    return {
      ...result,
      notifications,
    };
  }

  return {
    result,
    notifications,
  };
}

export async function runSidecarIpc(
  runtime: SidecarRuntimeHost,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const lines = createInterface({
    input,
    crlfDelay: Infinity,
  });

  for await (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }

    output.write(`${JSON.stringify(await handleSidecarIpcLine(runtime, trimmed))}\n`);
  }
}

async function handleSidecarIpcLine(
  runtime: SidecarRuntimeHost,
  line: string,
): Promise<SidecarIpcResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return {
      id: null,
      ok: false,
      error: {
        message: "IPC request must be valid JSON",
      },
    };
  }

  if (!isRecord(parsed)) {
    return {
      id: null,
      ok: false,
      error: {
        message: "IPC request must be a JSON object",
      },
    };
  }

  return handleSidecarIpcRequest(runtime, parsed as SidecarIpcRequest);
}

function errorResponse(id: string | number | null, error: unknown): SidecarIpcResponse {
  return {
    id,
    ok: false,
    error: {
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }

  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  throw new Error(`${label} must be a non-empty string or null`);
}

function requireNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }

  throw new Error(`${label} must be a non-negative integer`);
}

function requireApplicationReviewDecision(value: unknown): ApplicationReviewDecision {
  const decision = requireString(value, "decision");
  if (decision !== "approve" && decision !== "cancel") {
    throw new Error("decision must be approve or cancel");
  }

  return decision;
}

function requireApplicationProcessingApplication(
  value: unknown,
): ApplicationProcessingApplication {
  const application = requireRecord(value, "application");

  return {
    id: requireString(application.id, "application.id"),
    jobId: requireString(field(application, "jobId", "job_id"), "application.jobId"),
    companyName: requireString(
      field(application, "companyName", "company_name"),
      "application.companyName",
    ),
    status: requireApplicationStatus(application.status),
    mode: requireString(application.mode, "application.mode"),
    resumePath: requireNullableString(
      field(application, "resumePath", "resume_path"),
      "application.resumePath",
    ),
    coverLetterPath: requireNullableString(
      field(application, "coverLetterPath", "cover_letter_path"),
      "application.coverLetterPath",
    ),
    retryCount: requireNonNegativeInteger(
      field(application, "retryCount", "retry_count"),
      "application.retryCount",
    ),
    maxRetries: requireNonNegativeInteger(
      field(application, "maxRetries", "max_retries"),
      "application.maxRetries",
    ),
  };
}

function requireApplicationStatus(value: unknown): ApplicationStatus {
  const status = requireString(value, "application.status");
  if (!applicationStatuses.has(status)) {
    throw new Error(`application.status is not supported: ${status}`);
  }

  return status as ApplicationStatus;
}

function field(record: Record<string, unknown>, camelCase: string, snakeCase: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, camelCase) ? record[camelCase] : record[snakeCase];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const applicationStatuses = new Set<string>([
  "queued",
  "preparing",
  "resume_generated",
  "cover_letter_generated",
  "form_filling",
  "review_pending",
  "submitting",
  "submitted",
  "failed",
  "cancelled",
  "permanently_failed",
]);
