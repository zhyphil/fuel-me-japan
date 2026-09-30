# Fuel Me Japan

Refuel in Japan without speaking Japanese.

**M0.1 Find Fuel local preview.** Find Fuel is the only active task. Rental return, vehicle fuel matching and refuelling guides remain informational, unavailable cards. Stop after the M0.1 report and user review; M0.2+ is not authorized.

The existing production foundation URL is https://fuel-me-japan.com/. Its earlier domain/deployment evidence is in `reports/M0.0-domain-configuration.md`. This M0.1 work has not been pushed or deployed; that URL is not evidence of M0.1 acceptance.

## Local setup

Use Node 24 (`.nvmrc`) and existing npm dependencies. On a fresh development machine:

```sh
npm ci
npx playwright install chromium
npm run dev
```

```sh
npm run check
```

`check` runs lint, TypeScript, unit tests, static build/prerender, then Chromium browser tests against a local preview server. No environment variables are required. Browser tests use mocked geolocation, shipped data and intercepted external navigation; they never request the developer's actual position. Find Fuel screenshots are written to `test-results/find-fuel-*.png` when browser execution succeeds.

The final standard check passed locally with Node 24.18.0: lint, TypeScript, 32 unit tests, build/prerender and 28 Chromium browser tests. The separate importer suite has 16 passing tests. See `reports/M0.1-completion.md` for evidence and limits. Python importer setup and refresh commands are in `docs/data-pipeline.md`.

## Architecture and privacy

React + TypeScript + Vite; static HTML at `/en/`, `/zh-Hant/`, `/ko/`, `/zh-Hans/`, `/th/`, with an English `/` fallback. No backend, database, accounts, internal navigation engine, payments or live-price scraping.

- `src/components/FindFuel.tsx`: explicit location action or manual prefecture selection, recorded city/address filtering, station list/detail, official references and external map links.
- `src/lib/find-fuel.ts`: search, reference-date and destination-only map helpers. Manual search shows no distance; location search shows straight-line distance within 50 km, never driving distance/time.
- `src/lib/stations.ts`: static manifest/artifact validation and regional loading. Manual selection loads one prefecture; nearby selection loads intersecting partitions. There is no runtime Overpass request.
- `src/locales`: exactly five UI dictionaries. Japanese pump labels remain visible. Vehicle fuel is not inferred from station availability.
- `src/lib/analytics.ts`: no-op default; the runtime payload allowlist contains only the locale enum. Precise position remains in panel memory and is not persisted or attached to navigation links. Language preference lives in the URL.
- `public/data/source-registry.json`: OSM, Geofabrik and official METI price data are approved in the current registry; gogo.gs and rental guidance remain pending and disabled.
- `public/data/manifest.json`: versioned station partitions, a separate official price file, checksums, source timestamps and registry snapshot. Build provenance matches the ingested sources.
- `public/data/OSM-NOTICE.txt`: station database attribution, ODbL licensing and source provenance. Data downloads and attribution are visible in the UI.

OSM coverage and tags may be incomplete or old; absent facts remain UNKNOWN. Official prices are dated, cash/tax-included prefectural JPY/litre references, not a station price or live quote. Price load failure leaves station navigation available. References older than 14 days receive a warning. No gogo price is fetched or displayed.

Pages remain `noindex` pending review. Safety-copy review and real-browser acceptance must not be inferred from static checks.

## Refresh and deployment boundaries

The offline importer and `.github/workflows/data-refresh.yml` check weekly OSM and publication-day official prices. The workflow produces a validated candidate artifact with read-only repository permissions; it cannot push or deploy. It has not been activated or executed on GitHub during this local milestone. The official HTTP fetch still returns 403 here; browser-acquired original workbook import is supported. See `docs/data-pipeline.md`.

Cloudflare uses prebuilt static Pages assets. Deployment requires separate authorization and successful checks:

```sh
npx wrangler login
npm run deploy
```

`deploy` uploads `dist` to the production branch after checks. Keep credentials out of Git. The data workflow never uses Cloudflare credentials or deploys to production.

## Scope and evidence

Frozen specifications: `Fuel-Me-Japan-M0-Handoff-Package/00–10` (unchanged).

- Historical foundation evidence: `reports/M0.0-completion.md` and `reports/M0.0-domain-configuration.md`.
- Current completion report, explicit acceptance limits and check output: `reports/M0.1-completion.md` and `reports/evidence/m01/`.
- Data-source provenance and importer verification: `reports/M0.1-data.md`.
