# Fuel Me Japan

Find fuel stations across Japan, in your language.

**M0.1 地图增强已发布。** 首页保留地图模式，包含列表排序与收藏、总地图及逐站小地图、悬停联动、油种多选和文字点击崩溃修复。用户已授权发布，并继续 M0.2「我的车辆用油」。

正式网站：https://fuel-me-japan.com/ 。本次发布记录见[中文发布报告](reports/M0.1-enhancements-release.md)。历史发布和基础配置保留在 `reports/M0.1-release.md` 与 `reports/M0.0-domain-configuration.md`。

最终完整检查通过 lint、typecheck、180 项单元测试、构建和 152 项浏览器测试；发布前源码与证据快照一致，生产 HTTP 与实际页面交互已核验。详见[中文修复报告](reports/M0.1-fuel-label-fix.md)。gogo.gs 咨询已由用户发送，仍待答复，站点即时报价尚未接入。

## M0.2 当前状态

“我的用油”入口、手动油种下拉菜单、地图联动和本地偏好保存已发布到正式网站，代码提交 `511cf9c`，Cloudflare 部署 `232c2e4c`。已通过 lint、typecheck、247 项单元测试、构建及 179 项浏览器测试；正式域名 19 项资源比对与实际油种选择、刷新保存通过。详见[中文发布报告](reports/M0.2-release.md)。

真实车型映射仍为空，五语言安全文案的独立审核仍待完成；手动显示偏好不代表车型用油已核验，完整 M0.2 数据验收仍未完成。初始[本地阶段报告](reports/M0.2-completion.md)、[手动设置报告](reports/M0.2-manual-fuel.md)和[来源核查](reports/M0.2-source-review.md)保留历史记录。

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

`check` runs lint, TypeScript, unit tests, static build/prerender, then Chromium browser tests against a local preview server. No environment variables are required. Browser tests use mocked geolocation, shipped data and intercepted external navigation/basemap tiles (synthetic PNG); they never request the developer's actual position. Find Fuel screenshots are written to `test-results/find-fuel-*.png` when browser execution succeeds.

For the previously published map version, the standard check passed locally with Node 24.18.0: lint, TypeScript, 138 unit tests, build/prerender and 82 Chromium browser tests. The current published enhancement has 180 passing unit tests and 152 passing Chromium browser tests after the fuel-label crash fix; see `reports/M0.1-fuel-label-fix.md` for the final complete check. The separate importer suite has 16 passing tests. See the Chinese `reports/M0.1-map-zoom.md`, `reports/M0.1-filters.md` and `reports/M0.1-completion.md` for evidence and limits. Python importer setup and refresh commands are in `docs/data-pipeline.md`.

## Architecture and privacy

React + TypeScript + Vite; static HTML at `/en/`, `/zh-Hant/`, `/ko/`, `/zh-Hans/`, `/th/`, with an English `/` fallback. No backend, database, accounts, internal navigation engine, payments or live-price scraping.

- `src/components/FindFuel.tsx`: explicit location action or manual prefecture selection, recorded city/address filtering, station list/detail, official references and destination-only navigation links. General external map search is removed following user review.
- `src/components/FuelMap.tsx` and `src/lib/map-view.ts`: client-only Leaflet map, regional summaries, viewport clustering, overlap selection and responsive detail focus. Panning does not load another prefecture.
- `public/runtime-map-provider.json`: separate OSM basemap service record. Tile requests reveal the viewed area and ordinary network information to the provider; no prefetch or offline tile storage. The data registry and POI hashes are unchanged.
- `src/lib/find-fuel.ts`: search, reference-date and destination-only map helpers. Manual search shows no distance; location search shows straight-line distance within 50 km, never driving distance/time.
- `src/lib/opening-hours.ts`: conservative display-only localization of recorded OSM hours in five locales, with the complete source retained for unsupported rules. No open-now calculation.
- `src/lib/stations.ts`: static manifest/artifact validation and regional loading. Manual selection loads one prefecture; nearby selection loads intersecting partitions. There is no runtime Overpass request.
- `src/locales`: exactly five UI dictionaries. Japanese pump labels remain visible. Vehicle fuel is not inferred from station availability.
- `src/lib/analytics.ts`: no-op default; the runtime payload allowlist contains only the locale enum. Precise position remains in panel memory and is not persisted or attached to navigation links. Language preference lives in the URL.
- `public/data/source-registry.json`: OSM, Geofabrik and official METI price data are approved in the current registry; gogo.gs and rental guidance remain pending and disabled.
- `public/data/manifest.json`: versioned station partitions, a separate official price file, checksums, source timestamps and registry snapshot. Build provenance matches the ingested sources.
- `public/data/OSM-NOTICE.txt`: station database attribution, ODbL licensing and source provenance. Data downloads and attribution are visible in the UI.

OSM coverage and tags may be incomplete or old; absent facts remain UNKNOWN. Official prices are dated, cash/tax-included prefectural JPY/litre references, not a station price or live quote. Price load failure leaves station navigation available. References older than 14 days receive a warning. No gogo price is fetched or displayed.

Pages remain `noindex` pending review. Safety-copy review and real-browser acceptance must not be inferred from static checks.

## Refresh and deployment boundaries

The offline importer and `.github/workflows/data-refresh.yml` check weekly OSM and publication-day official prices. The workflow produces a validated candidate artifact with read-only repository permissions; it cannot push or deploy. Its actual scheduled execution has not yet been verified; entering the default branch makes its configured schedule eligible to run. The official HTTP fetch still returns 403 here; browser-acquired original workbook import is supported. See `docs/data-pipeline.md`.

Cloudflare uses prebuilt static Pages assets. The reviewed M0.1 enhancements are published under the latest authorization in `AGENTS.md`. M0.2 work follows separately and does not form part of that reviewed deployment. Future deployments require task authorization and successful checks:

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
