import { describe, expect, it } from "vitest";
import { emailAccountConfig } from "./email-account-config.js";

describe("email account config", () => {
  it("accepts Gmail OAuth2 account settings without SMTP or IMAP passwords", () => {
    expect(
      emailAccountConfig({
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
      }),
    ).toMatchObject({
      provider: "gmail",
      authType: "oauth2",
      smtpUser: "asha@gmail.com",
      imapUser: "asha@gmail.com",
      oauthClientId: "google-client-id",
      oauthClientSecret: "google-client-secret",
      oauthRefreshToken: "google-refresh-token",
    });
  });

  it("rejects Gmail password account settings", () => {
    expect(
      emailAccountConfig({
        provider: "gmail",
        authType: "password",
        fromName: "Asha Rao",
        fromEmail: "asha@gmail.com",
        smtpHost: "smtp.gmail.com",
        smtpPort: 465,
        smtpSecure: true,
        smtpUser: "asha@gmail.com",
        smtpPass: "app-password",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapSecure: true,
        imapUser: "asha@gmail.com",
        imapPass: "app-password",
      }),
    ).toBeNull();
  });
});
