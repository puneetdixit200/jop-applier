export type CaptchaProvider = "recaptcha" | "hcaptcha" | "turnstile" | "generic";

export type CaptchaChallenge = {
  detected: boolean;
  provider: CaptchaProvider | null;
  message: string;
};

export type CaptchaDetectionPage = {
  url: () => string;
  textContent?: (selector: string) => Promise<string | null>;
};

export class CaptchaChallengeError extends Error {
  constructor(readonly challenge: CaptchaChallenge) {
    super(challenge.message);
    this.name = "CaptchaChallengeError";
  }
}

export async function detectCaptchaChallenge(
  page: CaptchaDetectionPage,
): Promise<CaptchaChallenge> {
  const bodyText = (await page.textContent?.("body")) ?? "";
  const haystack = `${page.url()} ${bodyText}`.toLowerCase();
  const provider = captchaProvider(haystack);

  if (!provider) {
    return {
      detected: false,
      provider: null,
      message: "no captcha challenge detected",
    };
  }

  return {
    detected: true,
    provider,
    message: `${provider} captcha challenge detected`,
  };
}

export async function assertNoCaptchaChallenge(page: CaptchaDetectionPage): Promise<void> {
  const challenge = await detectCaptchaChallenge(page);
  if (challenge.detected) {
    throw new CaptchaChallengeError(challenge);
  }
}

function captchaProvider(haystack: string): CaptchaProvider | null {
  if (haystack.includes("g-recaptcha") || haystack.includes("recaptcha")) {
    return "recaptcha";
  }
  if (haystack.includes("hcaptcha") || haystack.includes("h-captcha")) {
    return "hcaptcha";
  }
  if (haystack.includes("cf-turnstile") || haystack.includes("turnstile")) {
    return "turnstile";
  }
  if (
    /\bcaptcha\b/.test(haystack) ||
    haystack.includes("checking your browser") ||
    haystack.includes("verify you are human")
  ) {
    return "generic";
  }

  return null;
}
