import { describe, expect, it } from "vitest";
import {
  defaultEmailSettings,
  emailSettingsForProvider,
  emailSettingsFromStoredValues,
  emailSettingsToStoredValues,
  isEmailSettingsConfigured,
} from "./email-settings";

describe("email settings", () => {
  it("loads persisted email account and check settings into the form", () => {
    const settings = emailSettingsFromStoredValues(
      {
        provider: "outlook",
        fromName: "Asha Rao",
        fromEmail: "asha@example.com",
        smtpHost: "smtp.office365.com",
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: "asha@example.com",
        smtpPass: "app-password",
        imapHost: "outlook.office365.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@example.com",
        imapPass: "app-password",
        signature: "Asha",
      },
      {
        mailbox: "Replies",
        markSeen: true,
        maxResponses: 25,
      },
      defaultEmailSettings,
    );

    expect(settings).toEqual({
      provider: "outlook",
      authType: "password",
      fromName: "Asha Rao",
      fromEmail: "asha@example.com",
      username: "asha@example.com",
      appPassword: "app-password",
      oauthClientId: "",
      oauthClientSecret: "",
      oauthRefreshToken: "",
      smtpHost: "smtp.office365.com",
      smtpPort: 587,
      smtpSecure: false,
      imapHost: "outlook.office365.com",
      imapPort: 993,
      imapSecure: true,
      mailbox: "Replies",
      markSeen: true,
      maxResponses: 25,
      signature: "Asha",
    });
  });

  it("serializes a configured Gmail account into OAuth2 sidecar settings", () => {
    const values = emailSettingsToStoredValues({
      ...defaultEmailSettings,
      provider: "gmail",
      fromName: " Asha Rao ",
      fromEmail: " asha@gmail.com ",
      username: "",
      oauthClientId: " google-client-id ",
      oauthClientSecret: " google-client-secret ",
      oauthRefreshToken: " google-refresh-token ",
      signature: " Best,\nAsha ",
    });

    expect(values).toEqual({
      account: {
        provider: "gmail",
        authType: "oauth2",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.com",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.com",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.com",
        oauthClientId: "google-client-id",
        oauthClientSecret: "google-client-secret",
        oauthRefreshToken: "google-refresh-token",
        signature: "Best,\nAsha",
      },
      check: {
        mailbox: "INBOX",
        markSeen: false,
        maxResponses: 10,
      },
    });
  });

  it("keeps custom server settings when switching to a custom provider", () => {
    expect(
      emailSettingsForProvider(
        {
          ...defaultEmailSettings,
          smtpHost: "smtp.fastmail.example",
          smtpPort: 465,
          smtpSecure: true,
          imapHost: "imap.fastmail.example",
          imapPort: 993,
          imapSecure: true,
        },
        "custom",
      ),
    ).toMatchObject({
      provider: "custom",
      smtpHost: "smtp.fastmail.example",
      imapHost: "imap.fastmail.example",
    });
  });

  it("requires sender, password, and server settings before enabling email workflows", () => {
    expect(isEmailSettingsConfigured(defaultEmailSettings)).toBe(false);
    expect(
      isEmailSettingsConfigured({
        ...defaultEmailSettings,
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.com",
        oauthClientId: "google-client-id",
        oauthClientSecret: "google-client-secret",
        oauthRefreshToken: "google-refresh-token",
      }),
    ).toBe(true);
  });
});
