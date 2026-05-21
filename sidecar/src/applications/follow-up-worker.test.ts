import { describe, expect, it } from "vitest";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import type { FollowUpApplication, FollowUpUpdate } from "./follow-up-scheduler.js";
import { runFollowUpWorker } from "./follow-up-worker.js";

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

describe("follow-up worker", () => {
  it("processes due follow-ups through the sender, persistence update, and event bus", async () => {
    const bus = new EventBus<CareerEventMap>();
    const sent: string[] = [];
    const updates: Array<{ applicationId: string; update: FollowUpUpdate }> = [];
    const events: string[] = [];

    bus.on("follow_up.sent", (event) => {
      events.push(`${event.applicationId}:${event.status}:${event.followUpCount}:${event.communicationId}`);
    });

    const result = await runFollowUpWorker(
      {
        listApplications: async () => [
          { ...baseApplication, id: "due-first", nextFollowUp: "2026-05-27T08:00:00Z" },
          { ...baseApplication, id: "due-final", nextFollowUp: "2026-05-27T08:00:00Z", followUpCount: 2 },
          { ...baseApplication, id: "future", nextFollowUp: "2026-05-28T09:00:00Z" },
          { ...baseApplication, id: "has-response", responseDate: "2026-05-26T11:00:00Z" },
        ],
        sendFollowUp: async (application) => {
          sent.push(application.id);
          return { communicationId: `comm-${application.id}` };
        },
        updateApplicationFollowUp: async (applicationId, update) => {
          updates.push({ applicationId, update });
        },
      },
      {
        now: new Date("2026-05-27T09:00:00Z"),
        followUpDelaysDays: [3, 7, 14],
        maxFollowUps: 3,
        eventBus: bus,
      },
    );

    expect(result).toEqual({
      scanned: 4,
      due: 2,
      sent: 2,
      failed: 0,
      ghosted: 1,
    });
    expect(sent).toEqual(["due-first", "due-final"]);
    expect(updates).toEqual([
      {
        applicationId: "due-first",
        update: {
          status: "follow_up_sent",
          followUpCount: 1,
          lastFollowUp: "2026-05-27T09:00:00.000Z",
          nextFollowUp: "2026-06-03T09:00:00.000Z",
        },
      },
      {
        applicationId: "due-final",
        update: {
          status: "ghosted",
          followUpCount: 3,
          lastFollowUp: "2026-05-27T09:00:00.000Z",
          nextFollowUp: null,
        },
      },
    ]);
    expect(events).toEqual([
      "due-first:follow_up_sent:1:comm-due-first",
      "due-final:ghosted:3:comm-due-final",
    ]);
  });
});
