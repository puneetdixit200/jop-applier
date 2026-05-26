export type EmailProvider = "gmail" | "outlook" | "custom";
export type EmailAuthType = "password" | "oauth2";

export type EmailSettings = {
  provider: EmailProvider;
  authType: EmailAuthType;
  fromName: string;
  fromEmail: string;
  username: string;
  appPassword: string;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthRefreshToken: string;
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
  authType?: EmailAuthType;
  fromName: string;
  fromEmail: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass?: string;
  imapHost: string;
  imapPort: number;
  imapSecure: boolean;
  imapUser: string;
  imapPass?: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
  oauthRefreshToken?: string;
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
  authType: "oauth2",
  fromName: "",
  fromEmail: "",
  username: "",
  appPassword: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthRefreshToken: "",
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
    return { ...current, provider, authType: "password" };
  }

  return {
    ...current,
    provider,
    authType: provider === "gmail" ? "oauth2" : "password",
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
  const authType = provider === "gmail"
    ? "oauth2"
    : emailAuthType(account.authType, "password");

  return {
    ...providerDefaults,
    authType,
    fromName: stringValue(account.fromName, fallback.fromName),
    fromEmail: stringValue(account.fromEmail, fallback.fromEmail),
    username: stringValue(account.smtpUser, stringValue(account.imapUser, fallback.username)),
    appPassword: stringValue(account.smtpPass, stringValue(account.imapPass, fallback.appPassword)),
    oauthClientId: stringValue(account.oauthClientId, fallback.oauthClientId),
    oauthClientSecret: stringValue(account.oauthClientSecret, fallback.oauthClientSecret),
    oauthRefreshToken: stringValue(account.oauthRefreshToken, fallback.oauthRefreshToken),
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
  const authType = settings.provider === "gmail" ? "oauth2" : settings.authType;
  const oauthClientId = settings.oauthClientId.trim();
  const oauthClientSecret = settings.oauthClientSecret.trim();
  const oauthRefreshToken = settings.oauthRefreshToken.trim();
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

  const baseAccount = {
    provider: settings.provider,
    authType,
    fromName,
    fromEmail,
    smtpHost,
    smtpPort: Math.floor(settings.smtpPort),
    smtpSecure: settings.smtpSecure,
    smtpUser: username,
    imapHost,
    imapPort: Math.floor(settings.imapPort),
    imapSecure: settings.imapSecure,
    imapUser: username,
    signature: signature.length > 0 ? signature : null,
  };

  if (authType === "oauth2") {
    if (
      oauthClientId.length === 0 ||
      oauthClientSecret.length === 0 ||
      oauthRefreshToken.length === 0
    ) {
      return {
        account: null,
        check,
      };
    }

    return {
      account: {
        ...baseAccount,
        oauthClientId,
        oauthClientSecret,
        oauthRefreshToken,
      },
      check,
    };
  }

  if (appPassword.length === 0) {
    return {
      account: null,
      check,
    };
  }

  return {
    account: {
      ...baseAccount,
      smtpPass: appPassword,
      imapPass: appPassword,
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

function emailAuthType(value: unknown, fallback: EmailAuthType): EmailAuthType {
  return value === "password" || value === "oauth2" ? value : fallback;
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
