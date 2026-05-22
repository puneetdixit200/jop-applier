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
    matchScore?: number | null;
    priority?: "high" | "medium" | "low" | null;
    shouldApply?: boolean | null;
  };
  "prospecting.company_discovered": {
    companyId: string;
    companyName: string;
    domain: string | null;
    relevanceScore: number | null;
    source: string;
    discoveredAt: Date;
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
  "cold_email.sent": {
    applicationId: string | null;
    jobId: string | null;
    companyName: string;
    contactId: string | null;
    contactName: string | null;
    communicationId: string | null;
    subject: string;
    sentAt: Date;
  };
  "cold_email.failed": {
    applicationId: string | null;
    jobId: string | null;
    companyName: string;
    contactId: string | null;
    reason: string;
    failedAt: Date;
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
  "document.generated": {
    applicationId: string;
    documentId: string;
    documentType: string;
    filePath: string;
    fileName: string;
    version: number;
    aiModelUsed: string | null;
    generatedAt: Date;
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
  "analytics.refreshed": {
    generatedAt: Date;
    totalApplications: number;
    responseRate: number;
    interviewRate: number;
    offerRate: number;
  };
  "export.synced": {
    exporterId: string;
    exporterName: string;
    recordsWritten: number;
    externalUrl: string | null;
    syncedAt: Date;
  };
  "export.failed": {
    exporterId: string;
    exporterName: string;
    reason: string;
    failedAt: Date;
  };
  "cleanup.completed": {
    completedAt: Date;
    expiredAiCacheDeleted: number;
    archivedJobs: number;
    archiveCutoff: string;
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
