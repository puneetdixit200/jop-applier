import { AIEngine } from "./ai/ai-engine.js";
import type { AIProvider } from "./ai/provider-interface.js";
import { OllamaProvider } from "./ai/providers/ollama-provider.js";
import { OpenAIProvider } from "./ai/providers/openai-provider.js";
import { OpenRouterProvider } from "./ai/providers/openrouter-provider.js";
import {
  runAnalyticsRefreshWorker,
  type AnalyticsRefreshWorkerDependencies,
} from "./analytics/analytics-refresh-worker.js";
import {
  createAnalyticsDependenciesFromWorkflowInput,
} from "./analytics/analytics-config.js";
import {
  runApplicationReviewDecision,
  type ApplicationReviewDecision,
} from "./applications/application-review-decision.js";
import {
  runApplicationWorker,
  type ApplicationProcessingApplication,
  type ApplicationWorkerDependencies,
} from "./applications/application-worker.js";
import {
  runFollowUpWorker,
  type FollowUpWorkerDependencies,
} from "./applications/follow-up-worker.js";
import {
  createFollowUpDependenciesFromWorkflowInput,
} from "./applications/follow-up-config.js";
import {
  BrowserManager,
  createPlaywrightBrowserAdapter,
  type BrowserSession,
} from "./browser/browser-manager.js";
import {
  runBrowserSessionHealthCheck,
  type BrowserSessionHealthTarget,
} from "./browser/session-health.js";
import {
  runColdEmailWorker,
  type ColdEmailWorkerDependencies,
} from "./communications/cold-email-worker.js";
import {
  createColdEmailDependenciesFromWorkflowInput,
  type EmailSenderFactory,
} from "./communications/cold-email-config.js";
import {
  createEmailCheckDependenciesFromWorkflowInput,
  type EmailReaderFactory,
} from "./communications/email-check-config.js";
import {
  runEmailResponseWorker,
  type EmailResponseWorkerDependencies,
} from "./communications/email-response-worker.js";
import {
  runJobDiscoveryWorkflow,
  type JobDiscoveryWorkflowDependencies,
} from "./discovery/job-discovery-workflow.js";
import type { SearchQuery } from "./discovery/connectors/connector-interface.js";
import { DiscoveryManager } from "./discovery/discovery-manager.js";
import {
  HttpJsonFeedConnector,
  type HttpJsonFeedSource,
} from "./discovery/connectors/http-json-feed-connector.js";
import {
  runExportSyncWorker,
  type ExportSyncWorkerDependencies,
} from "./export/export-sync-worker.js";
import { runSidecarIpc } from "./ipc/runtime-ipc.js";
import {
  runCleanupWorker,
  type CleanupWorkerDependencies,
} from "./maintenance/cleanup-worker.js";
import {
  bindNotificationManager,
  NotificationManager,
  type NotificationAdapter,
  type NotificationChannel,
  type NotificationDelivery,
  type NotificationManagerOptions,
} from "./notifications/notification-manager.js";
import { DEFAULT_WORKFLOWS_BY_TASK_TYPE } from "./orchestrator/default-schedules.js";
import { EventBus } from "./orchestrator/event-bus.js";
import type { CareerEventMap } from "./orchestrator/events.js";
import {
  createScheduledTaskRunnerDependencies,
  type ScheduledTaskPersistence,
} from "./orchestrator/scheduled-task-persistence.js";
import {
  createSchedulerService,
  type SchedulerServiceDependencies,
} from "./orchestrator/scheduler-service.js";
import {
  runDueScheduledTasks,
  type ScheduledTaskRunnerResult,
} from "./orchestrator/scheduled-task-runner.js";
import { WorkflowEngine } from "./orchestrator/workflow-engine.js";
import {
  createApplicationDocumentGenerators,
  type ApplicationDocumentGeneratorDependencies,
} from "./resume/application-document-generator.js";
import {
  renderCoverLetterPdf,
  renderResumeArtifacts,
} from "./resume/document-renderer.js";

class OfflineProvider implements AIProvider {
  async *chat() {
    yield "Offline provider is not configured.";
  }

  async complete() {
    return '{"score":50,"reasoning":"Offline fallback response","tags":["offline"]}';
  }

