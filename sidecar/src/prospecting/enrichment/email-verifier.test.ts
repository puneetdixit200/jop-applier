import { describe, expect, it } from "vitest";
import { verifyEmailAddress } from "./email-verifier.js";

describe("email verifier", () => {
  it("rejects malformed emails before DNS or SMTP checks", async () => {
    await expect(verifyEmailAddress("not an email")).resolves.toEqual({
      status: "invalid",
      confidenceMultiplier: 0,
      checks: ["format"],
    });
  });

  it("runs format, MX, and SMTP checks for valid addresses", async () => {
    const checked: string[] = [];
    await expect(
      verifyEmailAddress("priya@setu.co", {
        hasMxRecord: async (domain) => {
          checked.push(`mx:${domain}`);
          return true;
        },
        smtpProbe: async (email) => {
          checked.push(`smtp:${email}`);
          return "catch_all";
        },
      }),
    ).resolves.toEqual({
      status: "catch_all",
      confidenceMultiplier: 0.75,
      checks: ["format", "mx", "smtp"],
    });
    expect(checked).toEqual(["mx:setu.co", "smtp:priya@setu.co"]);
  });
});
