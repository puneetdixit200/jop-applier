import { ImapFlow, type FetchMessageObject, type FetchQueryObject, type ImapFlowOptions, type SearchObject } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";

export type EmailProvider = "gmail" | "outlook" | "custom";

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
  auth: {
    user: string;
    pass: string;
  };
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
};

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
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
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

  return {
    async fetchUnread(fetchOptions: FetchUnreadOptions = {}): Promise<InboundEmail[]> {
      const client = createClient({
        host: config.imapHost,
        port: config.imapPort,
        secure: config.imapSecure,
        auth: {
          user: config.imapUser,
          pass: config.imapPass,
        },
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
