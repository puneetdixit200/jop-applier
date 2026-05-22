import { describe, expect, it } from "vitest";
import { renderUnsubscribeFooter, validateEmailContent } from "./email-content-validator.js";

describe("email content validator", () => {
  it("accepts concise personalized outreach with a CTA and unsubscribe link", () => {
    const footer = renderUnsubscribeFooter("https://app.local/unsubscribe?token=abc");
    const result = validateEmailContent({
      subject: "Congrats on the Series A",
      bodyText: "Hi Priya, saw Setu raised a Series A. I build payment APIs. Open to a quick chat?",
      bodyHtml: `<p>Hi Priya, saw Setu raised a Series A. I build payment APIs. Open to a quick chat?</p>${footer}`,
    });

    expect(result).toEqual({ passed: true, failures: [] });
  });

  it("reports every anti-spam and quality failure", () => {
    const result = validateEmailContent({
      subject: "This subject is intentionally far too long for a safe cold outreach email subject",
      bodyText: `${"hello ".repeat(205)} Buy now {{companyName}}`,
      bodyHtml: "<p>No footer</p>",
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      "length",
      "subject_len",
      "no_spam_words",
      "has_cta",
      "no_false_personalization",
      "unsubscribe_present",
    ]);
  });
});
