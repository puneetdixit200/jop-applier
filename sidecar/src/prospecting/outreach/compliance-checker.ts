export type OutreachComplianceInput = {
  now: Date;
  recipientTimezoneOffsetMinutes: number;
  email: string;
  companyId: string;
  dailySentCount: number;
  companyContactedCount: number;
  recentContactedAt: string | null;
  bounceCountLast7Days: number;
  optedOutEmails: Set<string>;
  dailyHardCap?: number;
  perCompanyCap?: number;
  recontactWindowDays?: number;
  bounceThreshold?: number;
};

export type OutreachComplianceResult = {
  allowed: boolean;
  reasons: string[];
};

export function evaluateOutreachCompliance(input: OutreachComplianceInput): OutreachComplianceResult {
  const reasons: string[] = [];
  const email = input.email.toLowerCase();

  if (input.optedOutEmails.has(email)) {
    reasons.push("email_opted_out");
  }
  if (input.dailySentCount >= (input.dailyHardCap ?? 50)) {
    reasons.push("daily_hard_cap_reached");
  }
  if (input.companyContactedCount >= (input.perCompanyCap ?? 5)) {
    reasons.push("company_contact_cap_reached");
  }
  if (wasContactedRecently(input.recentContactedAt, input.now, input.recontactWindowDays ?? 30)) {
    reasons.push("recently_contacted");
  }
  if (input.bounceCountLast7Days >= (input.bounceThreshold ?? 3)) {
    reasons.push("bounce_threshold_reached");
  }
  if (!isBusinessHour(input.now, input.recipientTimezoneOffsetMinutes)) {
    reasons.push("outside_sending_window");
  }

  return { allowed: reasons.length === 0, reasons };
}

function wasContactedRecently(value: string | null, now: Date, windowDays: number) {
  if (!value) {
    return false;
  }
  const contactedAt = new Date(value);
  if (!Number.isFinite(contactedAt.getTime())) {
    return false;
  }
  return now.getTime() - contactedAt.getTime() < windowDays * 24 * 60 * 60 * 1000;
}

function isBusinessHour(now: Date, offsetMinutes: number) {
  const local = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const hour = local.getUTCHours() + local.getUTCMinutes() / 60;
  return hour >= 9 && hour < 18;
}
