import type { FollowUpApplication } from "./follow-up-scheduler.js";

export type FollowUpEmailDraft = {
  subject: string;
  body: string;
};

export function followUpEmailDraft(application: FollowUpApplication): FollowUpEmailDraft {
  const companyName = application.companyName.trim();
  const jobTitle = application.jobTitle?.trim() || null;
  const contactName = application.contactName?.trim() || companyName;

  return {
    subject: jobTitle
      ? `Following up on ${jobTitle} at ${companyName}`
      : `Following up on ${companyName}`,
    body: jobTitle
      ? `Hi ${contactName},\n\nI wanted to follow up on my application for the ${jobTitle} role at ${companyName}.\n\nThank you.`
      : `Hi ${contactName},\n\nI wanted to follow up on my application at ${companyName}.\n\nThank you.`,
  };
}
