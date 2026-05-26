import { ImapFlow, type FetchMessageObject, type FetchQueryObject, type ImapFlowOptions, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

export type EmailProvider = "gmail" | "outlook" | "custom";
export type EmailAuthType = "password" | "oauth2";

export type EmailServerSettings = {
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  imapHost?: string;
  imapPort?: number;
  imapSecure?: boolean;
};

export type EmailAccountConfig = {
  provider: EmailProvider;
  authType?: EmailAuthType;
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
  fromName: string;
  fromEmail: string;
  signature?: string | null;
};

export type OutboundEmail = {
  to: string | string[];
  subject: string;
  body: string;
  html?: string;
};

export type SentEmailResult = {
  messageId: string | null;
};

export type InboundEmail = {
  id: string;
  uid: number;
  from: string | null;
  subject: string | null;
  body: string | null;
  receivedAt: string | null;
  inReplyTo?: string | null;
  references?: string[];
};

type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: SmtpPasswordAuth | SmtpOAuth2Auth;
};

type SmtpPasswordAuth = {
  user: string;
  pass: string;
};

type SmtpOAuth2Auth = {
  type: "OAuth2";
  user: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
};

type SmtpMessage = {
  from: string;
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
};

type SmtpTransport = {
  sendMail(message: SmtpMessage): Promise<{ messageId?: string | null }>;
};

type SmtpTransportFactory = (options: SmtpTransportOptions) => SmtpTransport;

type ImapClient = {
  connect(): Promise<void>;
  mailboxOpen(mailbox: string): Promise<unknown>;
  search(criteria: SearchObject, options?: { uid?: boolean }): Promise<number[] | false>;
  fetch(
    uids: number[],
    query: FetchQueryObject,
    options?: { uid?: boolean },
  ): AsyncIterable<FetchMessageObject>;
  messageFlagsAdd(uid: number[] | SearchObject, flags: string[], options?: { uid?: boolean }): Promise<unknown>;
  logout(): Promise<void>;
};

type ImapClientFactory = (options: ImapFlowOptions) => ImapClient;

export type SmtpEmailSenderOptions = {
  createTransport?: SmtpTransportFactory;
};

export type ImapEmailReaderOptions = {
  createClient?: ImapClientFactory;
  resolveOAuth2AccessToken?: OAuth2AccessTokenResolver;
};

export type OAuth2AccessTokenResolver = (config: EmailAccountConfig) => Promise<string>;

export type FetchUnreadOptions = {
  mailbox?: string;
  limit?: number;
  markSeen?: boolean;
  since?: Date;
};

export function defaultEmailServerSettings(provider: EmailProvider): EmailServerSettings {
  switch (provider) {
    case "gmail":
      return {
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
      };
    case "outlook":
      return {
        smtpHost: "smtp.office365.com",
        smtpPort: 587,
        smtpSecure: false,
        imapHost: "outlook.office365.com",
        imapPort: 993,
        imapSecure: true,
      };
    case "custom":
      return {};
  }
}

export function createSmtpEmailSender(
  config: EmailAccountConfig,
  options: SmtpEmailSenderOptions = {},
) {
  const createTransport =
    options.createTransport ??
    ((transportOptions) => nodemailer.createTransport(transportOptions) as SmtpTransport);

  return {
    async sendEmail(email: OutboundEmail): Promise<SentEmailResult> {
      const transport = createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: smtpAuth(config),
      });
      const info = await transport.sendMail({
        from: formatAddress(config.fromName, config.fromEmail),
        to: email.to,
        subject: email.subject,
        text: bodyWithSignature(email.body, config.signature),
        ...(email.html ? { html: email.html } : {}),
      });

      return {
        messageId: info.messageId ?? null,
      };
    },
  };
}

export function createImapEmailReader(
  config: EmailAccountConfig,
  options: ImapEmailReaderOptions = {},
) {
  const createClient = options.createClient ?? ((imapOptions) => new ImapFlow(imapOptions) as ImapClient);
  const resolveOAuth2AccessToken = options.resolveOAuth2AccessToken ?? fetchGoogleOAuth2AccessToken;

  return {
    async fetchUnread(fetchOptions: FetchUnreadOptions = {}): Promise<InboundEmail[]> {
      const client = createClient({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: await imapAuth(config, resolveOAuth2AccessToken),
      });
      const mailbox = fetchOptions.mailbox ?? "INBOX";

      await client.connect();
      try {
        await client.mailboxOpen(mailbox);
        const searchCriteria: SearchObject = {
          seen: false,
          ...(fetchOptions.since ? { since: fetchOptions.since } : {}),
        };
        const foundUids = await client.search(searchCriteria, { uid: true });
        const uids = (foundUids === false ? [] : foundUids).slice(0, fetchOptions.limit);
        const messages: InboundEmail[] = [];

        if (uids.length === 0) {
          return messages;
        }

        for await (const message of client.fetch(uids, { envelope: true, source: true, uid: true }, { uid: true })) {
          messages.push(await inboundEmailFromMessage(message));
          if (fetchOptions.markSeen === true) {
            await client.messageFlagsAdd([message.uid], ["\\Seen"], { uid: true });
          }
        }

        return messages;
      } finally {
        await client.logout();
      }
    },
  };
}

