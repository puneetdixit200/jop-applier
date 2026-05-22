import type { FundedCompany, OutreachEmail, ProspectContact } from "./tauri-api";

export type ProspectingDashboardFilters = {
  region?: string;
  status?: string;
  minScore?: number;
};

export type ProspectingDashboardRow = {
  id: string;
  companyName: string;
  fundingLabel: string;
  score: number;
  contacts: number;
  statusLabel: string;
  region: string;
};

export type ProspectingDashboard = {
  rows: ProspectingDashboardRow[];
  summary: {
    companies: number;
    contacts: number;
    averageScore: number;
  };
};

export type OutreachReviewQueueItem = {
  id: string;
  companyName: string;
  contactLabel: string;
  subject: string;
  bodyPreview: string;
  sequenceStep: number;
  scheduledAt: string | null;
};

export type OutreachAnalyticsSummary = {
  sent: number;
  opened: number;
  replied: number;
  bounced: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
};

export function buildProspectingDashboard(
  input: { companies: FundedCompany[]; contacts: ProspectContact[] },
  filters: ProspectingDashboardFilters = {},
): ProspectingDashboard {
  const contactsByCompany = countBy(input.contacts, (contact) => contact.company_id);
  const rows = input.companies
    .filter((company) => filters.region === undefined || company.region === filters.region)
    .filter((company) => filters.status === undefined || company.status === filters.status)
    .filter((company) => (company.relevance_score ?? 0) >= (filters.minScore ?? 0))
    .sort((left, right) => (right.relevance_score ?? 0) - (left.relevance_score ?? 0))
    .map((company) => ({
      id: company.id,
      companyName: company.name,
      fundingLabel: fundingLabel(company),
      score: Math.round(company.relevance_score ?? 0),
      contacts: contactsByCompany.get(company.id) ?? 0,
      statusLabel: titleCase(company.status),
      region: company.region,
    }));

  const averageScore = rows.length === 0
    ? 0
    : Math.round(rows.reduce((sum, row) => sum + row.score, 0) / rows.length);

  return {
    rows,
    summary: {
      companies: rows.length,
      contacts: input.contacts.length,
      averageScore,
    },
  };
}

export function buildOutreachReviewQueue(input: {
  companies: FundedCompany[];
  contacts: ProspectContact[];
  emails: OutreachEmail[];
}): OutreachReviewQueueItem[] {
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const companiesById = new Map(input.companies.map((company) => [company.id, company]));

  return input.emails
    .filter((email) => email.status === "pending")
    .sort((left, right) => sortableTime(left.scheduled_at) - sortableTime(right.scheduled_at))
    .map((email) => {
      const contact = contactsById.get(email.contact_id);
      const company = contact ? companiesById.get(contact.company_id) : undefined;
      return {
        id: email.id,
        companyName: company?.name ?? "Unknown company",
        contactLabel: contact ? `${contact.full_name} <${contact.email}>` : "Unknown contact",
        subject: email.subject,
        bodyPreview: htmlToPreview(email.body_html),
        sequenceStep: email.sequence_step,
        scheduledAt: email.scheduled_at,
      };
    });
}

export function buildOutreachAnalytics(emails: OutreachEmail[]): OutreachAnalyticsSummary {
  const sentEmails = emails.filter((email) => ["sent", "opened", "replied", "bounced"].includes(email.status));
  const sent = sentEmails.length;
  const opened = emails.filter((email) => email.status === "opened").length;
  const replied = emails.filter((email) => email.status === "replied").length;
  const bounced = emails.filter((email) => email.status === "bounced").length;

  return {
    sent,
    opened,
    replied,
    bounced,
    openRate: rate(opened, sent),
    replyRate: rate(replied, sent),
    bounceRate: rate(bounced, sent),
  };
}

function fundingLabel(company: FundedCompany) {
  const stage = company.funding_stage ? titleCase(company.funding_stage) : "Funding";
  const amount = company.funding_amount !== null ? money(company.funding_amount, company.funding_currency) : null;
  return [stage, amount].filter(Boolean).join(" - ");
}

function money(amount: number, currency: string) {
  const prefix = currency === "USD" ? "$" : `${currency} `;
  if (amount >= 1_000_000_000) {
    return `${prefix}${Math.round(amount / 100_000_000) / 10}B`;
  }
  if (amount >= 1_000_000) {
    return `${prefix}${Math.round(amount / 1_000_000)}M`;
  }
  return `${prefix}${Math.round(amount).toLocaleString("en-US")}`;
}

function titleCase(value: string) {
  return value
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function countBy<T>(items: T[], keyFor: (item: T) => string) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyFor(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function sortableTime(value: string | null) {
  const time = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function htmlToPreview(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rate(value: number, total: number) {
  return total === 0 ? 0 : Math.round((value / total) * 1000) / 10;
}
