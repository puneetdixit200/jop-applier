import { buildDefaultOutreachSequence } from "./email-sequence-engine.js";
import { renderUnsubscribeFooter, validateEmailContent } from "./email-content-validator.js";

export type GeneratedOutreachEmail = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export type OutreachCampaignDraft = {
  company_id: string;
  campaign_type: "hr_outreach" | "founder_outreach";
  status: "draft" | "active" | "paused" | "completed";
  sequence_json: string;
  auto_approve: boolean;
  max_emails_per_day: number;
};

export type OutreachEmailDraft = {
  campaign_id: string;
  contact_id: string;
  sequence_step: number;
  subject: string;
  body_html: string;
  status: "pending" | "queued" | "rejected";
  scheduled_at: string;
  sent_at: null;
  message_id: null;
};

export type OutreachPromptContext = {
  contactName: string;
  contactRole: string;
  companyName: string;
  companyDescription: string;
  techStack: string[];
  fundingStage: string;
  fundingAmount: string;
  fundingDate: string;
  investors: string;
  leadInvestor: string | null;
  userName: string;
  userSkills: string[];
  userExperience: string;
  targetRole: string;
  portfolioUrl?: string;
  sequenceStep: 1;
};

export type OutreachCampaignDependencies = {
  generateEmail(context: OutreachPromptContext): Promise<GeneratedOutreachEmail>;
  saveCampaign(campaign: OutreachCampaignDraft): Promise<{ id: string }>;
  saveEmails(emails: OutreachEmailDraft[]): Promise<Array<{ id: string; status: string }>>;
};

export type OutreachCampaignInput = {
  company: {
    id: string;
    name: string;
    description: string | null;
    techStack: string[];
    fundingStage: string;
    fundingAmount: string;
    fundingDate: string;
    investors: string[];
    leadInvestor: string | null;
  };
  contacts: Array<{
    id: string;
    fullName: string;
    email: string;
    role: string;
  }>;
  user: {
    name: string;
    skills: string[];
    experience: string;
    targetRole: string;
    portfolioUrl?: string;
  };
  autoApprove: boolean;
  unsubscribeBaseUrl: string;
  now: Date;
  maxEmailsPerDay?: number;
};

export type OutreachCampaignResult = {
  campaignId: string;
  generated: number;
  queued: number;
  pendingReview: number;
  rejected: number;
};

export async function createOutreachCampaign(
  dependencies: OutreachCampaignDependencies,
  input: OutreachCampaignInput,
): Promise<OutreachCampaignResult> {
  const campaign = await dependencies.saveCampaign({
    company_id: input.company.id,
    campaign_type: campaignType(input.contacts),
    status: input.autoApprove ? "active" : "draft",
    sequence_json: JSON.stringify(buildDefaultOutreachSequence()),
    auto_approve: input.autoApprove,
    max_emails_per_day: Math.min(input.maxEmailsPerDay ?? 30, 50),
  });

  const drafts: OutreachEmailDraft[] = [];
  let generated = 0;
  let rejected = 0;

  for (const contact of input.contacts) {
    const generatedEmail = await dependencies.generateEmail(promptContext(input, contact));
    generated += 1;
    const unsubscribeUrl = `${input.unsubscribeBaseUrl}?token=${unsubscribeToken(contact.email)}`;
    const bodyHtml = `${generatedEmail.bodyHtml}${renderUnsubscribeFooter(unsubscribeUrl)}`;
    const validation = validateEmailContent({
      subject: generatedEmail.subject,
      bodyText: generatedEmail.bodyText,
      bodyHtml,
    });
    if (!validation.passed) {
      rejected += 1;
    }
    drafts.push({
      campaign_id: campaign.id,
      contact_id: contact.id,
      sequence_step: 1,
      subject: generatedEmail.subject,
      body_html: bodyHtml,
      status: validation.passed ? (input.autoApprove ? "queued" : "pending") : "rejected",
      scheduled_at: input.now.toISOString(),
      sent_at: null,
      message_id: null,
    });
  }

  const saved = await dependencies.saveEmails(drafts);
  return {
    campaignId: campaign.id,
    generated,
    queued: saved.filter((email) => email.status === "queued").length,
    pendingReview: saved.filter((email) => email.status === "pending").length,
    rejected,
  };
}

function campaignType(contacts: OutreachCampaignInput["contacts"]): OutreachCampaignDraft["campaign_type"] {
  return contacts.some((contact) => contact.role === "founder" || contact.role === "ceo")
    ? "founder_outreach"
    : "hr_outreach";
}

function promptContext(
  input: OutreachCampaignInput,
  contact: OutreachCampaignInput["contacts"][number],
): OutreachPromptContext {
  return {
    contactName: contact.fullName,
    contactRole: contact.role,
    companyName: input.company.name,
    companyDescription: input.company.description ?? "",
    techStack: input.company.techStack,
    fundingStage: input.company.fundingStage,
    fundingAmount: input.company.fundingAmount,
    fundingDate: input.company.fundingDate,
    investors: input.company.investors.join(", "),
    leadInvestor: input.company.leadInvestor,
    userName: input.user.name,
    userSkills: input.user.skills,
    userExperience: input.user.experience,
    targetRole: input.user.targetRole,
    ...(input.user.portfolioUrl ? { portfolioUrl: input.user.portfolioUrl } : {}),
    sequenceStep: 1,
  };
}

function unsubscribeToken(email: string) {
  return Buffer.from(email.toLowerCase()).toString("base64url");
}
