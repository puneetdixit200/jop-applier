import type { DiscoverySettings } from "./discovery-settings";
import { isEmailSettingsConfigured, type EmailSettings } from "./email-settings";

export type OnboardingProfile = {
  fullName: string;
  email: string;
  skills: string;
  targetRoles: string;
};

export type OnboardingSettings = {
  provider: string;
  maxDailyApplications: number;
  discovery: DiscoverySettings;
  email: EmailSettings;
};

export type OnboardingStepId = "profile" | "discovery" | "ai" | "limits" | "email";

export type OnboardingStep = {
  id: OnboardingStepId;
  label: string;
  complete: boolean;
  optional?: boolean;
  target: "profile" | "settings";
};

export type OnboardingStatus = {
  steps: OnboardingStep[];
  completedRequired: number;
  requiredTotal: number;
  percent: number;
  isComplete: boolean;
};

export function buildOnboardingStatus(
  profile: OnboardingProfile,
  settings: OnboardingSettings,
): OnboardingStatus {
  const steps: OnboardingStep[] = [
    {
      id: "profile",
      label: "Profile",
      complete: hasText(profile.fullName) && hasText(profile.email) && hasText(profile.skills),
      target: "profile",
    },
    {
      id: "discovery",
      label: "Discovery",
      complete: hasText(settings.discovery.searchKeywords) && hasDiscoverySource(settings.discovery),
      target: "settings",
    },
    {
      id: "ai",
      label: "AI provider",
      complete: hasText(settings.provider),
      target: "settings",
    },
    {
      id: "limits",
      label: "Review limits",
      complete: Number.isFinite(settings.maxDailyApplications) && settings.maxDailyApplications > 0,
      target: "settings",
    },
    {
      id: "email",
      label: "Email follow-up",
      complete: isEmailSettingsConfigured(settings.email),
      optional: true,
      target: "settings",
    },
  ];
  const requiredSteps = steps.filter((step) => !step.optional);
  const completedRequired = requiredSteps.filter((step) => step.complete).length;
  const requiredTotal = requiredSteps.length;

  return {
    steps,
    completedRequired,
    requiredTotal,
    percent: requiredTotal === 0 ? 100 : Math.round((completedRequired / requiredTotal) * 100),
    isComplete: completedRequired === requiredTotal,
  };
}

function hasDiscoverySource(settings: DiscoverySettings): boolean {
  return (
    settings.portalLinkedIn ||
    settings.portalIndeed ||
    settings.portalInternshala ||
    settings.portalNaukri ||
    settings.portalWellfound ||
    settings.portalGlassdoor ||
    hasText(settings.feedSourceUrl) ||
    hasText(settings.greenhouseBoardToken) ||
    hasText(settings.leverCompany) ||
    (hasText(settings.workdayTenant) && hasText(settings.workdaySite)) ||
    hasText(settings.bambooHrSubdomain) ||
    hasText(settings.icimsSearchUrl) ||
    hasText(settings.careerPageUrl)
  );
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}
