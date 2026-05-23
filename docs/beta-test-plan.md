# CareerCaveman Beta Test Plan

Use this checklist before publishing a beta release candidate.

## Release Candidate Gate

- CI is green on macOS, Windows, and Linux.
- Release workflow produces macOS DMG, Linux AppImage/deb, and Windows MSI/NSIS artifacts.
- Updater artifacts are signed with the configured Tauri private key.
- The user guide matches the current settings and connector list.
- Rebuildable artifacts are not committed.

## Smoke Tests

- Launch the installed app and confirm the setup wizard appears for a new profile.
- Save profile, discovery, email, and privacy settings.
- Enable and disable database encryption on a throwaway local database.
- Run job discovery for one opt-in portal and one ATS source.
- Review a matched job, generate documents, and move an application through the tracker.
- Trigger due schedules and confirm notifications appear in the app.
- Click a test outreach unsubscribe link while the app is running and confirm the contact is opted out and queued follow-ups are cancelled.
- Export application data to CSV and verify the output file opens.
- Quit and relaunch the app, then confirm stored settings, tracker data, and encrypted sessions recover.

## Beta Feedback Triage

Classify every beta report as one of:

- `blocker`: data loss, app cannot launch, updater/install failure, or security exposure.
- `high`: application workflow fails for a common source, broken encryption, or lost tracker state.
- `medium`: connector parsing issue, confusing setup step, or recoverable workflow failure.
- `low`: copy, styling, minor analytics, or unsupported source request.

Blocker and high issues must be fixed before the next beta build.