  async embed() {
    return [];
  }

  async isAvailable() {
    return true;
  }

  getModelInfo() {
    return {
      provider: "offline",
      model: "deterministic",
      local: true,
    };
  }
}

export function createAIEngineFromEnv(env: NodeJS.ProcessEnv = process.env): AIEngine {
  const providers: AIProvider[] = [
    new OllamaProvider({
      baseUrl: env.OLLAMA_BASE_URL ?? "http://localhost:11434",
      model: env.OLLAMA_MODEL ?? "mistral:7b-instruct",
    }),
  ];

  if (env.OPENROUTER_API_KEY) {
    providers.push(
      new OpenRouterProvider({
        apiKey: env.OPENROUTER_API_KEY,
        model: env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      }),
    );
  }

  if (env.OPENAI_API_KEY) {
    providers.push(
      new OpenAIProvider({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL ?? "gpt-4.1-mini",
        embeddingModel: env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small",
      }),
    );
  }

  providers.push(new OfflineProvider());

  return new AIEngine(providers);
}

export type SidecarFollowUpOptions = FollowUpWorkerDependencies & {
  followUpDelaysDays?: number[];
  maxFollowUps?: number;
};

type ApplicationDocumentWorkerDependencies = Pick<
  ApplicationWorkerDependencies,
  "generateResume" | "generateCoverLetter"
>;

export type SidecarApplicationProcessingOptions = Omit<
  ApplicationWorkerDependencies,
  keyof ApplicationDocumentWorkerDependencies
> &
  Partial<ApplicationDocumentWorkerDependencies> & {
  maxApplications?: number;
  reviewBeforeSubmit?: boolean;
};

export type SidecarApplicationDocumentOptions = Pick<
  ApplicationDocumentGeneratorDependencies,
  "loadContext" | "saveDocument"
> & {
  outputDir: string;
  ai?: ApplicationDocumentGeneratorDependencies["ai"];
  renderResume?: ApplicationDocumentGeneratorDependencies["renderResume"];
  renderCoverLetter?: ApplicationDocumentGeneratorDependencies["renderCoverLetter"];
};

export type SidecarEmailCheckOptions = EmailResponseWorkerDependencies & {
  maxResponses?: number;
};

export type SidecarColdEmailOptions = Omit<ColdEmailWorkerDependencies, "generateColdEmail"> & {
  generateColdEmail?: ColdEmailWorkerDependencies["generateColdEmail"];
  maxEmails?: number;
};

export type SidecarAnalyticsOptions = AnalyticsRefreshWorkerDependencies;

export type SidecarExportSyncOptions = ExportSyncWorkerDependencies;

export type SidecarCleanupOptions = CleanupWorkerDependencies & {
  archiveJobsOlderThanDays?: number;
};

export type SidecarRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  browserSessionHealth?: {
    targets: BrowserSessionHealthTarget[];
    openSession?: (platform: string) => Promise<BrowserSession>;
    validateSession?: Parameters<typeof runBrowserSessionHealthCheck>[0]["validateSession"];
  };
  jobDiscovery?: JobDiscoveryWorkflowDependencies;
  applicationProcessing?: SidecarApplicationProcessingOptions;
  applicationDocuments?: SidecarApplicationDocumentOptions;
  analytics?: SidecarAnalyticsOptions;
  emailCheck?: SidecarEmailCheckOptions;
  emailAdapters?: {
    createEmailReader?: EmailReaderFactory;
    createEmailSender?: EmailSenderFactory;
  };
  coldEmail?: SidecarColdEmailOptions;
  exportSync?: SidecarExportSyncOptions;
  cleanup?: SidecarCleanupOptions;
  followUps?: SidecarFollowUpOptions;
  notifications?: NotificationManagerOptions;
  scheduledTasks?: ScheduledTaskPersistence;
  scheduler?: {
    pollIntervalMs?: number;
    runOnStart?: boolean;
    setInterval?: SchedulerServiceDependencies["setInterval"];
    clearInterval?: SchedulerServiceDependencies["clearInterval"];
    onError?: SchedulerServiceDependencies["onError"];
  };
};

