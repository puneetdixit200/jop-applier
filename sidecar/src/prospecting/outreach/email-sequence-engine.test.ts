import { describe, expect, it } from "vitest";
import { buildDefaultOutreachSequence, dueSequenceSteps } from "./email-sequence-engine.js";

describe("email sequence engine", () => {
  it("builds the three-step funded-company drip sequence", () => {
    expect(buildDefaultOutreachSequence()).toEqual([
      { step: 1, delayDays: 0, kind: "initial", status: "pending" },
      { step: 2, delayDays: 3, kind: "follow_up", status: "pending" },
      { step: 3, delayDays: 7, kind: "final_follow_up", status: "pending" },
    ]);
  });

  it("returns only due unsent follow-up steps and stops after replies", () => {
    const sequence = buildDefaultOutreachSequence();

    expect(
      dueSequenceSteps(sequence, {
        firstSentAt: "2026-05-01T10:00:00.000Z",
        now: new Date("2026-05-05T10:00:00.000Z"),
        hasReply: false,
        completedSteps: new Set([1]),
      }),
    ).toEqual([sequence[1]]);

    expect(
      dueSequenceSteps(sequence, {
        firstSentAt: "2026-05-01T10:00:00.000Z",
        now: new Date("2026-05-09T10:00:00.000Z"),
        hasReply: true,
        completedSteps: new Set([1, 2]),
      }),
    ).toEqual([]);
  });
});
