import { describe, expect, it } from "vitest";
import {
  applicationEditDraft,
  applicationEditToUpsert,
  parseApplicationTags,
} from "./application-editor";
import type { Application } from "./tauri-api";

describe("application editor", () => {
  it("builds an editable notes and tags draft from an application", () => {
    expect(
      applicationEditDraft(
        application({
          notes: "Ask about remote internship stipend.",
          tags: ["priority", "frontend"],
        }),
      ),
    ).toEqual({
      notes: "Ask about remote internship stipend.",
      tagsText: "priority, frontend",
    });
  });

  it("converts edited notes and tags into a full upsert payload without dropping workflow fields", () => {
    const source = application({
      job_id: "job-42",
      status: "applied",
      mode: "semi-auto",
      resume_path: "/docs/resume.pdf",
      cover_letter_path: "/docs/cover.pdf",
      last_follow_up: "2026-05-21T08:00:00Z",
      follow_up_count: 2,
      next_follow_up: "2026-05-28T08:00:00Z",
      response_date: "2026-05-22T12:00:00Z",
      response_type: "positive",
      response_notes: "Recruiter asked for availability.",
      submission_url: "https://ats.example/applications/42",
      confirmation_id: "CONF-42",
      error_message: "Previous retry timed out",
      notes: "old note",
      tags: ["old"],
    });

    expect(
      applicationEditToUpsert(source, {
        notes: "  Updated notes  ",
        tagsText: "Priority, remote\npriority, frontend, remote",
      }),
    ).toEqual({
      job_id: "job-42",
      status: "applied",
      mode: "semi-auto",
      resume_path: "/docs/resume.pdf",
      cover_letter_path: "/docs/cover.pdf",
      last_follow_up: "2026-05-21T08:00:00Z",
      follow_up_count: 2,
      next_follow_up: "2026-05-28T08:00:00Z",
      response_date: "2026-05-22T12:00:00Z",
      response_type: "positive",
      response_notes: "Recruiter asked for availability.",
      submission_url: "https://ats.example/applications/42",
      confirmation_id: "CONF-42",
      error_message: "Previous retry timed out",
      notes: "Updated notes",
      tags: ["Priority", "remote", "frontend"],
    });
  });

  it("normalizes blank notes and comma separated tags", () => {
    expect(parseApplicationTags(" urgent, , Remote, urgent , internship ")).toEqual([
      "urgent",
      "Remote",
      "internship",
    ]);
    expect(
      applicationEditToUpsert(application(), {
        notes: "   ",
        tagsText: "  ",
      }).notes,
    ).toBeNull();
  });
});

function application(overrides: Partial<Application> = {}): Application {
  return {
    id: "application",
    job_id: "job",
    job_title: "Frontend Engineer",
    company_name: "Northstar Labs",
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
