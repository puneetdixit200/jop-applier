import { AIEngine } from "./ai/ai-engine.js";
import type { AIProvider } from "./ai/provider-interface.js";
import { AnthropicProvider } from "./ai/providers/anthropic-provider.js";
import { GroqProvider } from "./ai/providers/groq-provider.js";
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
  createDefaultStealthConfig,
  createPlaywrightBrowserAdapter,
  type BrowserSession,
} from "./browser/browser-manager.js";
import { EncryptedBrowserSessionStore } from "./browser/session-store.js";
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
import type { JobConnector, SearchQuery } from "./discovery/connectors/connector-interface.js";
import { DiscoveryManager } from "./discovery/discovery-manager.js";
import { BambooHrConnector } from "./discovery/connectors/bamboohr-connector.js";
import {
  CareerPageConnector,
  type CareerPageSource,
} from "./discovery/connectors/career-page-connector.js";
import { GreenhouseConnector } from "./discovery/connectors/greenhouse-connector.js";
import { IcimsConnector } from "./discovery/connectors/icims-connector.js";
import {
  HttpJsonFeedConnector,
  type HttpJsonFeedSource,
} from "./discovery/connectors/http-json-feed-connector.js";
import {
  JobPortalConnector,
  type JobPortalSource,
} from "./discovery/connectors/job-portal-connector.js";
import { LeverConnector } from "./discovery/connectors/lever-connector.js";
import { WorkdayConnector } from "./discovery/connectors/workday-connector.js";
import {
  runExportSyncWorker,
  type ExportSyncWorkerDependencies,
} from "./export/export-sync-worker.js";
import {
  createExportSyncDependenciesFromWorkflowInput,
} from "./export/export-sync-config.js";
import { runSidecarIpc } from "./ipc/runtime-ipc.js";
import {
  bindLocalEventLog,
  defaultLocalEventLogDir,
  type LocalEventLogOptions,
} from "./logging/local-event-log.js";
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
import {
  createDiscordNotificationAdapter,
  createTelegramNotificationAdapter,
} from "./notifications/webhook-adapters.js";
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
import { PluginManager, type Plugin } from "./plugins/plugin-manager.js";
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

  if (env.ANTHROPIC_API_KEY) {
    providers.push(
      new AnthropicProvider({
        apiKey: env.ANTHROPIC_API_KEY,
        model: env.ANTHROPIC_MODEL ?? "claude-3-5-haiku-latest",
      }),
    );
  }

  if (env.GROQ_API_KEY) {
    providers.push(
      new GroqProvider({
        apiKey: env.GROQ_API_KEY,
        model: env.GROQ_MODEL ?? "llama-3.1-8b-instant",
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
  plugins?: Plugin[];
  logging?: LocalEventLogOptions | false;
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
  const eventLog = options.logging
    ? bindLocalEventLog(eventBus, {
        ...options.logging,
        now: options.logging.now ?? options.now,
      })
    : undefined;
  const workflowEngine = new WorkflowEngine(eventBus);
  const pluginManager = new PluginManager({ eventBus, workflowEngine, env });
  for (const plugin of options.plugins ?? []) {
    pluginManager.register(plugin);
  }
  const aiEngine = createAIEngineFromEnv(env);
  const browserStealthConfig = browserStealthConfigFromEnv(env);
  const browserManager = new BrowserManager(
    createPlaywrightBrowserAdapter(),
    browserStealthConfig,
    {
      sessionStore: browserSessionStoreFromEnv(env, browserStealthConfig.sessionRoot),
    },
  );
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
      createRuntimeNotificationOptions(options.notifications, notificationOutbox, now, env),
    ),
  );

  workflowEngine.register({
    id: "job-discovery",
    description: "Search configured job queries and persist discovered jobs",
    run: async (input) => {
      const connectors = discoveryConnectorsFromWorkflowInput(input);
      const discoveryDependencies = connectors.length > 0
        ? createConnectorDiscoveryDependencies(connectors, jobDiscovery)
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
    run: async (input) => {
      const configuredExportSync = createExportSyncDependenciesFromWorkflowInput(input, {
        fallback: exportSync,
      });

      return runExportSyncWorker(configuredExportSync ?? exportSync, {
        now: now(),
        eventBus,
      });
    },
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
          closeSession: options.browserSessionHealth?.openSession
            ? undefined
            : (platform) => browserManager.closeSession(platform),
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
    flushLogs: () => eventLog?.flush() ?? Promise.resolve(),
    closeLogs: () => eventLog?.close() ?? Promise.resolve(),
    runDueScheduledTasks: runDueRuntimeScheduledTasks,
    pluginManager,
    schedulerService,
    workflowEngine,
  };
}

function createRuntimeNotificationOptions(
  options: NotificationManagerOptions | undefined,
  outbox: NotificationDelivery[],
  now: () => Date,
  env: NodeJS.ProcessEnv,
): NotificationManagerOptions {
  const adapters = [
    ...runtimeNotificationAdaptersFromEnv(env, options?.adapters ?? []),
    ...(options?.adapters ?? []),
  ].map((adapter) =>
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

function runtimeNotificationAdaptersFromEnv(
  env: NodeJS.ProcessEnv,
  configuredAdapters: NotificationAdapter[],
): NotificationAdapter[] {
  const adapters: NotificationAdapter[] = [];
  const telegramBotToken = env.TELEGRAM_BOT_TOKEN ?? env.CAREERCAVEMAN_TELEGRAM_BOT_TOKEN;
  const telegramChatId = env.TELEGRAM_CHAT_ID ?? env.CAREERCAVEMAN_TELEGRAM_CHAT_ID;
  if (
    telegramBotToken &&
    telegramChatId &&
    !configuredAdapters.some((adapter) => adapter.channel === "telegram")
  ) {
    adapters.push(
      createTelegramNotificationAdapter({
        botToken: telegramBotToken,
        chatId: telegramChatId,
      }),
    );
  }

  const discordWebhookUrl = env.DISCORD_WEBHOOK_URL ?? env.CAREERCAVEMAN_DISCORD_WEBHOOK_URL;
  if (
    discordWebhookUrl &&
    !configuredAdapters.some((adapter) => adapter.channel === "discord")
  ) {
    adapters.push(
      createDiscordNotificationAdapter({
        webhookUrl: discordWebhookUrl,
      }),
    );
  }

  return adapters;
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

function discoveryConnectorsFromWorkflowInput(input: unknown): JobConnector[] {
  if (!isRecord(input) || !isRecord(input.discovery)) {
    return [];
  }
  return [
    ...discoveryFeedSourcesFromWorkflowInput(input.discovery).map(
      (source) => new HttpJsonFeedConnector(source),
    ),
    ...discoveryPortalSourcesFromWorkflowInput(input.discovery).map(
      (source) => new JobPortalConnector(source),
    ),
    ...discoveryAtsSourcesFromWorkflowInput(input.discovery).map((source) => {
      if (source.type === "greenhouse") {
        return new GreenhouseConnector({ boardToken: source.boardToken });
      }
      if (source.type === "lever") {
        return new LeverConnector({ company: source.company });
      }
      if (source.type === "workday") {
        return new WorkdayConnector({
          tenant: source.tenant,
          site: source.site,
          baseUrl: source.baseUrl,
        });
      }
      if (source.type === "bamboohr") {
        return new BambooHrConnector({
          subdomain: source.subdomain,
          baseUrl: source.baseUrl,
        });
      }
      return new IcimsConnector({
        searchUrl: source.searchUrl,
        customerId: source.customerId,
        portal: source.portal,
        company: source.company,
        apiBaseUrl: source.apiBaseUrl,
      });
    }),
    ...discoveryCareerPageSourcesFromWorkflowInput(input.discovery).map(
      (source) => new CareerPageConnector(source),
    ),
  ];
}

function discoveryPortalSourcesFromWorkflowInput(discovery: Record<string, unknown>): JobPortalSource[] {
  const { portalSources } = discovery;
  if (!Array.isArray(portalSources)) {
    return [];
  }

  return portalSources.filter(isJobPortalSource);
}

function discoveryFeedSourcesFromWorkflowInput(discovery: Record<string, unknown>): HttpJsonFeedSource[] {
  const { feedSources } = discovery;
  if (!Array.isArray(feedSources)) {
    return [];
  }

  return feedSources.filter(isHttpJsonFeedSource);
}

type DiscoveryAtsSource =
  | { type: "greenhouse"; boardToken: string }
  | { type: "lever"; company: string }
  | { type: "workday"; tenant: string; site: string; baseUrl?: string }
  | { type: "bamboohr"; subdomain: string; baseUrl?: string }
  | {
      type: "icims";
      searchUrl?: string;
      customerId?: string;
      portal?: string;
      company?: string;
      apiBaseUrl?: string;
    };

function discoveryAtsSourcesFromWorkflowInput(discovery: Record<string, unknown>): DiscoveryAtsSource[] {
  const { atsSources } = discovery;
  if (!Array.isArray(atsSources)) {
    return [];
  }

  return atsSources.filter(isDiscoveryAtsSource);
}

function discoveryCareerPageSourcesFromWorkflowInput(
  discovery: Record<string, unknown>,
): CareerPageSource[] {
  const { careerPageSources } = discovery;
  if (!Array.isArray(careerPageSources)) {
    return [];
  }

  return careerPageSources.filter(isCareerPageSource);
}

function createConnectorDiscoveryDependencies(
  connectors: JobConnector[],
  base: JobDiscoveryWorkflowDependencies,
): JobDiscoveryWorkflowDependencies {
  const manager = new DiscoveryManager(connectors);

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

function isJobPortalSource(value: unknown): value is JobPortalSource {
  return (
    isRecord(value) &&
    isPortalPlatform(value.platform) &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.searchUrl === undefined || typeof value.searchUrl === "string") &&
    (value.headers === undefined || isStringRecord(value.headers))
  );
}

function isDiscoveryAtsSource(value: unknown): value is DiscoveryAtsSource {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }
  if (value.type === "greenhouse") {
    return typeof value.boardToken === "string" && value.boardToken.trim().length > 0;
  }
  if (value.type === "lever") {
    return typeof value.company === "string" && value.company.trim().length > 0;
  }
  if (value.type === "workday") {
    return (
      typeof value.tenant === "string" &&
      value.tenant.trim().length > 0 &&
      typeof value.site === "string" &&
      value.site.trim().length > 0 &&
      (value.baseUrl === undefined || typeof value.baseUrl === "string")
    );
  }
  if (value.type === "bamboohr") {
    return (
      typeof value.subdomain === "string" &&
      value.subdomain.trim().length > 0 &&
      (value.baseUrl === undefined || typeof value.baseUrl === "string")
    );
  }
  if (value.type === "icims") {
    return (
      ((typeof value.searchUrl === "string" && value.searchUrl.trim().length > 0) ||
        (typeof value.customerId === "string" && value.customerId.trim().length > 0)) &&
      (value.portal === undefined || typeof value.portal === "string") &&
      (value.company === undefined || typeof value.company === "string") &&
      (value.apiBaseUrl === undefined || typeof value.apiBaseUrl === "string")
    );
  }

  return false;
}

function isPortalPlatform(value: unknown): value is JobPortalSource["platform"] {
  return (
    value === "linkedin" ||
    value === "indeed" ||
    value === "internshala" ||
    value === "naukri" ||
    value === "wellfound"
  );
}

function isCareerPageSource(value: unknown): value is CareerPageSource {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    value.id.trim().length > 0 &&
    typeof value.url === "string" &&
    value.url.trim().length > 0 &&
    (value.name === undefined || typeof value.name === "string") &&
    (value.company === undefined || typeof value.company === "string") &&
    (value.platform === undefined || typeof value.platform === "string") &&
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

function browserStealthConfigFromEnv(env: NodeJS.ProcessEnv) {
  const proxyList = (env.BROWSER_PROXY_LIST ?? env.CAREERCAVEMAN_BROWSER_PROXY_LIST ?? "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean)
    .map((server) => ({ server }));
  const sessionRoot = env.BROWSER_SESSION_ROOT ?? env.CAREERCAVEMAN_BROWSER_SESSION_ROOT;
  const persistCookies =
    env.BROWSER_PERSIST_COOKIES ?? env.CAREERCAVEMAN_BROWSER_PERSIST_COOKIES;

  return createDefaultStealthConfig({
    rotateProxy: booleanEnv(env.BROWSER_ROTATE_PROXY ?? env.CAREERCAVEMAN_BROWSER_ROTATE_PROXY),
    proxyList,
    ...(sessionRoot ? { sessionRoot } : {}),
    ...(persistCookies !== undefined ? { persistCookies: booleanEnv(persistCookies) } : {}),
  });
}

function browserSessionStoreFromEnv(env: NodeJS.ProcessEnv, sessionRoot: string) {
  const key = env.BROWSER_SESSION_KEY ?? env.CAREERCAVEMAN_BROWSER_SESSION_KEY;
  if (!key) {
    return undefined;
  }

  return new EncryptedBrowserSessionStore({ rootDir: sessionRoot, key });
}

function booleanEnv(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const runtime = createSidecarRuntime({
    logging: {
      logDir: process.env.CAREERCAVEMAN_LOG_DIR ?? defaultLocalEventLogDir(),
    },
  });
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