export function createSidecarRuntime(options: SidecarRuntimeOptions = {}) {
  const env = options.env ?? process.env;
  const eventBus = new EventBus<CareerEventMap>();
  const workflowEngine = new WorkflowEngine(eventBus);
  const aiEngine = createAIEngineFromEnv(env);
  const browserManager = new BrowserManager(createPlaywrightBrowserAdapter());
  const now = options.now ?? (() => new Date());
  const jobDiscovery = options.jobDiscovery ?? createEmptyJobDiscoveryDependencies();
  const applicationProcessing = createApplicationWorkerDependencies(
    options.applicationProcessing,
    options.applicationDocuments,
    aiEngine,
    eventBus,
    now,
  );
  const analytics = options.analytics ?? createEmptyAnalyticsRefreshWorkerDependencies();
  const emailCheck = options.emailCheck ?? createEmptyEmailResponseWorkerDependencies();
  const coldEmail = createColdEmailWorkerDependencies(options.coldEmail, aiEngine);
  const exportSync = options.exportSync ?? createEmptyExportSyncWorkerDependencies();
  const cleanup = options.cleanup ?? createEmptyCleanupWorkerDependencies();
  const followUps = options.followUps ?? createEmptyFollowUpDependencies();
  const scheduledTaskPersistence = options.scheduledTasks ?? createEmptyScheduledTaskPersistence();
  const notificationOutbox: NotificationDelivery[] = [];
  bindNotificationManager(
    eventBus,
    new NotificationManager(
      createRuntimeNotificationOptions(options.notifications, notificationOutbox, now),
    ),
  );

  workflowEngine.register({
    id: "job-discovery",
    description: "Search configured job queries and persist discovered jobs",
    run: async (input) => {
      const feedSources = discoveryFeedSourcesFromWorkflowInput(input);
      const discoveryDependencies = feedSources
        ? createHttpFeedDiscoveryDependencies(feedSources, jobDiscovery)
        : jobDiscovery;

      return runJobDiscoveryWorkflow(discoveryDependencies, {
        eventBus,
        searchQueries: discoverySearchQueriesFromWorkflowInput(input),
      });
    },
  });
  workflowEngine.register({
    id: "application-processing",
    description: "Process queued applications through the application workflow",
    run: async () =>
      runApplicationWorker(applicationProcessing, {
        now: now(),
        eventBus,
        maxApplications: options.applicationProcessing?.maxApplications,
        reviewBeforeSubmit: options.applicationProcessing?.reviewBeforeSubmit,
      }),
  });
  workflowEngine.register({
    id: "analytics-refresh",
    description: "Recalculate dashboard analytics metrics",
    run: async (input) => {
      const configuredAnalytics = createAnalyticsDependenciesFromWorkflowInput(input, {
        fallback: analytics,
      });

      return runAnalyticsRefreshWorker(configuredAnalytics ?? analytics, {
        now: now(),
        eventBus,
      });
    },
  });
  workflowEngine.register({
    id: "email-check",
    description: "Check inbound email responses and update application records",
    run: async (input) => {
      const configuredEmailCheck = createEmailCheckDependenciesFromWorkflowInput(input, {
        fallback: emailCheck,
        createEmailReader: options.emailAdapters?.createEmailReader,
      });

      return runEmailResponseWorker(configuredEmailCheck ?? emailCheck, {
        now: now(),
        eventBus,
        maxResponses: options.emailCheck?.maxResponses,
      });
    },
  });
  workflowEngine.register({
    id: "cold-email",
    description: "Generate cold outreach and record sent communications",
    run: async (input) => {
      const configuredColdEmail = createColdEmailDependenciesFromWorkflowInput(input, {
        fallback: coldEmail,
        createEmailSender: options.emailAdapters?.createEmailSender,
      });

      return runColdEmailWorker(configuredColdEmail ?? coldEmail, {
        now: now(),
        eventBus,
        maxEmails: options.coldEmail?.maxEmails,
      });
    },
  });
  workflowEngine.register({
    id: "export-sync",
    description: "Sync application and analytics data to configured exporters",
    run: async () =>
      runExportSyncWorker(exportSync, {
        now: now(),
        eventBus,
      }),
  });
  workflowEngine.register({
    id: "follow-up-check",
    description: "Send due follow-ups for applications awaiting a response",
    run: async (input) => {
      const configuredFollowUps = createFollowUpDependenciesFromWorkflowInput(input, {
        fallback: followUps,
        createEmailSender: options.emailAdapters?.createEmailSender,
      });

      return runFollowUpWorker(configuredFollowUps ?? followUps, {
        now: now(),
        followUpDelaysDays: options.followUps?.followUpDelaysDays ?? [3, 7, 14],
        maxFollowUps: options.followUps?.maxFollowUps ?? 3,
        eventBus,
      });
    },
  });
  workflowEngine.register({
    id: "cleanup",
    description: "Purge expired cache records and archive old jobs",
    run: async () =>
      runCleanupWorker(cleanup, {
        now: now(),
        archiveJobsOlderThanDays: options.cleanup?.archiveJobsOlderThanDays,
        eventBus,
      }),
  });
  workflowEngine.register({
    id: "session-health",
    description: "Verify configured browser sessions are valid",
    run: async () =>
      runBrowserSessionHealthCheck(
        {
          openSession:
            options.browserSessionHealth?.openSession ??
            ((platform) => browserManager.openSession(platform)),
          validateSession: options.browserSessionHealth?.validateSession,
        },
        {
          checkedAt: now(),
          eventBus,
          targets: options.browserSessionHealth?.targets ?? browserSessionTargetsFromEnv(env),
        },
      ),
  });
  const scheduledTaskRunnerDependencies = createScheduledTaskRunnerDependencies(
    scheduledTaskPersistence,
    (workflowId) => workflowEngine.run(workflowId),
  );
  const runDueRuntimeScheduledTasks = (runAt: Date = now()): Promise<ScheduledTaskRunnerResult> =>
    runDueScheduledTasks(scheduledTaskRunnerDependencies, {
      now: runAt,
      workflowsByTaskType: DEFAULT_WORKFLOWS_BY_TASK_TYPE,
      eventBus,
    });
  const schedulerService = createSchedulerService(
    {
      runDueTasks: runDueRuntimeScheduledTasks,
      now,
      setInterval: options.scheduler?.setInterval,
      clearInterval: options.scheduler?.clearInterval,
      onError: options.scheduler?.onError,
    },
    {
      pollIntervalMs: options.scheduler?.pollIntervalMs ?? 60_000,
      runOnStart: options.scheduler?.runOnStart,
    },
  );

  return {
    aiEngine,
    browserManager,
    eventBus,
    reviewApplication: (application: ApplicationProcessingApplication, decision: ApplicationReviewDecision) =>
      runApplicationReviewDecision(application, decision, applicationProcessing, {
        now: now(),
        eventBus,
      }),
    drainNotifications: () => drainNotificationOutbox(notificationOutbox),
    runDueScheduledTasks: runDueRuntimeScheduledTasks,
    schedulerService,
    workflowEngine,
  };
}

