import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { AIEngine } from "../ai/ai-engine.js";
import type { WorkflowEngine } from "../orchestrator/workflow-engine.js";

export type SidecarRuntimeHost = {
  aiEngine: Pick<AIEngine, "activeProvider">;
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
        return {
          id,
          ok: true,
          result: await runtime.workflowEngine.run(workflowId),
        };
      }
      default:
        throw new Error(`Unknown IPC method: ${request.method}`);
    }
  } catch (error) {
    return errorResponse(id, error);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
