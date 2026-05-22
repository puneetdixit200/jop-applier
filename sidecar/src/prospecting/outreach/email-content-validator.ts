export type GeneratedEmailContent = {
  subject: string;
  bodyText: string;
  bodyHtml: string;
};

export type EmailContentValidationResult = {
  passed: boolean;
  failures: string[];
};

const spamTriggers = /\b(buy now|free money|guaranteed|act now|limited time)\b/i;

export function validateEmailContent(email: GeneratedEmailContent): EmailContentValidationResult {
  const failures: string[] = [];

  if (wordCount(email.bodyText) >= 200) {
    failures.push("length");
  }
  if (email.subject.length > 70) {
    failures.push("subject_len");
  }
  if (spamTriggers.test(email.bodyText) || spamTriggers.test(email.subject)) {
    failures.push("no_spam_words");
  }
  if (!email.bodyText.includes("?")) {
    failures.push("has_cta");
  }
  if (email.bodyText.includes("{{") || email.bodyHtml.includes("{{")) {
    failures.push("no_false_personalization");
  }
  if (!email.bodyHtml.toLowerCase().includes("unsubscribe")) {
    failures.push("unsubscribe_present");
  }

  return { passed: failures.length === 0, failures };
}

export function renderUnsubscribeFooter(url: string) {
  return `<p style="font-size:12px;color:#5f6975">If this is not relevant, you can <a href="${escapeHtml(url)}">unsubscribe</a>.</p>`;
}

function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
