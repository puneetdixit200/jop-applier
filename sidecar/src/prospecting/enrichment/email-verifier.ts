import type { EmailVerificationResult } from "./enrichment-engine.js";

export type EmailVerifierDependencies = {
  hasMxRecord?: (domain: string) => Promise<boolean>;
  smtpProbe?: (email: string) => Promise<EmailVerificationResult["status"]>;
};

export type DetailedEmailVerificationResult = EmailVerificationResult & {
  checks: string[];
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function verifyEmailAddress(
  email: string,
  dependencies: EmailVerifierDependencies = {},
): Promise<DetailedEmailVerificationResult> {
  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized)) {
    return { status: "invalid", confidenceMultiplier: 0, checks: ["format"] };
  }
  const domain = normalized.split("@")[1];
  const checks = ["format"];
  const hasMx = dependencies.hasMxRecord ? await dependencies.hasMxRecord(domain) : true;
  checks.push("mx");
  if (!hasMx) {
    return { status: "invalid", confidenceMultiplier: 0, checks };
  }

  const smtpStatus = dependencies.smtpProbe ? await dependencies.smtpProbe(normalized) : "unknown";
  checks.push("smtp");
  return {
    status: smtpStatus,
    confidenceMultiplier: smtpStatus === "valid" ? 1 : smtpStatus === "catch_all" ? 0.75 : 0.55,
    checks,
  };
}
