# Fuel Me Japan

Refuel in Japan without speaking Japanese.

Production foundation preview: https://fuel-me-japan.com/

The www hostname and production pages.dev address redirect to the primary domain, preserving paths and query parameters. Immutable deployment previews remain accessible. Domain configuration and verification: `reports/M0.0-domain-configuration.md`.

**M0.0 Foundation preview only.** The four future task cards are informational; station search, vehicle advice, guides and return-car flows are not implemented. Stop here for user review before M0.1.

## Local setup

Node 24 (see `.nvmrc`) and npm. From this directory:

```sh
npm ci
npm run dev
```

```sh
npx playwright install chromium
npm run check
```

`check` runs all lint/typecheck/unit tests/build/mobile browser tests. Browser installation is needed once per machine. `npm run preview` serves the built output. No environment variables are needed for local development.

## Architecture

React + TypeScript + Vite; static HTML prerendered at `/en/`, `/zh-Hant/`, `/ko/`, `/zh-Hans/`, `/th/`, with an English `/` fallback. Shared mobile components, system fonts, CSS illustration, localized HTML metadata. No application server or database.

- `src/locales`: complete UI dictionaries and locale metadata.
- `src/lib/analytics.ts`: typed event abstraction; default no-op. Runtime payload allowlist is only the locale enum. No analytics provider, cookies or identifiers.
- `public/data/source-registry.json`: candidate sources with owner, URL, use, terms, attribution and refresh policy; every entry remains PENDING_REVIEW / productionEnabled=false. Null review/fetch dates are intentional, not missing successful reviews.
- `scripts/prerender.tsx`: validates the registry and emits localized HTML plus a build provenance manifest with zero ingested sources.
- `public/_headers`: static Pages headers. Geolocation is disabled in M0.0; future explicit permission flow needs an authorized change.

Foundation pages are `noindex` until real functionality and safety-copy review are ready. Japanese recognition labels are retained in `src/i18n.ts`; foundation provides no safety instructions or vehicle fuel decisions. Locale preference lives in the URL, not device storage.

## Cloudflare Pages

Uses prebuilt static assets via Direct Upload. No Cloudflare Functions, Workers runtime, bindings or database.

```sh
npx wrangler login
npm run deploy
```

The `fuel-me-japan` Pages project has already been created. Initial creation on Wrangler 4.144.0 required `wrangler pages project create fuel-me-japan --production-branch main --force` because its agent-specific automatic Workers delegation failed. The inspected CLI uses this flag to select Pages for a new project, not to overwrite one. Subsequent deployments target the existing Pages project without this flag.

`deploy` runs all checks before uploading `dist` to the production branch. Cloudflare credentials must remain in local Wrangler authentication, never in Git. No automatic deploy hook or recurring job is installed.

Cloudflare documents that a Direct Upload project cannot later be switched to Git integration in place: https://developers.cloudflare.com/pages/get-started/direct-upload/

## Scope and evidence

Original frozen specs: `Fuel-Me-Japan-M0-Handoff-Package/` (00–10, unchanged).
Completion and outstanding acceptance: `reports/M0.0-completion.md`.
No data ingestion or new source rights are implied by this foundation. No M0.1 work is authorized.
