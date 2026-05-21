import { AIEngine } from "./ai/ai-engine.js";
import type { AIProvider } from "./ai/provider-interface.js";
import { OllamaProvider } from "./ai/providers/ollama-provider.js";
import { OpenAIProvider } from "./ai/providers/openai-provider.js";
import { OpenRouterProvider } from "./ai/providers/openrouter-provider.js";
import {
  BrowserManager,
  createPlaywrightBrowserAdapter,
  type BrowserSession,
} from "./browser/browser-manager.js";
import {
  runBrowserSessionHealthCheck,
  type BrowserSessionHealthTarget,
} from "./browser/session-health.js";
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

export type SidecarRuntimeOptions = {
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  browserSessionHealth?: {
    targets: BrowserSessionHealthTarget[];
    openSession?: (platform: string) => Promise<BrowserSession>;
    validateSession?: Parameters<typeof runBrowserSessionHealthCheck>[0]["validateSession"];
  };
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
  const scheduledTaskPersistence = options.scheduledTasks ?? createEmptyScheduledTaskPersistence();

  workflowEngine.register({
    id: "daily-discovery",
    description: "Placeholder discovery workflow for the Phase 1 foundation",
    run: async () => ({ queued: 0 }),
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
    runDueScheduledTasks: runDueRuntimeScheduledTasks,
    schedulerService,
    workflowEngine,
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
  console.log(
    JSON.stringify({
      status: "ready",
      workflows: runtime.workflowEngine.registeredWorkflows(),
      provider: runtime.aiEngine.activeProvider(),
    }),
  );
}
