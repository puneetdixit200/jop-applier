import type { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";
import {
  retryWithBackoff,
  runWithTimeout,
  type CircuitBreaker,
  type Sleep,
} from "./resilience.js";

export type WorkflowDefinition<Result = unknown> = {
  id: string;
  description: string;
  errorStrategy?: "stop" | "skip" | "retry";
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  circuitBreaker?: CircuitBreaker;
  run: (input?: unknown) => Promise<Result>;
};

export type WorkflowEngineOptions = {
  sleep?: Sleep;
};

export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();
  private readonly sleep: Sleep;

  constructor(
    private readonly eventBus: EventBus<CareerEventMap>,
    options: WorkflowEngineOptions = {},
  ) {
    this.sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)));
  }

  register(workflow: WorkflowDefinition): void {
    if (this.workflows.has(workflow.id)) {
      throw new Error(`Workflow already registered: ${workflow.id}`);
    }
    this.workflows.set(workflow.id, workflow);
  }

  async run<Result = unknown>(workflowId: string, input?: unknown): Promise<Result> {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Unknown workflow: ${workflowId}`);
    }

    const startedAt = Date.now();
    this.eventBus.emit("workflow.started", {
      workflowId,
      startedAt: new Date(startedAt),
    });

    try {
      const result = (await this.executeWorkflow(workflow, input)) as Result;
      this.eventBus.emit("workflow.completed", {
        workflowId,
        status: "completed",
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      this.eventBus.emit("workflow.completed", {
        workflowId,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  registeredWorkflows(): string[] {
    return [...this.workflows.keys()].sort();
  }

  private executeWorkflow<Result>(
    workflow: WorkflowDefinition<Result>,
    input: unknown,
  ): Promise<Result> {
    const runOnce = () =>
      workflow.timeoutMs
        ? runWithTimeout(() => workflow.run(input), workflow.timeoutMs)
        : workflow.run(input);
    const runWithRetry = () =>
      workflow.errorStrategy === "retry"
        ? retryWithBackoff(runOnce, {
            maxRetries: workflow.maxRetries ?? 3,
            initialDelayMs: workflow.retryDelayMs ?? 1_000,
            sleep: this.sleep,
          })
        : runOnce();

    return workflow.circuitBreaker
      ? workflow.circuitBreaker.execute(runWithRetry)
      : runWithRetry();
  }
}
