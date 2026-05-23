import {
  loadRuntimeControlStatus,
  runRuntimeWorkflow,
  type RuntimeControlDependencies,
  type RuntimeControlStatus,
} from "./runtime-control";
import type {
  FundedCompany,
  ProspectContact,
  UpsertOutreachCampaign,
  UpsertOutreachEmail,
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
