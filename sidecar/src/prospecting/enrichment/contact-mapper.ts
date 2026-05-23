import type { DiscoveredProspectContact } from "./enrichment-engine.js";

export type RawContactCandidate = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  title?: string | null;
  role?: string | null;
  confidence?: number | null;
  source: string;
  linkedinUrl?: string | null;
};

export function contactFromCandidate(candidate: RawContactCandidate): DiscoveredProspectContact | null {
  const email = normalizeEmail(candidate.email);
  if (!email) {
    return null;
  }
  const fullName = contactName(candidate, email);
  const role = candidate.role ?? roleFromTitle(candidate.title ?? "");
  const confidence = normalizedConfidence(candidate.confidence);

  return {
    fullName,
    email,
    role,
    confidence,
    source: candidate.source,
    linkedinUrl: normalizedText(candidate.linkedinUrl),
  };
}

export function roleFromTitle(title: string): string {
  const normalized = title.toLowerCase();
  if (/\b(talent acquisition|ta partner|recruiter|recruitment)\b/.test(normalized)) {
    return "talent_acquisition";
  }
  if (/\b(hr|human resources|people operations|people ops)\b/.test(normalized)) {
    return "hr_manager";
  }
  if (/\b(founder|co-founder|cofounder)\b/.test(normalized)) {
    return "founder";
  }
  if (/\bchief executive|ceo\b/.test(normalized)) {
    return "ceo";
  }
  if (/\bchief technology|cto\b/.test(normalized)) {
    return "cto";
  }
  if (/\b(vp engineering|head of engineering|engineering head)\b/.test(normalized)) {
    return "vp_engineering";
  }
  if (/\b(engineering manager|tech lead|technical lead)\b/.test(normalized)) {
    return "engineering_manager";
  }
  return "recruiter";
}

export function uniqueContacts(contacts: DiscoveredProspectContact[]): DiscoveredProspectContact[] {
  const byEmail = new Map<string, DiscoveredProspectContact>();
  for (const contact of contacts) {
    const existing = byEmail.get(contact.email);
    if (!existing || contact.confidence > existing.confidence) {
      byEmail.set(contact.email, contact);
    }
  }
  return [...byEmail.values()];
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    return null;
  }
  return normalized;
}

export function normalizedText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function contactName(candidate: RawContactCandidate, email: string): string {
  const explicit = normalizedText(candidate.fullName);
  if (explicit) {
    return explicit;
  }
  const parts = [candidate.firstName, candidate.lastName]
    .map((part) => normalizedText(part))
    .filter((part): part is string => Boolean(part));
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return titleCase(email.split("@")[0].replace(/[._-]+/g, " "));
}

function normalizedConfidence(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.65;
  }
  const normalized = value > 1 ? value / 100 : value;
  return Math.round(Math.max(0, Math.min(1, normalized)) * 100) / 100;
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