function createRuntimeNotificationOptions(
  options: NotificationManagerOptions | undefined,
  outbox: NotificationDelivery[],
  now: () => Date,
): NotificationManagerOptions {
  const adapters = (options?.adapters ?? []).map((adapter) =>
    isRecordedRuntimeNotificationChannel(adapter.channel)
      ? recordingNotificationAdapter(adapter.channel, adapter, outbox)
      : adapter,
  );

  for (const channel of recordedRuntimeNotificationChannels) {
    if (!adapters.some((adapter) => adapter.channel === channel)) {
      adapters.push(recordingNotificationAdapter(channel, undefined, outbox));
    }
  }

  return {
    adapters,
    disabledChannels: options?.disabledChannels,
    now: options?.now ?? now,
  };
}

const recordedRuntimeNotificationChannels = ["os", "in_app"] satisfies NotificationChannel[];
const recordedRuntimeNotificationChannelSet = new Set<NotificationChannel>(
  recordedRuntimeNotificationChannels,
);

function isRecordedRuntimeNotificationChannel(
  channel: NotificationChannel,
): channel is (typeof recordedRuntimeNotificationChannels)[number] {
  return recordedRuntimeNotificationChannelSet.has(channel);
}

function recordingNotificationAdapter(
  channel: NotificationChannel,
  adapter: NotificationAdapter | undefined,
  outbox: NotificationDelivery[],
): NotificationAdapter {
  return {
    channel,
    send: async (notification) => {
      outbox.push(notification);
      await adapter?.send(notification);
    },
  };
}

