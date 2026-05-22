import type { UpsertContact } from "./tauri-api";

export type ContactEditorDraft = {
  name: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  role: string;
  notes: string;
};

export function emptyContactDraft(): ContactEditorDraft {
  return {
    name: "",
    email: "",
    phone: "",
    linkedinUrl: "",
    role: "recruiter",
    notes: "",
  };
}

export function isContactDraftSaveable(draft: ContactEditorDraft) {
  return draft.name.trim().length > 0;
}

export function contactDraftToUpsert(draft: ContactEditorDraft): UpsertContact {
  return {
    company_id: null,
    name: draft.name.trim(),
    email: nullableText(draft.email),
    phone: nullableText(draft.phone),
    linkedin_url: nullableText(draft.linkedinUrl),
    role: nullableText(draft.role),
    notes: nullableText(draft.notes),
  };
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
