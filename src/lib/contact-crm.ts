import type { Contact } from "./tauri-api";

export type ContactRoleGroupId = "recruiter" | "hiring_manager" | "referral" | "other";

export type ContactCrmRow = {
  id: string;
  name: string;
  role: string | null;
  roleLabel: string;
  primaryChannel: string;
  contactDetail: string;
  secondaryDetail: string | null;
  notes: string | null;
  group: ContactRoleGroupId;
};

export type ContactRoleGroup = {
  id: ContactRoleGroupId;
  label: string;
  count: number;
  rows: ContactCrmRow[];
};

export type ContactCrm = {
  summary: {
    total: number;
    reachable: number;
    recruiters: number;
    hiringManagers: number;
    referrals: number;
  };
  roleGroups: ContactRoleGroup[];
  rows: ContactCrmRow[];
};

const roleGroupDefinitions: Array<{ id: ContactRoleGroupId; label: string }> = [
  { id: "recruiter", label: "Recruiters" },
  { id: "hiring_manager", label: "Hiring Managers" },
  { id: "referral", label: "Referrals" },
  { id: "other", label: "Other Contacts" },
];

export function buildContactCrm(contacts: Contact[]): ContactCrm {
  const rows = contacts.map(contactRow).sort(compareContactRows);
  const roleGroups = roleGroupDefinitions.map((definition) => {
    const groupRows = rows.filter((row) => row.group === definition.id);
    return {
      ...definition,
      count: groupRows.length,
      rows: groupRows,
    };
  });

  return {
    summary: {
      total: rows.length,
      reachable: rows.filter((row) => row.primaryChannel !== "No direct channel").length,
      recruiters: roleGroups.find((group) => group.id === "recruiter")?.count ?? 0,
      hiringManagers: roleGroups.find((group) => group.id === "hiring_manager")?.count ?? 0,
      referrals: roleGroups.find((group) => group.id === "referral")?.count ?? 0,
    },
    roleGroups,
    rows,
  };
}

function compareContactRows(left: ContactCrmRow, right: ContactCrmRow) {
  const leftReachable = left.primaryChannel !== "No direct channel";
  const rightReachable = right.primaryChannel !== "No direct channel";
  if (leftReachable !== rightReachable) {
    return leftReachable ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

export function roleLabelForContact(role: string | null) {
  if (!role) {
    return "Contact";
  }
  return titleCase(role);
}

function contactRow(contact: Contact): ContactCrmRow {
  const channel = primaryChannel(contact);
  return {
    id: contact.id,
    name: contact.name,
    role: contact.role,
    roleLabel: roleLabelForContact(contact.role),
    primaryChannel: channel.label,
    contactDetail: channel.detail,
    secondaryDetail: secondaryContactDetail(contact, channel.label),
    notes: contact.notes,
    group: roleGroupForContact(contact.role),
  };
}

function roleGroupForContact(role: string | null): ContactRoleGroupId {
  const normalized = normalizeRole(role);
  if (normalized === "recruiter") {
    return "recruiter";
  }
  if (normalized === "hiring_manager") {
    return "hiring_manager";
  }
  if (normalized === "referral") {
    return "referral";
  }
  return "other";
}

function primaryChannel(contact: Contact) {
  if (contact.email) {
    return {
      label: "Email",
      detail: contact.email,
    };
  }
  if (contact.phone) {
    return {
      label: "Phone",
      detail: contact.phone,
    };
  }
  if (contact.linkedin_url) {
    return {
      label: "LinkedIn",
      detail: contact.linkedin_url,
    };
  }
  return {
    label: "No direct channel",
    detail: "Add email, phone, or LinkedIn",
  };
}

function secondaryContactDetail(contact: Contact, primaryLabel: string) {
  if (primaryLabel !== "Email" && contact.email) {
    return "Email";
  }
  if (primaryLabel !== "Phone" && contact.phone) {
    return "Phone";
  }
  if (primaryLabel !== "LinkedIn" && contact.linkedin_url) {
    return "LinkedIn";
  }
  return null;
}

function normalizeRole(role: string | null) {
  return role?.trim().toLowerCase().replace(/[-\s]+/g, "_") ?? "";
}

function titleCase(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
