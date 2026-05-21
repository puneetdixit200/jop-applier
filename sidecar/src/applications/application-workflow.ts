export type ApplicationStatus =
  | "queued"
  | "preparing"
  | "resume_generated"
  | "cover_letter_generated"
  | "form_filling"
  | "review_pending"
  | "submitting"
  | "submitted"
  | "failed"
  | "cancelled"
  | "permanently_failed";

export type ApplicationWorkflowContext = {
  reviewBeforeSubmit: boolean;
  retryCount: number;
  maxRetries: number;
};

export function allowedApplicationTransitions(
  status: ApplicationStatus,
  context: ApplicationWorkflowContext,
): ApplicationStatus[] {
  switch (status) {
    case "queued":
      return ["preparing"];
    case "preparing":
      return ["resume_generated"];
    case "resume_generated":
      return ["cover_letter_generated"];
    case "cover_letter_generated":
      return ["form_filling"];
    case "form_filling":
      return [context.reviewBeforeSubmit ? "review_pending" : "submitting"];
    case "review_pending":
      return ["submitting", "cancelled"];
    case "submitting":
      return ["submitted", "failed"];
    case "failed":
      return [context.retryCount < context.maxRetries ? "queued" : "permanently_failed"];
    case "submitted":
    case "cancelled":
    case "permanently_failed":
      return [];
  }
}

export function assertApplicationTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  context: ApplicationWorkflowContext,
): void {
  if (!allowedApplicationTransitions(from, context).includes(to)) {
    throw new Error(`Cannot transition application from ${from} to ${to}`);
  }
}
