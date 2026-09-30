# Fuel Me Japan — implementation boundaries

Read every file in `Fuel-Me-Japan-M0-Handoff-Package/00–10` (actual filenames are numbered 00 through 10) before changing scope. `10-CLAUDE-CODEX-HANDOFF.md` defines the handoff requirements.

Current authorization: **M0.0 Foundation only. STOP after its report and wait for user review.** This overrides the brief's instruction to proceed to M0.1. No UHR game-engine rules apply here.

- Static React + TypeScript + Vite; no backend/database, accounts, AI, payment, internal routing, live-price scraping or M0.1 data pipeline.
- Exactly en, zh-Hant, ko, zh-Hans, th. All visible UI copy uses locale keys. Preserve Japanese safety labels in later authorized screens.
- UNKNOWN must not become fabricated facts. Source-registry candidates are not approved production datasets.
- No geolocation request, precise-location persistence, or analytics coordinates in foundation. Analytics defaults to no-op.
- Keep supplied specs unchanged. Do not publish local ZIPs, credentials, build caches or node_modules.
- Run `npm run check` (lint, typecheck, unit tests, static build, browser tests). Record actual output and limitations in `reports/M0.0-completion.md`.
- Deployment acceptance requires a verified Cloudflare production URL. A missing login is a blocker, not PASS.
