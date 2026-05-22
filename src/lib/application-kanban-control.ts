import type { ApplicationTrackerColumnId } from "./application-tracker";
import type { Application, ApplicationWorkflowStateUpdate } from "./tauri-api";

export type ApplicationKanbanControlDependencies = {
  isDesktopRuntime: () => boolean;
  updateApplicationWorkflowState: (
    applicationId: string,
    update: ApplicationWorkflowStateUpdate,
  ) => Promise<Application | null>;
};

export type ApplicationKanbanMoveResult = {
  ok: boolean;
  workflowStatus: string;
  application: Application | null;
};

const targetStatusByColumn: Record<ApplicationTrackerColumnId, string> = {
  queued: "queued",
  applying: "form_filling",
  applied: "submitted",
  response: "responseReceived",
  closed: "cancelled",
};

const columnLabels: Record<ApplicationTrackerColumnId, string> = {
  queued: "Queued",
  applying: "Applying",
  applied: "Applied",
  response: "Responses",
  closed: "Closed",
};

export function statusForKanbanColumn(columnId: ApplicationTrackerColumnId): string {
  return targetStatusByColumn[columnId];
}

export async function runApplicationKanbanMove(
  application: Application,
  columnId: ApplicationTrackerColumnId,
  dependencies: ApplicationKanbanControlDependencies,
): Promise<ApplicationKanbanMoveResult> {
  const status = statusForKanbanColumn(columnId);
  const columnLabel = columnLabels[columnId];
  if (application.status === status) {
    return {
      ok: true,
      workflowStatus: `application already in ${columnLabel}`,
      application: null,
    };
  }

  const update: ApplicationWorkflowStateUpdate = {
    status,
    error_message: null,
  };

  if (!dependencies.isDesktopRuntime()) {
    return {
      ok: true,
      workflowStatus: `application moved to ${columnLabel}`,
      application: {
        ...application,
        status,
        error_message: null,
      },
    };
  }

  try {
    const updated = await dependencies.updateApplicationWorkflowState(application.id, update);
    if (!updated) {
      return {
        ok: false,
        workflowStatus: "application not found",
        application: null,
      };
    }

    return {
      ok: true,
      workflowStatus: `application moved to ${columnLabel}`,
      application: updated,
    };
  } catch (error) {
    return {
      ok: false,
      workflowStatus: `application move failed: ${errorMessage(error)}`,
      application: null,
    };
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
