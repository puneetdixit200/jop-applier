import { describe, expect, it } from "vitest";
import {
  buildApplicationActivity,
  type ApplicationActivitySources,
} from "./application-activity";
import type { ApplicationEvent, Communication, Document } from "./tauri-api";

describe("application activity", () => {
  it("builds a deduplicated timeline with document history and communication log", () => {
    const activity = buildApplicationActivity({
      events: [
        event({
          id: "status-event",
          event_type: "status_change",
          old_value: "queued",
          new_value: "applied",
          description: "Application status changed from queued to applied",
          created_at: "2026-05-21T10:00:00Z",
        }),
        event({
          id: "document-event",
          event_type: "document_generated",
          new_value: "resume-v1.pdf",
          description: "Generated resume document resume-v1.pdf",
          metadata: { document_id: "resume-doc", document_type: "resume" },
          created_at: "2026-05-21T12:00:00Z",
        }),
        event({
          id: "email-event",
          event_type: "email_sent",
          new_value: "Checking in",
          description: "Sent follow_up communication: Checking in",
          metadata: { communication_id: "sent-comm", communication_type: "follow_up" },
          created_at: "2026-05-21T13:00:00Z",
        }),
      ],
      documents: [
        document({
          id: "resume-doc",
          type: "resume",
          file_name: "resume-v1.pdf",
          version: 1,
          ai_model_used: "gpt-4.1",
          created_at: "2026-05-21T12:00:00Z",
        }),
        document({
          id: "cover-doc",
          type: "cover_letter",
          file_name: "cover-letter-v1.pdf",
          version: 1,
          created_at: "2026-05-21T15:00:00Z",
        }),
      ],
      communications: [
        communication({
          id: "sent-comm",
          direction: "sent",
          type: "follow_up",
          subject: "Checking in",
          sent_at: "2026-05-21T13:00:00Z",
        }),
        communication({
          id: "received-comm",
          direction: "received",
          type: "response",
          subject: "Re: Checking in",
          body: "Can you interview tomorrow?",
          sent_at: "2026-05-21T14:30:00Z",
        }),
      ],
    });

    expect(activity.summary).toEqual({
      timelineCount: 5,
      eventCount: 3,
      documentCount: 2,
      communicationCount: 2,
    });
    expect(activity.timeline.map((item) => [item.id, item.kind, item.label])).toEqual([
      ["document-cover-doc", "document", "Cover Letter v1"],
      ["communication-received-comm", "communication", "Received Response"],
      ["event-email-event", "event", "Email Sent"],
      ["event-document-event", "event", "Document Generated"],
      ["event-status-event", "event", "Status Change"],
    ]);
    expect(activity.timeline[0]).toMatchObject({
      detail: "cover-letter-v1.pdf",
      timestampLabel: "May 21 15:00 UTC",
    });
    expect(activity.timeline[1]).toMatchObject({
      detail: "Re: Checking in",
      timestampLabel: "May 21 14:30 UTC",
    });
    expect(activity.documents.map((item) => [item.id, item.label, item.detail])).toEqual([
      ["cover-doc", "Cover Letter v1", "cover-letter-v1.pdf"],
      ["resume-doc", "Resume v1", "resume-v1.pdf · gpt-4.1"],
    ]);
    expect(activity.communications.map((item) => [item.id, item.label, item.detail])).toEqual([
      ["received-comm", "Received Response", "Re: Checking in"],
      ["sent-comm", "Sent Follow Up", "Checking in"],
    ]);
  });

  it("returns an empty activity model for applications with no records yet", () => {
    expect(buildApplicationActivity(emptySources())).toEqual({
      summary: {
        timelineCount: 0,
        eventCount: 0,
        documentCount: 0,
        communicationCount: 0,
      },
      timeline: [],
      documents: [],
      communications: [],
    });
  });
});

function emptySources(): ApplicationActivitySources {
  return {
    events: [],
    documents: [],
    communications: [],
  };
}

function event(overrides: Partial<ApplicationEvent>): ApplicationEvent {
  return {
    id: "event",
    application_id: "application",
    event_type: "status_change",
    old_value: null,
    new_value: null,
    description: null,
    metadata: {},
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function document(overrides: Partial<Document>): Document {
  return {
    id: "document",
    application_id: "application",
    type: "resume",
    file_path: "/tmp/resume.pdf",
    file_name: "resume.pdf",
    version: 1,
    ai_model_used: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}

function communication(overrides: Partial<Communication>): Communication {
  return {
    id: "communication",
    application_id: "application",
    contact_id: null,
    direction: "sent",
    type: "follow_up",
    subject: null,
    body: null,
    email_id: null,
    sent_at: null,
    read_at: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}
