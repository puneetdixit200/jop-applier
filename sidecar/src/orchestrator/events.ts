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
  "job.discovered": {
    jobId: string;
    platform: string;
    title: string;
    companyName: string;
  };
};

