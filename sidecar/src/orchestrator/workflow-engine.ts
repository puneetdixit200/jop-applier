import type { EventBus } from "./event-bus.js";
import type { CareerEventMap } from "./events.js";

export type WorkflowDefinition<Result = unknown> = {
  id: string;
  description: string;
  run: () => Promise<Result>;
};

export class WorkflowEngine {
  private readonly workflows = new Map<string, WorkflowDefinition>();

  constructor(private readonly eventBus: EventBus<CareerEventMap>) {}

  register(workflow: WorkflowDefinition): void {
    if (this.workflows.has(workflow.id)) {
      throw new Error(`Workflow already registered: ${workflow.id}`);
    }
    this.workflows.set(workflow.id, workflow);
  }

  async run<Result = unknown>(workflowId: string): Promise<Result> {
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
      const result = (await workflow.run()) as Result;
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
}

