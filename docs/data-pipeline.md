# M0.1 data pipeline

This is an offline build pipeline. Browsers load checked regional JSON from the same site. There is no backend, database, runtime Overpass query, station-live price feed, or gogo.gs ingestion.

## Reproduce the accepted snapshot

Use Node 24+, Python 3.13+, and `osmium-tool` (initial import: 1.19.1 / libosmium 2.23.1). Install Python dependencies in a virtual environment with `pip install -r requirements-data.txt`; use the locked npm dependencies with `npm ci`.

Raw PBF, GeoJSON sequence, workbook and environment files must remain outside `public/` and Git. Their filename extensions are ignored. The initial source URLs, checksums and observations are recorded in `reports/M0.1-data.md` and the deployed manifest.

```sh
python scripts/importer/pipeline.py refresh all \
  --pbf /path/to/japan-YYMMDD.osm.pbf \
  --osm-metadata /path/to/osm-metadata.json \
  --workbook /path/to/YYMMDD.xlsx \
  --price-metadata /path/to/price-metadata.json
npm run test:data
npm run check
```

Only the first import into an empty output directory uses `--bootstrap`. A refresh checks its existing baseline. A count movement above 25% in any partition, or a newly nonempty UNKNOWN partition, stops promotion. An exceptional change requires investigation followed by `--review-count-change "documented review reason"`; it must never be added automatically.

OSM metadata includes exact HTTPS source URL, SHA-256, byte count, publisher MD5 and timezone-qualified fetch timestamp. Price metadata includes exact official workbook URL, SHA-256, byte count, fetch time, publication and survey dates. Metadata must describe the actual acquired file, not a planned download. The registry's owner, purpose, terms/license, allowed-use assessment, attribution, refresh policy and review date must pass before ingestion.

The reproducible OSM path reads the original PBF, filters `nwr/amenity=fuel` and `r/admin_level=4`, then exports with typed OSM IDs and timestamps. An optional existing GeoJSON sequence is accepted only with a derivation descriptor tying its SHA-256, filter and exported attributes to that exact verified PBF. Original inputs remain external to the repository.

## Automatic checks and manual fallback

```sh
python scripts/importer/refresh_sources.py osm --download-dir /tmp/fmj-raw
python scripts/importer/refresh_sources.py prices --download-dir /tmp/fmj-raw
```

Discovery selects an actual dated link on the reviewed publisher page. It does not guess a date filename or substitute a different source. OSM downloads verify the publisher MD5 plus SHA-256. Price downloads parse the reviewed workbook before import. HTTP errors, a changed index/layout, checksum errors, older surveys and invalid coverage stop the run.

The optional exact-URL official workbook download is also available as `npm run data:fetch-price -- --url <listed-official-XLSX-URL> --destination /path/to/new.xlsx`. A 403 must remain a failure. If the official browser download works, retain its actual bytes and record a source metadata file, then use the local workbook import. No alternate website or scraped station prices are permitted.

`.github/workflows/data-refresh.yml` checks OSM weekly (Monday 00:00 UTC), and official prices Wednesday 06:00/10:00/14:00 and Thursday 06:00 UTC. It can also be run manually for either dataset. It installs pinned importer dependencies, executes parser tests and the full app check, and uploads only a validated data candidate and build provenance. Its repository permission is read-only: it cannot push or deploy. Review the candidate, incorporate its complete `public/data` snapshot, run checks and release through the normal approved release process. No candidate is a production update by itself.

2026-10-01当前状态：工作流已经在默认分支运行。OSM真实运行36762528314于2026-09-30成功，候选与当时公开快照一致；最新官方参考价运行36864186412于2026-10-01在DISCOVERY阶段返回HTTP403，诊断确认旧manifest与registry保持。不能报告正常的无人值守参考价更新；初始工作簿经官方浏览器链接取得也不能证明自动获取已成功。具体流程和当前来源日期见 [维护手册](data-maintenance.md)。

## Normalization and publication gates

