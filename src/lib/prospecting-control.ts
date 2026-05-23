import {
  loadRuntimeControlStatus,
  runRuntimeWorkflow,
  type RuntimeControlDependencies,
  type RuntimeControlStatus,
} from "./runtime-control";
import type {
  FundedCompany,
  ProspectContact,
  UpsertFundedCompany,
  UpsertOutreachCampaign,
  UpsertOutreachEmail,
  UpsertProspectContact,
} from "./tauri-api";
import type { ProspectingCompanyDetail } from "./prospecting-dashboard";

export type ProspectingControlDependencies = RuntimeControlDependencies & {
  listFundedCompanies: () => Promise<FundedCompany[]>;
  listProspectContacts: (companyId: string) => Promise<ProspectContact[]>;
};

export type ProspectingScanControlResult = {
  workflowStatus: string;
  runtimeStatus: RuntimeControlStatus | null;
  companies: FundedCompany[] | null;
  contacts: ProspectContact[] | null;
};

export type ProspectingOutreachDraft = {
  campaign: UpsertOutreachCampaign;
  email: Omit<UpsertOutreachEmail, "campaign_id">;
  contactLabel: string;
};

export type ManualProspectingCompanyForm = {
  name: string;
  domain: string;
  region: string;
  fundingStage: string;
  fundingAmount: string;
  industry: string;
  techStack: string;
  sourceUrl: string;
  contactName: string;
  contactEmail: string;
  contactRole: string;
};

export type ManualProspectingCompanyDraft = {
  company: UpsertFundedCompany;
  contact: Omit<UpsertProspectContact, "company_id"> | null;
  displayName: string;
};

export type FindMoreProspectContactsDraft = {
  companyId: string;
  contacts: Omit<UpsertProspectContact, "company_id">[];
};

const defaultSequence = [
  { step: 1, delayDays: 0 },
  { step: 2, delayDays: 3 },
  { step: 3, delayDays: 7 },
];

export async function runProspectingScanControl(
  dependencies: ProspectingControlDependencies,
): Promise<ProspectingScanControlResult> {
  if (!dependencies.isDesktopRuntime()) {
    return {
      workflowStatus: "Browser preview",
      runtimeStatus: null,
      companies: null,
      contacts: null,
    };
  }

  const workflow = await runRuntimeWorkflow(dependencies, "prospecting-scan");
  if (!workflow.ok) {
    return {
      workflowStatus: workflow.statusMessage,
      runtimeStatus: null,
      companies: null,
      contacts: null,
    };
  }

  const [runtimeStatus, companies] = await Promise.all([
    loadRuntimeControlStatus(dependencies),
    dependencies.listFundedCompanies(),
  ]);
  const contacts = (await Promise.all(companies.map((company) => dependencies.listProspectContacts(company.id)))).flat();

  return {
    workflowStatus: workflow.statusMessage,
    runtimeStatus,
    companies,
    contacts,
  };
}

export function buildProspectingOutreachDraft(
  detail: ProspectingCompanyDetail | null,
  scheduledAt: string,
): ProspectingOutreachDraft | null {
  const contact = detail?.contacts[0];
  if (!detail || !contact) {
    return null;
  }

  const firstName = contact.name.split(/\s+/)[0] || contact.name;
  const body = [
    `Hi ${firstName},`,
    `Saw ${detail.companyName}'s ${detail.fundingLabel} funding. ${detail.summary}`,
    `Your work around ${detail.techStackLabel} lines up with my background. Would you be open to a quick conversation?`,
  ];

  return {
    campaign: {
      company_id: detail.id,
      campaign_type: contact.roleLabel.toLowerCase().includes("founder") ? "founder_outreach" : "hr_outreach",
      status: "draft",
      sequence_json: JSON.stringify(defaultSequence),
      auto_approve: false,
      max_emails_per_day: 30,
    },
    email: {
      contact_id: contact.id,
      sequence_step: 1,
      subject: `Congrats on ${detail.fundingLabel}`,
      body_html: body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join(""),
      status: "pending",
      scheduled_at: scheduledAt,
      sent_at: null,
      message_id: null,
    },
    contactLabel: `${contact.name} <${contact.email}>`,
  };
}

export function buildManualProspectingCompanyDraft(
  form: ManualProspectingCompanyForm,
  now: string,
): ManualProspectingCompanyDraft | null {
  const name = form.name.trim();
  const domain = normalizeDomain(form.domain);
  if (!name || !domain) {
    return null;
  }

  const contactName = form.contactName.trim();
  const contactEmail = form.contactEmail.trim().toLowerCase();

  return {
    company: {
      name,
      domain,
      description: `Manually added prospect for ${name}.`,
      industry: textOrNull(form.industry),
      tech_stack: splitList(form.techStack),
      funding_stage: normalizeToken(form.fundingStage),
      funding_amount: parseFundingAmount(form.fundingAmount),
      funding_currency: "USD",
      funding_date: now,
      investors: [],
      lead_investor: null,
      source: "manual",
      source_url: textOrNull(form.sourceUrl),
      region: normalizeToken(form.region) ?? "global",
      relevance_score: 65,
      ai_summary: "Manual prospect added for targeted enrichment and outreach.",
      status: contactName && contactEmail ? "enriched" : "no_contacts",
    },
    contact: contactName && contactEmail
      ? {
          full_name: contactName,
          email: contactEmail,
          email_confidence: 0.72,
          email_status: "unknown",
          role: normalizeToken(form.contactRole) ?? "recruiter",
          linkedin_url: null,
          source: "manual",
          opted_out: false,
        }
      : null,
    displayName: name,
  };
}

export function buildFindMoreProspectContactsDraft(
  detail: ProspectingCompanyDetail | null,
): FindMoreProspectContactsDraft | null {
  const domain = detail ? normalizeDomain(detail.domainLabel) : "";
  if (!detail || !isUsableEmailDomain(domain)) {
    return null;
  }

  const existingEmails = new Set(detail.contacts.map((contact) => contact.email.toLowerCase()));
  const contacts = [
    prospectContactPattern(detail.companyName, domain, "Talent Team", "talent", "talent_acquisition", 0.55),
    prospectContactPattern(detail.companyName, domain, "Recruiting Team", "careers", "recruiter", 0.5),
    prospectContactPattern(detail.companyName, domain, "Founder Team", "founders", "founder", 0.45),
    prospectContactPattern(detail.companyName, domain, "Engineering Team", "engineering", "engineering_manager", 0.42),
  ].filter((contact) => !existingEmails.has(contact.email));

  return contacts.length > 0
    ? {
        companyId: detail.id,
        contacts: contacts.slice(0, 3),
      }
    : null;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "";
  }

  const candidate = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.split("/")[0].split(":")[0].replace(/^www\./, "");
  }
}

function normalizeToken(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || null;
}

function parseFundingAmount(value: string) {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function splitList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function textOrNull(value: string) {
  const trimmed = value.trim();
  return trimmed || null;
}

function isUsableEmailDomain(value: string) {
  return value.includes(".") && !/\s/.test(value);
}

function prospectContactPattern(
  companyName: string,
  domain: string,
  label: string,
  localPart: string,
  role: string,
  confidence: number,
): Omit<UpsertProspectContact, "company_id"> {
  return {
    full_name: `${companyName} ${label}`,
    email: `${localPart}@${domain}`,
    email_confidence: confidence,
    email_status: "unknown",
    role,
    linkedin_url: null,
    source: "pattern_guess",
    opted_out: false,
  };
}
