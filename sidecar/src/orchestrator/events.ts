export type WorkflowStatus = "completed" | "failed";

export type CareerEventMap = {
  "workflow.started": {
    workflowId: string;
    startedAt: Date;
  };
  "workflow.completed": {
    workflowId: string;
    status: WorkflowStatus;
    durationMs: number;
    error?: string;
  };
  "ai.provider.changed": {
    provider: string;
    model: string;
    local: boolean;
  };
  "ai.provider.offline": {
    provider: string;
    model: string;
    reason: string;
  };
  "job.discovered": {
    jobId: string;
    platform: string;
    title: string;
    companyName: string;
  };
  "follow_up.sent": {
    applicationId: string;
    jobId: string;
    companyName: string;
    status: "follow_up_sent" | "ghosted";
    followUpCount: number;
    nextFollowUp: string | null;
    communicationId: string | null;
    sentAt: Date;
  };
  "follow_up.failed": {
    applicationId: string;
    jobId: string;
    companyName: string;
    reason: string;
    failedAt: Date;
  };
  "application.submitted": {
    applicationId: string;
    jobId: string;
    companyName: string;
    confirmationId: string | null;
    submittedAt: Date;
  };
  "application.failed": {
    applicationId: string;
    jobId: string;
    companyName: string;
    status: "failed" | "permanently_failed";
    reason: string;
    failedAt: Date;
  };
  "response.received": {
    applicationId: string;
    jobId: string | null;
    companyName: string | null;
    communicationId: string | null;
    responseType: string;
    subject: string | null;
    receivedAt: Date;
  };
  "email_check.failed": {
    messageId: string;
    applicationId: string | null;
    reason: string;
    failedAt: Date;
  };
  "scheduled_task.started": {
    taskId: string;
    taskName: string;
    taskType: string;
    workflowId: string;
    startedAt: Date;
  };
  "scheduled_task.completed": {
    taskId: string;
    taskName: string;
    taskType: string;
    workflowId: string;
    nextRun: string | null;
    completedAt: Date;
  };
  "scheduled_task.failed": {
    taskId: string;
    taskName: string;
    taskType: string;
    workflowId: string | null;
    reason: string;
    failedAt: Date;
  };
  "browser.session.healthy": {
    platform: string;
    message: string;
    checkedAt: Date;
  };
  "browser.session.unhealthy": {
    platform: string;
    reason: string;
    checkedAt: Date;
  };
};