- Typed object IDs (`osm:node:…`, `osm:way:…`, `osm:relation:…`) avoid cross-type collisions. Duplicate representations of the same closed way prefer its area geometry; this does not deduplicate separate OSM objects that happen to describe one business.
- Nodes retain their point, areas use a point on their surface, and lines use a midpoint. These are station coordinates, not validated driveway entrances. Empty/unusable geometry blocks publication. Geometry repairs are explicit in the audit; none were needed for the initial source.
- Spatial membership uses the 47 OSM prefecture relation geometries. No nearest-prefecture guessing. Zero/multiple memberships remain UNKNOWN with the reason recorded. Unknown stations remain downloadable and eligible for geographic proximity search.
- Bounds cover Japan including distant islands (20–46 latitude, 122–155 longitude). Every station requires a unique ID, valid coordinates, observed timestamp and valid enums. Empty output is rejected.
- Original brand is retained; only reviewed exact aliases are normalized. Missing, conflicting or time-conditional payment/fuel information stays UNKNOWN. Broad `fuel:gasoline` or octane tags are not guessed into Japanese retail categories.
- SELF requires an explicit self-service tag without conflicting attended-service evidence; FULL requires explicit `self_service=no` and `full_service=yes`. Mixed, missing or conditional service stays UNKNOWN. These are OSM observations, not current operating guarantees.
- The official workbook's prefectural sheet must have the expected cash/tax/unit headers and coherent survey/publication dates. Current columns D/F/H yield exactly 47 × 3 values; previous-week columns, kerosene and regional aggregates are excluded. 北海道局 and 沖縄局 are their corresponding prefectures. Each value must be finite and 50–400 JPY/L. Older replacement is rejected.
- Station and price data remain separate. No station record has a price. The core registry retains disabled source candidates for gogo and generic rental guidance; they do not authorize ingestion. gogo paid integration is deferred. The independent rental module uses its separately reviewed source manifest and limited official facts, documented in [rental-data.md](rental-data.md).

## Versioning, integrity and failure handling

`public/data/manifest.json` is the authoritative snapshot pointer. It references immutable regional files, price archive, transform audit and a source-registry snapshot, all with byte counts and SHA-256. Files are written before an atomic final pointer replacement. A handled final-pointer write failure restores the previous human-readable registry alias; the previous manifest still references its intact immutable registry. Unreferenced staged artifacts are never loaded.

Unchanged input hashes and transformation version leave the pointer, content and fetch timestamps unchanged. A transformation-version change requires refreshing both datasets together. Every app build validates all referenced artifacts and source approvals before it can succeed, then emits `build-provenance.json`. Browser loads verify the referenced regional file's size, hash, schema and provenance. Source failures never deploy anything; the live site retains its last released snapshot.

Geolocation selects intersecting occupied geographic cells across prefecture borders and fetches only relevant partitions, then computes Haversine distances within 50 km. Manual selection fetches one prefecture and supplies no user-relative distances. User coordinates are ephemeral in browser memory; they are not needed by the importer.

## Distribution and source references

The complete OSM derivative is available through all `stations.partitions[*].path` entries in `/data/manifest.json`, including UNKNOWN, without registration. `/data/OSM-NOTICE.txt` offers the derivative and its spatial metadata/audit under ODbL 1.0. Preserve the visible attribution and license links when redistributing it. Official price facts are a separately attributed dataset.

Reviewed sources (2026-09-30): [OSM copyright](https://www.openstreetmap.org/copyright), [Geofabrik Japan](https://download.geofabrik.de/asia/japan.html), [OSM fuel service semantics](https://wiki.openstreetmap.org/wiki/Tag:amenity=fuel#Service), [official survey index](https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html), [agency reuse terms](https://www.enecho.meti.go.jp/about/linksto_thissite/), [Public Data License 1.0](https://www.digital.go.jp/resources/open_data/public_data_license_v1.0).

## 2026-09-30 后续核验与诊断

GitHub 真实参考价定时运行 `36761672931` 在官方索引返回 HTTP 403 后失败；本机复核同样为403，manifest及registry的前后哈希一致。不能称为自动参考价更新成功。OSM远端候选任务另行记录实际结果。

更新程序支持 `--report /tmp/fmj-refresh-report.json`，报告失败阶段、准确来源URL、开始结束时间以及前后数据指针SHA-256；报告必须在发布数据目录外。工作流先运行导入器回归，再获取来源；即使来源失败也上传诊断文件，仍只有完整验证成功时才上传候选数据，不自动发布。

历史中文报告见 `reports/data-maintenance-completion.md`；2026-10-01最新诊断与字段基线见 [维护手册](data-maintenance.md)和[本轮报告](../reports/validation-foundation-20261001.md)。重跑统计不会刷新来源日期。
