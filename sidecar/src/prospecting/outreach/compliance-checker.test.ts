import { describe, expect, it } from "vitest";
import { evaluateOutreachCompliance } from "./compliance-checker.js";

describe("outreach compliance checker", () => {
  it("allows verified B2B outreach inside the sending window when limits are clear", () => {
    expect(
      evaluateOutreachCompliance({
        now: new Date("2026-05-23T05:00:00.000Z"),
        recipientTimezoneOffsetMinutes: 330,
        email: "priya@setu.co",
        companyId: "setu",
        dailySentCount: 12,
        companyContactedCount: 1,
        recentContactedAt: null,
        bounceCountLast7Days: 0,
        optedOutEmails: new Set(),
      }),
    ).toEqual({ allowed: true, reasons: [] });
  });

  it("blocks opt-outs, duplicate recontact, hard daily caps, company caps, bounces, and non-business hours", () => {
    const result = evaluateOutreachCompliance({
      now: new Date("2026-05-23T02:00:00.000Z"),
      recipientTimezoneOffsetMinutes: 330,
      email: "founder@setu.co",
      companyId: "setu",
      dailySentCount: 50,
      companyContactedCount: 5,
      recentContactedAt: "2026-05-01T00:00:00.000Z",
      bounceCountLast7Days: 3,
      optedOutEmails: new Set(["founder@setu.co"]),
    });

    expect(result.allowed).toBe(false);
    expect(result.reasons).toEqual([
      "email_opted_out",
      "daily_hard_cap_reached",
      "company_contact_cap_reached",
      "recently_contacted",
      "bounce_threshold_reached",
      "outside_sending_window",
    ]);
  });
});
