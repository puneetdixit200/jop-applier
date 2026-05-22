export type OutreachSequenceStep = {
  step: 1 | 2 | 3;
  delayDays: number;
  kind: "initial" | "follow_up" | "final_follow_up";
  status: "pending" | "queued" | "sent" | "cancelled";
};

export type DueSequenceInput = {
  firstSentAt: string | null;
  now: Date;
  hasReply: boolean;
  completedSteps: Set<number>;
};

export function buildDefaultOutreachSequence(): OutreachSequenceStep[] {
  return [
    { step: 1, delayDays: 0, kind: "initial", status: "pending" },
    { step: 2, delayDays: 3, kind: "follow_up", status: "pending" },
    { step: 3, delayDays: 7, kind: "final_follow_up", status: "pending" },
  ];
}

export function dueSequenceSteps(
  sequence: OutreachSequenceStep[],
  input: DueSequenceInput,
): OutreachSequenceStep[] {
  if (input.hasReply || !input.firstSentAt) {
    return [];
  }
  const firstSentAt = new Date(input.firstSentAt);
  if (!Number.isFinite(firstSentAt.getTime())) {
    return [];
  }
  return sequence.filter((step) => {
    if (step.step === 1 || input.completedSteps.has(step.step)) {
      return false;
    }
    return input.now.getTime() - firstSentAt.getTime() >= step.delayDays * 24 * 60 * 60 * 1000;
  });
}
