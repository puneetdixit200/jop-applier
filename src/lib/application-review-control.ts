import type { Application, ApplicationWorkflowStateUpdate } from "./tauri-api";
import type { ApplicationTrackerReviewAction } from "./application-tracker";

export type ApplicationReviewControlDependencies = {
  isDesktopRuntime: () => boolean;
  updateApplicationWorkflowState: (
    applicationId: string,
    update: ApplicationWorkflowStateUpdate,
  ) => Promise<Application | null>;
};

export type ApplicationReviewControlResult = {
  ok: boolean;
  workflowStatus: string;
  application: Application | null;
};

export async function runApplicationReviewControl(
  application: Application,
  action: ApplicationTrackerReviewAction,
  dependencies: ApplicationReviewControlDependencies,
): Promise<ApplicationReviewControlResult> {
  if (application.status !== "review_pending") {
    return {
      ok: false,
      workflowStatus: "application is not waiting for review",
      application: null,
    };
  }

  const update: ApplicationWorkflowStateUpdate = {
    status: action.nextStatus,
    error_message: null,
  };

  if (!dependencies.isDesktopRuntime()) {
    return {
      ok: true,
      workflowStatus: workflowStatusForAction(action),
      application: {
        ...application,
        status: action.nextStatus,
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
      workflowStatus: workflowStatusForAction(action),
      application: updated,
    };
  } catch (error) {
    return {
      ok: false,
      workflowStatus: `review action failed: ${errorMessage(error)}`,
      application: null,
    };
  }
}

function workflowStatusForAction(action: ApplicationTrackerReviewAction) {
  return action.id === "approve_review" ? "review approved; submitting application" : "review cancelled";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