function smtpAuth(config: EmailAccountConfig): SmtpPasswordAuth | SmtpOAuth2Auth {
  if (config.authType === "oauth2") {
    return {
      type: "OAuth2",
      user: config.smtpUser,
      clientId: requiredOAuthField(config.oauthClientId, "Google OAuth client ID"),
      clientSecret: requiredOAuthField(config.oauthClientSecret, "Google OAuth client secret"),
      refreshToken: requiredOAuthField(config.oauthRefreshToken, "Google OAuth refresh token"),
    };
  }

  return {
    user: config.smtpUser,
    pass: requiredOAuthField(config.smtpPass, "SMTP password"),
  };
}

async function imapAuth(
  config: EmailAccountConfig,
  resolveOAuth2AccessToken: OAuth2AccessTokenResolver,
): Promise<ImapFlowOptions["auth"]> {
  if (config.authType === "oauth2") {
    return {
      user: config.imapUser,
      accessToken: await resolveOAuth2AccessToken(config),
    };
  }

  return {
    user: config.imapUser,
    pass: requiredOAuthField(config.imapPass, "IMAP password"),
  };
}

export async function fetchGoogleOAuth2AccessToken(config: EmailAccountConfig): Promise<string> {
  const clientId = requiredOAuthField(config.oauthClientId, "Google OAuth client ID");
  const clientSecret = requiredOAuthField(config.oauthClientSecret, "Google OAuth client secret");
  const refreshToken = requiredOAuthField(config.oauthRefreshToken, "Google OAuth refresh token");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const payload = await response.json().catch(() => null);
  const accessToken = isRecord(payload) && typeof payload.access_token === "string"
    ? payload.access_token
    : null;

  if (!response.ok || !accessToken) {
    const errorDescription = isRecord(payload) && typeof payload.error_description === "string"
      ? payload.error_description
      : `Google OAuth token refresh returned HTTP ${response.status}`;
    throw new Error(errorDescription);
  }

  return accessToken;
}

function requiredOAuthField(value: string | undefined, label: string) {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${label} is required`);
  }
  return trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function inboundEmailFromMessage(message: FetchMessageObject): Promise<InboundEmail> {
  const parsed = message.source ? await simpleParser(message.source) : null;
  const receivedAt = message.envelope?.date ?? parsed?.date ?? null;

  const references = parsedReferences(parsed?.references);
  return {
    id: message.envelope?.messageId ?? parsed?.messageId ?? String(message.uid),
    uid: message.uid,
    from: fromAddress(message, parsed?.from?.text ?? null),
    subject: message.envelope?.subject ?? parsed?.subject ?? null,
    body: parsed?.text?.trim() || null,
    receivedAt: receivedAt ? new Date(receivedAt).toISOString() : null,
    ...(parsed?.inReplyTo ? { inReplyTo: parsed.inReplyTo } : {}),
    ...(references.length > 0 ? { references } : {}),
  };
}

function fromAddress(message: FetchMessageObject, parsedFrom: string | null): string | null {
  const [firstFrom] = message.envelope?.from ?? [];
  if (firstFrom?.address) {
    return firstFrom.name ? `${firstFrom.name} <${firstFrom.address}>` : firstFrom.address;
  }
  return parsedFrom;
}

function formatAddress(name: string, email: string) {
  return `"${name.replaceAll('"', '\\"')}" <${email}>`;
}

function bodyWithSignature(body: string, signature: string | null | undefined) {
  const trimmedBody = body.trimEnd();
  const trimmedSignature = signature?.trim();

  if (!trimmedSignature) {
    return trimmedBody;
  }

  return `${trimmedBody}\n\n-- \n${trimmedSignature}`;
}

function parsedReferences(value: string | string[] | undefined): string[] {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value.split(/\s+/).filter(Boolean);
  }
  return [];
}
