import { describe, expect, it } from "vitest";
import { buildContactCrm, roleLabelForContact } from "./contact-crm";
import type { Contact } from "./tauri-api";

describe("contact CRM", () => {
  it("summarizes persisted recruiting contacts by role and reachability", () => {
    const crm = buildContactCrm([
      contact({
        id: "recruiter",
        name: "Priya Sharma",
        email: "priya@example.com",
        linkedin_url: "https://linkedin.example/in/priya",
        role: "recruiter",
        notes: "Handles frontend internship hiring",
      }),
      contact({
        id: "manager",
        name: "Arjun Mehta",
        phone: "+91-555-0101",
        role: "hiring_manager",
      }),
      contact({
        id: "referral",
        name: "Nisha Rao",
        role: "referral",
        notes: "Alumni referral",
      }),
    ]);

    expect(crm.summary).toEqual({
      total: 3,
      reachable: 2,
      recruiters: 1,
      hiringManagers: 1,
      referrals: 1,
    });
    expect(crm.rows.map((row) => [row.id, row.name, row.roleLabel, row.primaryChannel])).toEqual([
      ["manager", "Arjun Mehta", "Hiring Manager", "Phone"],
      ["recruiter", "Priya Sharma", "Recruiter", "Email"],
      ["referral", "Nisha Rao", "Referral", "No direct channel"],
    ]);
    expect(crm.rows[1]).toMatchObject({
      contactDetail: "priya@example.com",
      secondaryDetail: "LinkedIn",
      notes: "Handles frontend internship hiring",
    });
    expect(crm.roleGroups.map((group) => [group.id, group.label, group.count])).toEqual([
      ["recruiter", "Recruiters", 1],
      ["hiring_manager", "Hiring Managers", 1],
      ["referral", "Referrals", 1],
      ["other", "Other Contacts", 0],
    ]);
  });

  it("normalizes contact role labels", () => {
    expect(roleLabelForContact("hiring_manager")).toBe("Hiring Manager");
    expect(roleLabelForContact("talent-partner")).toBe("Talent Partner");
    expect(roleLabelForContact(null)).toBe("Contact");
  });
});

function contact(overrides: Partial<Contact>): Contact {
  return {
    id: "contact",
    company_id: null,
    name: "Contact",
    email: null,
    phone: null,
    linkedin_url: null,
    role: null,
    notes: null,
    created_at: "2026-05-21T10:00:00Z",
    ...overrides,
  };
}