async function drainNotificationOutbox(outbox: NotificationDelivery[]) {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  return outbox.splice(0).map((notification) => ({
    ...notification,
    createdAt: notification.createdAt.toISOString(),
  }));
}

function discoverySearchQueriesFromWorkflowInput(input: unknown): SearchQuery[] | undefined {
  if (!isRecord(input) || !isRecord(input.discovery)) {
    return undefined;
  }
  const { searchQueries } = input.discovery;
  if (!Array.isArray(searchQueries)) {
    return undefined;
  }

  return searchQueries.filter(isSearchQuery);
}

function discoveryFeedSourcesFromWorkflowInput(input: unknown): HttpJsonFeedSource[] | undefined {
  if (!isRecord(input) || !isRecord(input.discovery)) {
    return undefined;
  }
  const { feedSources } = input.discovery;
  if (!Array.isArray(feedSources)) {
    return undefined;
  }

  const sources = feedSources.filter(isHttpJsonFeedSource);
  return sources.length > 0 ? sources : undefined;
}

function createHttpFeedDiscoveryDependencies(
  feedSources: HttpJsonFeedSource[],
  base: JobDiscoveryWorkflowDependencies,
): JobDiscoveryWorkflowDependencies {
  const manager = new DiscoveryManager(
    feedSources.map((source) => new HttpJsonFeedConnector(source)),
  );

  return {
    searchQueries: base.searchQueries,
    searchForPersistence: (query) => manager.searchForPersistence(query),
    upsertJobs: base.upsertJobs,
  };
}

function isHttpJsonFeedSource(value: unknown): value is HttpJsonFeedSource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.url === "string" &&
    value.url.trim().length > 0 &&
    (value.platform === undefined || typeof value.platform === "string") &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.headers === undefined || isStringRecord(value.headers))
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    isRecord(value) &&
    Object.values(value).every((item) => typeof item === "string")
  );
}

