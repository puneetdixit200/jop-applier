import { AIEngine } from "./ai/ai-engine.js";
import type { AIProvider } from "./ai/provider-interface.js";
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

export function createSidecarRuntime() {
  const eventBus = new EventBus<CareerEventMap>();
  const workflowEngine = new WorkflowEngine(eventBus);
  const aiEngine = new AIEngine([new OfflineProvider()]);

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

