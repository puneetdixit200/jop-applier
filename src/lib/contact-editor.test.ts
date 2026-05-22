import { describe, expect, it } from "vitest";
import {
  contactDraftToUpsert,
  emptyContactDraft,
  isContactDraftSaveable,
} from "./contact-editor";

describe("contact editor", () => {
  it("creates an empty recruiter draft with save disabled until a name exists", () => {
    expect(emptyContactDraft()).toEqual({
      name: "",
      email: "",
      phone: "",
      linkedinUrl: "",
      role: "recruiter",
      notes: "",
    });
    expect(isContactDraftSaveable(emptyContactDraft())).toBe(false);
    expect(isContactDraftSaveable({ ...emptyContactDraft(), name: " Mira " })).toBe(true);
  });

  it("serializes edited contact fields into a trimmed upsert payload", () => {
    expect(
      contactDraftToUpsert({
        name: " Mira Patel ",
        email: " mira@northstar.example ",
        phone: " ",
        linkedinUrl: " https://linkedin.example/in/mira ",
        role: "hiring_manager",
        notes: " Owns frontend hiring ",
      }),
    ).toEqual({
      company_id: null,
      name: "Mira Patel",
      email: "mira@northstar.example",
      phone: null,
      linkedin_url: "https://linkedin.example/in/mira",
      role: "hiring_manager",
      notes: "Owns frontend hiring",
    });
  });
});
