import { describe, expect, it } from "vitest";
import { defaultDiscoverySettings } from "./discovery-settings";
import { defaultEmailSettings } from "./email-settings";
import { buildOnboardingStatus } from "./onboarding";

describe("onboarding status", () => {
  it("marks required setup complete when profile, discovery, provider, and limits are configured", () => {
    const status = buildOnboardingStatus(
      {
        fullName: "Deepak Kudi",
        email: "deepak@example.com",
        skills: "React, TypeScript",
        targetRoles: "Frontend Engineer",
      },
      {
        provider: "ollama",
        maxDailyApplications: 10,
        discovery: {
          ...defaultDiscoverySettings,
          portalLinkedIn: true,
        },
        email: defaultEmailSettings,
      },
    );

    expect(status).toMatchObject({
      completedRequired: 4,
      requiredTotal: 4,
      percent: 100,
      isComplete: true,
    });
    expect(status.steps.find((step) => step.id === "email")).toMatchObject({
      complete: false,
      optional: true,
    });
  });

  it("keeps onboarding open when profile and discovery sources are missing", () => {
    const status = buildOnboardingStatus(
      {
        fullName: "Deepak Kudi",
        email: "",
        skills: "",
        targetRoles: "",
      },
      {
        provider: "ollama",
        maxDailyApplications: 10,
        discovery: defaultDiscoverySettings,
        email: defaultEmailSettings,
      },
    );

    expect(status).toMatchObject({
      completedRequired: 2,
      requiredTotal: 4,
      percent: 50,
      isComplete: false,
    });
    expect(status.steps.filter((step) => !step.complete).map((step) => step.id)).toEqual([
      "profile",
      "discovery",
      "email",
    ]);
  });
});
