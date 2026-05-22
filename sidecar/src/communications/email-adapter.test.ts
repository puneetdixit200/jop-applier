import { describe, expect, it } from "vitest";
import {
  createImapEmailReader,
  createSmtpEmailSender,
  defaultEmailServerSettings,
  type EmailAccountConfig,
} from "./email-adapter.js";

const account: EmailAccountConfig = {
  provider: "gmail",
  smtpHost: "smtp.gmail.com",
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: "asha@gmail.example",
  smtpPass: "app-password",
  imapHost: "imap.gmail.com",
  imapPort: 993,
  imapSecure: true,
  imapUser: "asha@gmail.example",
  imapPass: "app-password",
  fromName: "Asha Rao",
  fromEmail: "asha@gmail.example",
  signature: "Asha Rao\nReact and Tauri engineer",
};

describe("email adapter", () => {
  it("sends SMTP email with account credentials, sender identity, and signature", async () => {
    let transportOptions: unknown;
    let sentMessage: unknown;
    const sender = createSmtpEmailSender(account, {
      createTransport: (options) => {
        transportOptions = options;
        return {
          sendMail: async (message) => {
            sentMessage = message;
            return { messageId: "smtp-message-1" };
          },
        };
      },
    });

    await expect(
      sender.sendEmail({
        to: "mira@northstar.example",
        subject: "Northstar Labs workflow automation intro",
        body: "Hi Mira,\n\nI build local-first workflow tools.",
      }),
    ).resolves.toEqual({ messageId: "smtp-message-1" });

    expect(transportOptions).toEqual({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: "asha@gmail.example",
        pass: "app-password",
      },
    });
    expect(sentMessage).toEqual({
      from: '"Asha Rao" <asha@gmail.example>',
      to: "mira@northstar.example",
      subject: "Northstar Labs workflow automation intro",
      text: "Hi Mira,\n\nI build local-first workflow tools.\n\n-- \nAsha Rao\nReact and Tauri engineer",
    });
  });

  it("fetches unread IMAP messages, parses text bodies, and marks fetched messages seen", async () => {
    const calls: string[] = [];
    let clientOptions: unknown;
    let searchCriteria: unknown;
    let fetchUids: unknown;
    let fetchQuery: unknown;
    const reader = createImapEmailReader(account, {
      createClient: (options) => {
        clientOptions = options;
        return {
          connect: async () => {
            calls.push("connect");
          },
          mailboxOpen: async (mailbox) => {
            calls.push(`mailbox:${mailbox}`);
          },
          search: async (criteria) => {
            searchCriteria = criteria;
            return [101, 102];
          },
          fetch: async function* (uids, query) {
            fetchUids = uids;
            fetchQuery = query;
            calls.push(`fetch:${uids.join(",")}`);
            yield {
              seq: 1,
              uid: 101,
              envelope: {
                messageId: "<imap-101@northstar.example>",
                subject: "Interview availability",
                date: new Date("2026-05-28T09:40:00Z"),
                from: [{ name: "Mira", address: "mira@northstar.example" }],
              },
              source: Buffer.from(
                [
                  "From: Mira <mira@northstar.example>",
                  "Subject: Interview availability",
                  "Date: Thu, 28 May 2026 09:40:00 +0000",
                  "",
                  "Can you share availability this week?",
                ].join("\r\n"),
              ),
            };
          },
          messageFlagsAdd: async (uid, flags) => {
            calls.push(`seen:${uid}:${flags.join(",")}`);
          },
          logout: async () => {
            calls.push("logout");
          },
        };
      },
    });

    await expect(
      reader.fetchUnread({
        mailbox: "INBOX",
        limit: 1,
        markSeen: true,
      }),
    ).resolves.toEqual([
      {
        id: "<imap-101@northstar.example>",
        uid: 101,
        from: "Mira <mira@northstar.example>",
        subject: "Interview availability",
        body: "Can you share availability this week?",
        receivedAt: "2026-05-28T09:40:00.000Z",
      },
    ]);

    expect(clientOptions).toEqual({
      host: "imap.gmail.com",
      port: 993,
      secure: true,
      auth: {
        user: "asha@gmail.example",
        pass: "app-password",
      },
    });
    expect(searchCriteria).toEqual({ seen: false });
    expect(fetchUids).toEqual([101]);
    expect(fetchQuery).toEqual({ envelope: true, source: true, uid: true });
    expect(calls).toEqual(["connect", "mailbox:INBOX", "fetch:101", "seen:101:\\Seen", "logout"]);
  });

  it("provides built-in Gmail and Outlook server defaults", () => {
    expect(defaultEmailServerSettings("gmail")).toEqual({
      smtpHost: "smtp.gmail.com",
      smtpPort: 465,
      smtpSecure: true,
      imapHost: "imap.gmail.com",
      imapPort: 993,
      imapSecure: true,
    });
    expect(defaultEmailServerSettings("outlook")).toEqual({
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecure: true,
    });
    expect(defaultEmailServerSettings("custom")).toEqual({});
  });
});
