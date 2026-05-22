export type EmailProvider = "gmail" | "outlook" | "custom";

export type EmailSettings = {
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  username: string;
  appPassword: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  mailbox: string;
  markSeen: boolean;
  maxResponses: number;
  signature: string;
};

export type StoredEmailAccount = {
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass: string;
  signature: string | null;
};

export type StoredEmailCheck = {
  mailbox: string;
  markSeen: boolean;
  maxResponses: number;
};

export type StoredEmailSettings = {
  account: StoredEmailAccount | null;
  check: StoredEmailCheck;
};

const providerServerSettings = {
  gmail: {
    smtpHost: "smtp.gmail.com",
    smtpPort: 465,
    smtpSecure: true,
    imapHost: "imap.gmail.com",
    imapPort: 993,
    imapSecure: true,
  },
  outlook: {
    smtpHost: "smtp.office365.com",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "outlook.office365.com",
    imapPort: 993,
    imapSecure: true,
  },
  custom: {
    smtpHost: "",
    smtpPort: 587,
    smtpSecure: false,
    imapHost: "",
    imapPort: 993,
    imapSecure: true,
  },
} satisfies Record<EmailProvider, Pick<
  EmailSettings,
  "smtpHost" | "smtpPort" | "smtpSecure" | "imapHost" | "imapPort" | "imapSecure"
>>;

export const defaultEmailSettings: EmailSettings = {
  provider: "gmail",
  fromName: "",
  fromEmail: "",
  username: "",
  appPassword: "",
  ...providerServerSettings.gmail,
  mailbox: "INBOX",
  markSeen: false,
  maxResponses: 10,
  signature: "",
};

export function emailSettingsForProvider(
  current: EmailSettings,
  provider: EmailProvider,
): EmailSettings {
  if (provider === "custom") {
    return { ...current, provider };
  }

  return {
    ...current,
    provider,
    ...providerServerSettings[provider],
  };
}

export function emailSettingsFromStoredValues(
  accountValue: unknown,
  checkValue: unknown,
  fallback: EmailSettings = defaultEmailSettings,
): EmailSettings {
  const account = isRecord(accountValue) ? accountValue : {};
  const check = isRecord(checkValue) ? checkValue : {};
  const provider = emailProvider(account.provider, fallback.provider);
  const providerDefaults = emailSettingsForProvider(fallback, provider);

  return {
    ...providerDefaults,
    fromName: stringValue(account.fromName, fallback.fromName),
    fromEmail: stringValue(account.fromEmail, fallback.fromEmail),
    username: stringValue(account.smtpUser, stringValue(account.imapUser, fallback.username)),
    appPassword: stringValue(account.smtpPass, stringValue(account.imapPass, fallback.appPassword)),
    smtpHost: stringValue(account.smtpHost, providerDefaults.smtpHost),
    smtpPort: positiveInteger(account.smtpPort, providerDefaults.smtpPort),
    smtpSecure: booleanValue(account.smtpSecure, providerDefaults.smtpSecure),
    imapHost: stringValue(account.imapHost, providerDefaults.imapHost),
    imapPort: positiveInteger(account.imapPort, providerDefaults.imapPort),
    imapSecure: booleanValue(account.imapSecure, providerDefaults.imapSecure),
    mailbox: stringValue(check.mailbox, fallback.mailbox),
    markSeen: booleanValue(check.markSeen, fallback.markSeen),
    maxResponses: positiveInteger(check.maxResponses, fallback.maxResponses),
    signature: stringValue(account.signature, fallback.signature),
  };
}

export function emailSettingsToStoredValues(settings: EmailSettings): StoredEmailSettings {
  const fromName = settings.fromName.trim();
  const fromEmail = settings.fromEmail.trim();
  const username = settings.username.trim() || fromEmail;
  const appPassword = settings.appPassword.trim();
  const smtpHost = settings.smtpHost.trim();
  const imapHost = settings.imapHost.trim();
  const mailbox = settings.mailbox.trim() || "INBOX";
  const maxResponses = Math.max(1, Math.floor(settings.maxResponses || defaultEmailSettings.maxResponses));
  const signature = settings.signature.trim();
  const check: StoredEmailCheck = {
    mailbox,
    markSeen: settings.markSeen,
    maxResponses,
  };

  if (
    fromName.length === 0 ||
    fromEmail.length === 0 ||
    username.length === 0 ||
    appPassword.length === 0 ||
    smtpHost.length === 0 ||
    imapHost.length === 0 ||
    settings.smtpPort <= 0 ||
    settings.imapPort <= 0
  ) {
    return {
      account: null,
      check,
    };
  }

  return {
    account: {
      provider: settings.provider,
      fromName,
      fromEmail,
      smtpHost,
      smtpPort: Math.floor(settings.smtpPort),
      smtpSecure: settings.smtpSecure,
      smtpUser: username,
      smtpPass: appPassword,
      imapHost,
      imapPort: Math.floor(settings.imapPort),
      imapSecure: settings.imapSecure,
      imapUser: username,
      imapPass: appPassword,
      signature: signature.length > 0 ? signature : null,
    },
    check,
  };
}

export function isEmailSettingsConfigured(settings: EmailSettings) {
  return emailSettingsToStoredValues(settings).account !== null;
}

function emailProvider(value: unknown, fallback: EmailProvider): EmailProvider {
  return value === "gmail" || value === "outlook" || value === "custom" ? value : fallback;
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
