# CareerCaveman User Guide

CareerCaveman is a local-first desktop app for job discovery, AI-assisted application preparation, tracking, follow-ups, analytics, and exports.

## First Run

1. Open the app and complete the dashboard setup checklist.
2. Add your profile, skills, and target roles.
3. Pick an AI provider. Ollama keeps inference local; cloud providers require your own API key.
4. Configure at least one discovery source under Settings.
5. Keep semi-auto review enabled until you trust the generated resumes, cover letters, and form answers.

## Privacy

Application data is stored in the local SQLite database under the app data directory. Secrets such as email passwords, export tokens, and the optional database encryption key are stored in the OS keychain.

To encrypt the database, open Settings, enter an encryption key under Database privacy, and choose Enable Encryption. The app converts the existing SQLite file to SQLCipher and keeps the key in the OS keychain. You can also set `CAREERCAVEMAN_DATABASE_KEY` before launch to open an encrypted database with an environment-provided key.

Browser session snapshots are encrypted separately when `BROWSER_SESSION_KEY` or `CAREERCAVEMAN_BROWSER_SESSION_KEY` is configured.

## Automation

The dashboard can run due scheduled tasks or start discovery manually. The default schedules cover discovery, application processing, follow-ups, email checks, analytics refreshes, weekly analytics reports, daily digests, export sync, session health, and cleanup. Failed tasks are recorded and surfaced through notifications instead of stopping unrelated workflows.

When a profile is configured, discovery can classify raw postings, score jobs against your skills, apply saved match rules, and surface high-match jobs through OS and in-app notifications.

Optional email notifications use SMTP settings from environment variables such as `CAREERCAVEMAN_NOTIFICATION_EMAIL_TO`, `CAREERCAVEMAN_SMTP_HOST`, `CAREERCAVEMAN_SMTP_USER`, `CAREERCAVEMAN_SMTP_PASS`, and `CAREERCAVEMAN_EMAIL_FROM`.

## Prospecting And Outreach

Prospecting adds a proactive channel alongside posted-job discovery. The sidecar can scan funded-company sources such as Inc42, YourStory, TechCrunch, Crunchbase, and Tracxn, normalize duplicate funding events, score companies against your profile, enrich contacts, and prepare outreach campaigns.

The Prospecting screen shows funded companies, relevance score, funding round, contact count, and review status. The Outreach screen shows pending review emails and campaign analytics for sent, opened, replied, and bounced messages.

Outreach is review-first by default. Every generated message must pass content checks, include an unsubscribe link, respect the daily hard cap, avoid recent re-contact, stay inside business hours, and skip opted-out recipients.

## Connectors

Built-in discovery sources include LinkedIn, Indeed, Internshala, Naukri, Wellfound, Glassdoor, JSON feeds, company career pages, Greenhouse, Lever, Workday, BambooHR, and iCIMS. Portal discovery is opt-in from Settings.

Application form filling supports generic forms plus known ATS strategies. Keep review-before-submit enabled for new portals or unfamiliar forms.

User-installable plugin manifests live under `plugins/`. The example connector shows the expected manifest shape, and the sidecar loader verifies plugin paths stay inside the plugin directory before importing the entry module.

## Build And Release

Use the standard development commands from the README during local work. Tauri bundle targets are configured for macOS DMG, Linux AppImage/deb, and Windows MSI/NSIS installers, with updater artifacts enabled.

Updater signing uses the Tauri private key stored outside the repo. The public key is committed in `src-tauri/tauri.conf.json`; do not commit the private key.

GitHub Actions runs frontend, sidecar, and Rust tests on macOS, Windows, and Linux for pushes and pull requests. Release packaging runs on version tags or manual dispatch and expects `TAURI_SIGNING_PRIVATE_KEY` plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.

Run the beta checklist in `docs/beta-test-plan.md` before publishing release candidates.

## Local Cleanup

The following paths are rebuildable and intentionally ignored by git:

- `node_modules/`
- `dist/`
- `dist-sidecar/`
- `src-tauri/target/`
- `src-tauri/gen/schemas/`

Deleting those paths is safe after tests/builds finish. Reinstall Node dependencies with `npm install` before running frontend or sidecar commands again.
