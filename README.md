# CareerCaveman

Local-first desktop application for AI-assisted job and internship discovery, application tracking, and workflow orchestration.

This repository starts with the Phase 1 foundation from `/Users/deepakkudi23/Documents/architecture.md`:

- Tauri 2 shell with a React 19 + TypeScript + Vite frontend
- SQLite schema and migration entry point in Rust
- Node sidecar core with an event bus, workflow engine, and AI provider abstraction
- Focused unit tests for the sidecar and Rust schema contract
- Optional SQLCipher database encryption with the key stored in the OS keychain
- Tauri bundle/updater configuration for signed release artifacts

## Commands

```bash
npm install
npm run test
npm run build
npm run dev
```

Generated local data is intentionally ignored by git:

- `node_modules/`
- `dist/`
- `dist-sidecar/`
- `src-tauri/target/`
- `data/`

## User Guide

See [docs/user-guide.md](docs/user-guide.md) for first-run setup, privacy settings, automation workflows, and release packaging notes.

Use [docs/beta-test-plan.md](docs/beta-test-plan.md) before publishing beta builds.
