import { AIEngine } from "./ai/ai-engine.js";
import type { AIProvider } from "./ai/provider-interface.js";
import { OllamaProvider } from "./ai/providers/ollama-provider.js";
import { OpenAIProvider } from "./ai/providers/openai-provider.js";
import { OpenRouterProvider } from "./ai/providers/openrouter-provider.js";
import { EventBus } from "./orchestrator/event-bus.js";
import type { CareerEventMap } from "./orchestrator/events.js";
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

export function createSidecarRuntime() {
  const eventBus = new EventBus<CareerEventMap>();
  const workflowEngine = new WorkflowEngine(eventBus);
  const aiEngine = createAIEngineFromEnv();

  workflowEngine.register({
    id: "daily-discovery",
    description: "Placeholder discovery workflow for the Phase 1 foundation",
    run: async () => ({ queued: 0 }),
  });

  return {
    aiEngine,
    eventBus,
    workflowEngine,
  };
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
