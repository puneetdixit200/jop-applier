import { describe, expect, it } from "vitest";
import { createUnsubscribeToken, handleUnsubscribeToken } from "./unsubscribe-handler.js";

describe("unsubscribe handler", () => {
  it("decodes signed contact tokens, records opt-out, and cancels pending emails", async () => {
    const calls: string[] = [];
    const token = createUnsubscribeToken("Priya@Setu.co");

    await expect(
      handleUnsubscribeToken(
        {
          recordEmailOptOut: async (email, optedOutAt, reason) => {
            calls.push(`optout:${email}:${optedOutAt}:${reason}`);
          },
          cancelPendingEmails: async (email) => {
            calls.push(`cancel:${email}`);
          },
        },
        token,
        new Date("2026-05-24T04:30:00.000Z"),
      ),
    ).resolves.toEqual({ email: "priya@setu.co", optedOut: true });

    expect(calls).toEqual([
      "optout:priya@setu.co:2026-05-24T04:30:00.000Z:unsubscribe_link",
      "cancel:priya@setu.co",
    ]);
  });
});
