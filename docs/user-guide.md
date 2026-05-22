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

The dashboard can run due scheduled tasks or start discovery manually. The default schedules cover discovery, application processing, follow-ups, email checks, analytics refreshes, export sync, session health, and cleanup. Failed tasks are recorded and surfaced through notifications instead of stopping unrelated workflows.

## Connectors

Built-in discovery sources include LinkedIn, Indeed, Internshala, Naukri, Wellfound, Glassdoor, JSON feeds, company career pages, Greenhouse, Lever, Workday, BambooHR, and iCIMS. Portal discovery is opt-in from Settings.

Application form filling supports generic forms plus known ATS strategies. Keep review-before-submit enabled for new portals or unfamiliar forms.

## Build And Release

Use the standard development commands from the README during local work. Tauri bundle targets are configured for macOS DMG, Linux AppImage/deb, and Windows MSI/NSIS installers, with updater artifacts enabled.

Updater signing uses the Tauri private key stored outside the repo. The public key is committed in `src-tauri/tauri.conf.json`; do not commit the private key.

GitHub Actions runs frontend, sidecar, and Rust tests on macOS, Windows, and Linux for pushes and pull requests. Release packaging runs on version tags or manual dispatch and expects `TAURI_SIGNING_PRIVATE_KEY` plus `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.

## Local Cleanup

The following paths are rebuildable and intentionally ignored by git:

- `node_modules/`
- `dist/`
- `dist-sidecar/`
- `src-tauri/target/`
- `src-tauri/gen/schemas/`

Deleting those paths is safe after tests/builds finish. Reinstall Node dependencies with `npm install` before running frontend or sidecar commands again.
