export type ProspectCompanyForEnrichment = {
  id: string;
  name: string;
  domain: string | null;
  linkedin_url: string | null;
  region: string;
};

export type DiscoveredProspectContact = {
  fullName: string;
  email: string;
  role: string;
  confidence: number;
  source: string;
  linkedinUrl?: string | null;
};

export type ContactEnricher = {
  id: string;
  findContacts(company: ProspectCompanyForEnrichment): Promise<DiscoveredProspectContact[]>;
};

export type EmailVerificationResult = {
  status: "valid" | "invalid" | "catch_all" | "unknown";
  confidenceMultiplier: number;
};

export type ProspectContactUpsert = {
  company_id: string;
  full_name: string;
  email: string;
  email_confidence: number;
  email_status: string;
  role: string;
  linkedin_url: string | null;
  source: string;
  opted_out: boolean;
};

export type EnrichmentDependencies = {
  enrichers: ContactEnricher[];
  verifyEmail(email: string): Promise<EmailVerificationResult>;
  saveContacts(contacts: ProspectContactUpsert[]): Promise<Array<{ id: string; email: string }>>;
  updateCompanyStatus(companyId: string, status: string): Promise<void>;
};

export type EnrichmentOptions = {
  maxContacts?: number;
};

export type EnrichmentResult = {
  companyId: string;
  discovered: number;
  stored: number;
  status: string;
};

const rolePriority = new Map<string, number>([
  ["hr_manager", 1],
  ["recruiter", 1],
  ["talent_acquisition", 1],
  ["people_ops", 2],
  ["head_of_hr", 2],
  ["founder", 3],
  ["ceo", 3],
  ["cto", 4],
  ["vp_engineering", 4],
  ["engineering_manager", 5],
]);

export async function runEnrichmentPipeline(
  dependencies: EnrichmentDependencies,
  company: ProspectCompanyForEnrichment,
  options: EnrichmentOptions = {},
): Promise<EnrichmentResult> {
  if (!company.domain) {
    await dependencies.updateCompanyStatus(company.id, "no_domain");
    return result(company.id, 0, 0, "no_domain");
  }

  const discovered = (await Promise.all(dependencies.enrichers.map((enricher) => enricher.findContacts(company)))).flat();
  const contacts = await verifyAndRankContacts(dependencies, company.id, discovered, options.maxContacts ?? 3);
  const stored = contacts.length > 0 ? await dependencies.saveContacts(contacts) : [];
  const status = stored.length > 0 ? "enriched" : "no_contacts";
  await dependencies.updateCompanyStatus(company.id, status);
  return result(company.id, discovered.length, stored.length, status);
}

async function verifyAndRankContacts(
  dependencies: Pick<EnrichmentDependencies, "verifyEmail">,
  companyId: string,
  contacts: DiscoveredProspectContact[],
  maxContacts: number,
): Promise<ProspectContactUpsert[]> {
  const deduped = new Map<string, DiscoveredProspectContact>();
  for (const contact of contacts) {
    const email = contact.email.trim().toLowerCase();
    if (!email) {
      continue;
    }
    const existing = deduped.get(email);
    if (!existing || compareDiscoveredContacts(contact, existing) < 0) {
      deduped.set(email, { ...contact, email });
    }
  }

  const verified: ProspectContactUpsert[] = [];
  for (const contact of deduped.values()) {
    const verification = await dependencies.verifyEmail(contact.email);
    if (verification.status === "invalid") {
      continue;
    }
    verified.push({
      company_id: companyId,
      full_name: contact.fullName,
      email: contact.email,
      email_confidence: roundConfidence(contact.confidence * verification.confidenceMultiplier),
      email_status: verification.status,
      role: contact.role,
      linkedin_url: contact.linkedinUrl ?? null,
      source: contact.source,
      opted_out: false,
    });
  }

  return verified.sort(compareUpserts).slice(0, maxContacts);
}

function compareDiscoveredContacts(left: DiscoveredProspectContact, right: DiscoveredProspectContact) {
  return roleRank(left.role) - roleRank(right.role) || right.confidence - left.confidence;
}

function compareUpserts(left: ProspectContactUpsert, right: ProspectContactUpsert) {
  return roleRank(left.role) - roleRank(right.role) || right.email_confidence - left.email_confidence;
}

function roleRank(role: string) {
  return rolePriority.get(role) ?? 99;
}

function roundConfidence(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function result(companyId: string, discovered: number, stored: number, status: string): EnrichmentResult {
  return { companyId, discovered, stored, status };
}
