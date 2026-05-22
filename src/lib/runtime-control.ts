import type { SidecarRuntimeStatus } from "./tauri-api";

export type RuntimeControlDependencies = {
  isDesktopRuntime: () => boolean;
  getSidecarStatus: () => Promise<SidecarRuntimeStatus>;
  runSidecarWorkflow: (workflowId: string) => Promise<unknown>;
  deliverWorkflowOsNotifications?: (result: unknown) => Promise<unknown>;
};

export type RuntimeControlStatus = {
  providerLabel: string;
  runtimeStatus: string;
  statusMessage: string;
  workflowCount: number;
};

export type RuntimeWorkflowResult = {
  ok: boolean;
  statusMessage: string;
  result: unknown | null;
};

export async function loadRuntimeControlStatus(
  dependencies: RuntimeControlDependencies,
): Promise<RuntimeControlStatus> {
  if (!dependencies.isDesktopRuntime()) {
    return {
      providerLabel: "Browser preview",
      runtimeStatus: "Preview",
      statusMessage: "Browser preview",
      workflowCount: 0,
    };
  }

  try {
    const status = await dependencies.getSidecarStatus();
    return {
      providerLabel: `${status.provider.provider}:${status.provider.model}`,
      runtimeStatus: status.status,
      statusMessage: `${status.status} · ${status.workflows.length} workflows`,
      workflowCount: status.workflows.length,
    };
  } catch {
    return {
      providerLabel: "Unavailable",
      runtimeStatus: "Unavailable",
      statusMessage: "Sidecar unavailable",
      workflowCount: 0,
    };
  }
}

export async function runRuntimeWorkflow(
  dependencies: RuntimeControlDependencies,
  workflowId: string,
): Promise<RuntimeWorkflowResult> {
  if (!dependencies.isDesktopRuntime()) {
    return {
      ok: false,
      statusMessage: "Browser preview",
      result: null,
    };
  }

  try {
    const result = await dependencies.runSidecarWorkflow(workflowId);
    await dependencies.deliverWorkflowOsNotifications?.(result).catch(() => undefined);

    return {
      ok: true,
      statusMessage: `${workflowId} completed`,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      statusMessage: `${workflowId} failed: ${errorMessage(error)}`,
      result: null,
    };
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
