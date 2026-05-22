import { describe, expect, it, vi } from "vitest";
import {
  loadRuntimeControlStatus,
  runRuntimeWorkflow,
  type RuntimeControlDependencies,
} from "./runtime-control";

function dependencies(
  overrides: Partial<RuntimeControlDependencies> = {},
): RuntimeControlDependencies {
  return {
    isDesktopRuntime: () => true,
    getSidecarStatus: async () => ({
      status: "ready",
      workflows: ["application-processing", "job-discovery"],
      provider: {
        provider: "ollama",
        model: "mistral:7b-instruct",
        local: true,
      },
    }),
    runSidecarWorkflow: async (workflowId) => ({ workflowId, stored: 2 }),
    ...overrides,
  };
}

describe("runtime control", () => {
  it("loads sidecar status for the desktop runtime", async () => {
    const status = await loadRuntimeControlStatus(dependencies());

    expect(status).toEqual({
      providerLabel: "ollama:mistral:7b-instruct",
      runtimeStatus: "ready",
      statusMessage: "ready · 2 workflows",
      workflowCount: 2,
    });
  });

  it("uses browser preview status without calling sidecar commands", async () => {
    let calls = 0;

    const status = await loadRuntimeControlStatus(
      dependencies({
        isDesktopRuntime: () => false,
        getSidecarStatus: async () => {
          calls += 1;
          throw new Error("should not be called");
        },
      }),
    );

    expect(calls).toBe(0);
    expect(status).toEqual({
      providerLabel: "Browser preview",
      runtimeStatus: "Preview",
      statusMessage: "Browser preview",
      workflowCount: 0,
    });
  });

  it("runs a workflow through the sidecar command dependency", async () => {
    const result = await runRuntimeWorkflow(dependencies(), "job-discovery");

    expect(result).toEqual({
      ok: true,
      statusMessage: "job-discovery completed",
      result: {
        workflowId: "job-discovery",
        stored: 2,
      },
    });
  });

  it("delivers native notifications returned by successful workflow runs", async () => {
    const workflowResult = {
      workflowId: "application-processing",
      notifications: [
        {
          type: "application.failed",
          title: "Application failed",
          body: "Northstar Labs application failed: captcha challenge",
          priority: "high",
          channel: "os",
        },
      ],
    };
    const deliverWorkflowOsNotifications = vi.fn(async () => undefined);

    await expect(
      runRuntimeWorkflow(
        dependencies({
          runSidecarWorkflow: async () => workflowResult,
          deliverWorkflowOsNotifications,
        }),
        "application-processing",
      ),
    ).resolves.toEqual({
      ok: true,
      statusMessage: "application-processing completed",
      result: workflowResult,
    });
    expect(deliverWorkflowOsNotifications).toHaveBeenCalledWith(workflowResult);
  });

  it("returns a workflow failure status without throwing", async () => {
    const result = await runRuntimeWorkflow(
      dependencies({
        runSidecarWorkflow: async () => {
          throw new Error("Unknown workflow");
        },
      }),
      "missing",
    );

    expect(result).toEqual({
      ok: false,
      statusMessage: "missing failed: Unknown workflow",
      result: null,
    });
  });
});