function isSearchQuery(value: unknown): value is SearchQuery {
  return (
    isRecord(value) &&
    Array.isArray(value.keywords) &&
    value.keywords.length > 0 &&
    value.keywords.every((keyword) => typeof keyword === "string" && keyword.trim().length > 0)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function createEmptyJobDiscoveryDependencies(): JobDiscoveryWorkflowDependencies {
  return {
    searchQueries: [],
    searchForPersistence: async () => [],
    upsertJobs: async () => [],
  };
}

function createApplicationWorkerDependencies(
  options: SidecarApplicationProcessingOptions | undefined,
  documentOptions: SidecarApplicationDocumentOptions | undefined,
  aiEngine: AIEngine,
  eventBus: EventBus<CareerEventMap>,
  now: () => Date,
): ApplicationWorkerDependencies {
  const empty = createEmptyApplicationWorkerDependencies();
  const documentGenerators = documentOptions
    ? createRuntimeDocumentGenerators(documentOptions, aiEngine, eventBus, now)
    : null;

  return {
    listApplications: options?.listApplications ?? empty.listApplications,
    prepareApplication: options?.prepareApplication ?? empty.prepareApplication,
    generateResume:
      options?.generateResume ?? documentGenerators?.generateResume ?? empty.generateResume,
    generateCoverLetter:
      options?.generateCoverLetter ??
      documentGenerators?.generateCoverLetter ??
      empty.generateCoverLetter,
    fillApplicationForm: options?.fillApplicationForm ?? empty.fillApplicationForm,
    submitApplication: options?.submitApplication ?? empty.submitApplication,
    verifySubmission: options?.verifySubmission,
    updateApplication: options?.updateApplication ?? empty.updateApplication,
  };
}

function createRuntimeDocumentGenerators(
  options: SidecarApplicationDocumentOptions,
  aiEngine: AIEngine,
  eventBus: EventBus<CareerEventMap>,
  now: () => Date,
): ApplicationDocumentWorkerDependencies {
  const dependencies: ApplicationDocumentGeneratorDependencies = {
    ai: options.ai ?? aiEngine,
    loadContext: options.loadContext,
    renderResume:
      options.renderResume ??
      ((input) => renderResumeArtifacts(input, { outputDir: options.outputDir })),
    renderCoverLetter:
      options.renderCoverLetter ??
      ((input) => renderCoverLetterPdf(input, { outputDir: options.outputDir })),
    saveDocument: options.saveDocument,
  };

  return {
    generateResume: async (application) =>
      createApplicationDocumentGenerators(dependencies, {
        now: now(),
        eventBus,
      }).generateResume(application),
    generateCoverLetter: async (application) =>
      createApplicationDocumentGenerators(dependencies, {
        now: now(),
        eventBus,
      }).generateCoverLetter(application),
  };
}

function createEmptyApplicationWorkerDependencies(): ApplicationWorkerDependencies {
  return {
    listApplications: async () => [],
    prepareApplication: async () => undefined,
    generateResume: async () => ({ resumePath: null }),
    generateCoverLetter: async () => ({ coverLetterPath: null }),
    fillApplicationForm: async () => ({ submissionUrl: null }),
    submitApplication: async () => ({ confirmationId: null }),
    updateApplication: async () => undefined,
  };
}

function createEmptyAnalyticsRefreshWorkerDependencies(): AnalyticsRefreshWorkerDependencies {
  return {
    loadInputs: async () => ({ applications: [], jobs: [] }),
    saveSnapshot: async () => undefined,
  };
}

function createEmptyEmailResponseWorkerDependencies(): EmailResponseWorkerDependencies {
  return {
    fetchResponses: async () => [],
    saveCommunication: async () => ({ communicationId: null }),
    updateApplicationResponse: async () => undefined,
    markResponseProcessed: async () => undefined,
  };
}

function createColdEmailWorkerDependencies(
  options: SidecarColdEmailOptions | undefined,
  aiEngine: AIEngine,
): ColdEmailWorkerDependencies {
  return {
    loadProfile: options?.loadProfile ?? (async () => null),
    listTargets: options?.listTargets ?? (async () => []),
    generateColdEmail:
      options?.generateColdEmail ??
      ((profile, company) => aiEngine.generateColdEmail(profile, company)),
    saveCommunication: options?.saveCommunication ?? (async () => ({ communicationId: null })),
  };
}

function createEmptyExportSyncWorkerDependencies(): ExportSyncWorkerDependencies {
  return {
    loadExportPayload: async () => ({ applications: [], analytics: null }),
    listExporters: async () => [],
    saveExportRun: async () => undefined,
  };
}

function createEmptyCleanupWorkerDependencies(): CleanupWorkerDependencies {
  return {
    purgeExpiredAiCache: async () => ({ deleted: 0 }),
    archiveOldJobs: async () => ({ archived: 0 }),
  };
}

function createEmptyFollowUpDependencies(): FollowUpWorkerDependencies {
  return {
    listApplications: async () => [],
    sendFollowUp: async () => ({ communicationId: null }),
    updateApplicationFollowUp: async () => undefined,
  };
}

function createEmptyScheduledTaskPersistence(): ScheduledTaskPersistence {
  return {
    listScheduledTasks: async () => [],
    updateScheduledTaskRun: async () => undefined,
  };
}

export function browserSessionTargetsFromEnv(env: NodeJS.ProcessEnv = process.env): BrowserSessionHealthTarget[] {
  return (env.BROWSER_SESSION_PLATFORMS ?? "")
    .split(",")
    .map((platform) => platform.trim())
    .filter((platform) => platform.length > 0)
    .map((platform) => ({ platform, isEnabled: true }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = createSidecarRuntime();
  if (process.argv.includes("--stdio")) {
    runSidecarIpc(runtime).catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
  } else {
    console.log(
      JSON.stringify({
        status: "ready",
        workflows: runtime.workflowEngine.registeredWorkflows(),
        provider: runtime.aiEngine.activeProvider(),
      }),
    );
  }
}
