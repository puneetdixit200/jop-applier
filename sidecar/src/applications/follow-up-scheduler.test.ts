import { describe, expect, it } from "vitest";
import {
  dueFollowUpApplications,
  scheduleNextFollowUp,
  type FollowUpApplication,
} from "./follow-up-scheduler.js";

const baseApplication: FollowUpApplication = {
  id: "app-1",
  jobId: "job-1",
  companyName: "Northstar Labs",
  status: "submitted",
  submittedAt: "2026-05-20T10:00:00Z",
  nextFollowUp: null,
  lastFollowUp: null,
  followUpCount: 0,
  responseDate: null,
  responseType: null,
};

const scheduleOptions = {
  now: new Date("2026-05-27T09:00:00Z"),
  followUpDelaysDays: [3, 7, 14],
  maxFollowUps: 3,
};

describe("follow-up scheduler", () => {
  it("finds due submitted applications and skips responses, terminal states, and max follow-ups", () => {
    const due = dueFollowUpApplications(
      [
        { ...baseApplication, id: "due-explicit", nextFollowUp: "2026-05-27T08:00:00Z" },
        { ...baseApplication, id: "due-by-submission-age", submittedAt: "2026-05-23T08:00:00Z" },
        { ...baseApplication, id: "future", nextFollowUp: "2026-05-28T09:00:00Z" },
        {
          ...baseApplication,
          id: "has-response",
          responseDate: "2026-05-26T11:00:00Z",
          responseType: "positive",
        },
        { ...baseApplication, id: "too-many", nextFollowUp: "2026-05-27T08:00:00Z", followUpCount: 3 },
        { ...baseApplication, id: "failed", status: "failed", nextFollowUp: "2026-05-27T08:00:00Z" },
      ],
      scheduleOptions,
    );

    expect(due.map((application) => application.id)).toEqual(["due-explicit", "due-by-submission-age"]);
  });

  it("schedules the next follow-up delay and marks the final follow-up as ghosted", () => {
    const first = scheduleNextFollowUp({ ...baseApplication, followUpCount: 0 }, scheduleOptions);

    expect(first).toEqual({
      status: "follow_up_sent",
      followUpCount: 1,
      lastFollowUp: "2026-05-27T09:00:00.000Z",
      nextFollowUp: "2026-06-03T09:00:00.000Z",
    });

    const final = scheduleNextFollowUp({ ...baseApplication, followUpCount: 2 }, scheduleOptions);

    expect(final).toEqual({
      status: "ghosted",
      followUpCount: 3,
      lastFollowUp: "2026-05-27T09:00:00.000Z",
      nextFollowUp: null,
    });
  });
});
