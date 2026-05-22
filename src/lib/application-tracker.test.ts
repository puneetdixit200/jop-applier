import { describe, expect, it } from "vitest";
import {
  buildApplicationTracker,
  statusLabelForApplication,
} from "./application-tracker";
import type { Application } from "./tauri-api";

describe("application tracker", () => {
  it("groups persisted applications into tracker columns and flags due follow-ups", () => {
    const tracker = buildApplicationTracker(
      [
        application({
          id: "queued",
          company_name: "Mosaic AI",
          job_title: "Product Intern",
          status: "queued",
          resume_path: null,
          cover_letter_path: null,
        }),
        application({
          id: "follow-up",
          company_name: "Northstar Labs",
          job_title: "Frontend Engineer Intern",
          status: "applied",
          next_follow_up: "2026-05-21T08:00:00Z",
          resume_path: "/docs/northstar-resume.pdf",
          cover_letter_path: "/docs/northstar-cover.pdf",
          tags: ["priority"],
        }),
        application({
          id: "interview",
          company_name: "Helio Systems",
          job_title: "Rust Desktop Engineer",
          status: "interviewScheduled",
          next_follow_up: "2026-05-25T08:00:00Z",
        }),
      ],
      new Date("2026-05-22T00:00:00Z"),
    );

    expect(tracker.metrics).toEqual({
      total: 3,
      active: 3,
      queued: 1,
      followUpsDue: 1,
    });
    expect(tracker.rows.map((row) => row.id)).toEqual(["follow-up", "queued", "interview"]);
    expect(tracker.rows[0]).toMatchObject({
      company: "Northstar Labs",
      role: "Frontend Engineer Intern",
      statusLabel: "Applied",
      nextAction: "Follow up due",
      documentLabel: "Resume and cover ready",
      tags: ["priority"],
    });
    expect(tracker.rows[1]).toMatchObject({
      statusLabel: "Queued",
      nextAction: "Review match",
      documentLabel: "Documents needed",
    });
    expect(tracker.columns.map((column) => [column.id, column.count])).toEqual([
      ["queued", 1],
      ["applying", 0],
      ["applied", 1],
      ["response", 1],
      ["closed", 0],
    ]);
  });

  it("normalizes architecture status labels", () => {
    expect(statusLabelForApplication("review_pending")).toBe("Review Pending");
    expect(statusLabelForApplication("submitting")).toBe("Submitting");
    expect(statusLabelForApplication("submitted")).toBe("Submitted");
    expect(statusLabelForApplication("cancelled")).toBe("Cancelled");
    expect(statusLabelForApplication("permanently_failed")).toBe("Permanently Failed");
    expect(statusLabelForApplication("responseReceived")).toBe("Response Received");
    expect(statusLabelForApplication("followUpSent")).toBe("Follow Up Sent");
    expect(statusLabelForApplication("interviewScheduled")).toBe("Interview Scheduled");
  });

  it("surfaces semi-auto review actions for review-pending applications", () => {
    const tracker = buildApplicationTracker([
      application({
        id: "review",
        status: "review_pending",
        submission_url: "https://ats.example/review",
        resume_path: "/docs/resume.pdf",
        cover_letter_path: "/docs/cover.pdf",
      }),
      application({
        id: "submitted",
        status: "submitted",
        submitted_at: "2026-05-21T10:00:00Z",
      }),
      application({
        id: "cancelled",
        status: "cancelled",
      }),
      application({
        id: "permanent",
        status: "permanently_failed",
      }),
    ]);

    expect(tracker.columns.map((column) => [column.id, column.count])).toEqual([
      ["queued", 0],
      ["applying", 1],
      ["applied", 1],
      ["response", 0],
      ["closed", 2],
    ]);
    expect(tracker.rows[0]).toMatchObject({
      id: "review",
      statusLabel: "Review Pending",
      nextAction: "Review before submit",
      reviewActions: [
        { id: "approve_review", label: "Approve Submit", nextStatus: "submitting" },
        { id: "cancel_review", label: "Cancel", nextStatus: "cancelled" },
      ],
    });
  });
});

function application(overrides: Partial<Application>): Application {
  return {
    id: "application",
    job_id: "job",
    job_title: "Frontend Engineer",
    company_name: "Company",
    status: "queued",
    mode: "semi-auto",
    resume_path: null,
    cover_letter_path: null,
    last_follow_up: null,
    follow_up_count: 0,
    next_follow_up: null,
    response_date: null,
    response_type: null,
    response_notes: null,
    submitted_at: null,
    submission_url: null,
    confirmation_id: null,
    error_message: null,
    retry_count: 0,
    max_retries: 3,
    notes: null,
    tags: [],
    ...overrides,
  };
}
