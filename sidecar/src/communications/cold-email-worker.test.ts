import { describe, expect, it } from "vitest";
import type { ProfileForContent, CompanyForEmail } from "../ai/provider-interface.js";
import { EventBus } from "../orchestrator/event-bus.js";
import type { CareerEventMap } from "../orchestrator/events.js";
import { runColdEmailWorker, type ColdEmailCommunication } from "./cold-email-worker.js";

const profile: ProfileForContent = {
  fullName: "Asha Rao",
  headline: "React and Tauri engineer",
  skills: ["React", "Rust", "Tauri"],
};

describe("cold email worker", () => {
  it("generates cold outreach, saves sent communications, and emits sent events", async () => {
    const bus = new EventBus<CareerEventMap>();
    const generatedFor: CompanyForEmail[] = [];
    const saved: ColdEmailCommunication[] = [];
    const events: Array<CareerEventMap["cold_email.sent"]> = [];

    bus.on("cold_email.sent", (event) => events.push(event));

    const result = await runColdEmailWorker(
      {
        loadProfile: async () => profile,
        listTargets: async () => [
          {
            applicationId: "app-1",
            jobId: "job-1",
            companyName: "Northstar Labs",
            companyDomain: "northstar.example",
            companyIndustry: "developer tools",
            contactId: "contact-1",
            contactName: "Mira",
            role: "recruiter",
            context: "Hiring desktop automation engineers",
          },
          {
            applicationId: "app-2",
            jobId: "job-2",
            companyName: "Orbit Works",
            contactId: null,
            contactName: null,
            role: null,
            context: null,
          },
        ],
        generateColdEmail: async (_profile, company) => {
          generatedFor.push(company);
          return `Subject: ${company.name} workflow automation intro\n\nHi ${company.contactName ?? "team"},\n\nI build local-first workflow tools.`;
        },
        saveCommunication: async (communication) => {
          saved.push(communication);
          return { communicationId: `comm-${saved.length}` };
        },
      },
      {
        now: new Date("2026-05-28T10:00:00Z"),
        maxEmails: 1,
        eventBus: bus,
      },
    );

    expect(result).toEqual({
      scanned: 2,
      generated: 1,
      sent: 1,
      failed: 0,
      skipped: 1,
      coldEmails: [
        {
          applicationId: "app-1",
          jobId: "job-1",
          companyName: "Northstar Labs",
          contactId: "contact-1",
          contactName: "Mira",
          communicationId: "comm-1",
          subject: "Northstar Labs workflow automation intro",
          body: "Hi Mira,\n\nI build local-first workflow tools.",
          sentAt: "2026-05-28T10:00:00.000Z",
        },
      ],
    });
    expect(generatedFor).toEqual([
      {
        name: "Northstar Labs",
        contactName: "Mira",
        domain: "northstar.example",
        industry: "developer tools",
        context: "Hiring desktop automation engineers",
      },
    ]);
    expect(saved).toEqual([
      {
        applicationId: "app-1",
        contactId: "contact-1",
        direction: "sent",
        type: "cold_email",
        subject: "Northstar Labs workflow automation intro",
        body: "Hi Mira,\n\nI build local-first workflow tools.",
        emailId: null,
        sentAt: "2026-05-28T10:00:00.000Z",
        readAt: null,
      },
    ]);
    expect(events).toEqual([
      {
        applicationId: "app-1",
        jobId: "job-1",
        companyName: "Northstar Labs",
        contactId: "contact-1",
        contactName: "Mira",
        communicationId: "comm-1",
        subject: "Northstar Labs workflow automation intro",
        sentAt: new Date("2026-05-28T10:00:00Z"),
      },
    ]);
  });
});
