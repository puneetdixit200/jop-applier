import type { Application, UpsertApplication } from "./tauri-api";

export type ApplicationEditDraft = {
  notes: string;
  tagsText: string;
};

export function applicationEditDraft(application: Application): ApplicationEditDraft {
  return {
    notes: application.notes ?? "",
    tagsText: application.tags.join(", "),
  };
}

export function applicationEditToUpsert(
  application: Application,
  draft: ApplicationEditDraft,
): UpsertApplication {
  return {
    job_id: application.job_id,
    status: application.status,
    mode: application.mode,
    resume_path: application.resume_path,
    cover_letter_path: application.cover_letter_path,
    last_follow_up: application.last_follow_up,
    follow_up_count: application.follow_up_count,
    next_follow_up: application.next_follow_up,
    response_date: application.response_date,
    response_type: application.response_type,
    response_notes: application.response_notes,
    submission_url: application.submission_url,
    confirmation_id: application.confirmation_id,
    error_message: application.error_message,
    notes: nullableText(draft.notes),
    tags: parseApplicationTags(draft.tagsText),
  };
}

export function parseApplicationTags(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) {
        return false;
      }
      const normalized = item.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
