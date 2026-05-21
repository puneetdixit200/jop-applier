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
};
