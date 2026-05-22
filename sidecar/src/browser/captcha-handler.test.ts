import { describe, expect, it } from "vitest";
import {
  CaptchaChallengeError,
  assertNoCaptchaChallenge,
  detectCaptchaChallenge,
} from "./captcha-handler.js";

describe("captcha handler", () => {
  it("detects common captcha challenge providers from URL and page text", async () => {
    await expect(
      detectCaptchaChallenge({
        url: () => "https://jobs.example/apply?captcha=1",
        textContent: async () => "Please complete the reCAPTCHA to continue",
      }),
    ).resolves.toEqual({
      detected: true,
      provider: "recaptcha",
      message: "recaptcha captcha challenge detected",
    });
    await expect(
      detectCaptchaChallenge({
        url: () => "https://jobs.example/apply",
        textContent: async () => "Verify you are human",
      }),
    ).resolves.toEqual({
      detected: true,
      provider: "generic",
      message: "generic captcha challenge detected",
    });
  });

  it("raises a typed error when a challenge is present", async () => {
    await expect(
      assertNoCaptchaChallenge({
        url: () => "https://jobs.example/apply",
        textContent: async () => "hCaptcha",
      }),
    ).rejects.toBeInstanceOf(CaptchaChallengeError);
  });
});
