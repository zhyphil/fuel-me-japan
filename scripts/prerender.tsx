import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import { locales, messages, type Locale } from "../src/i18n";
import { createHash } from "node:crypto";
import { parseDataManifest, parseStationFile, parsePriceFile, type Artifact } from "../src/lib/stations";
import { validateRegistry } from "../src/lib/source-registry";
import { fieldGuideProvenance, validateFieldGuideSources, validateGuideMessages } from "../src/lib/field-guide";
import { parseManifest as parseRentalManifest, parseIndex as parseRentalIndex, parsePartition as parseRentalPartition, rentalManifestUrl, type RentalLocation } from "../src/lib/rental";
import { parseRoute } from "../src/lib/routes";

const rentalBytes = await readFile(`dist${rentalManifestUrl}`);
const rentalManifest = parseRentalManifest(JSON.parse(rentalBytes.toString("utf8")));
const rentalArtifacts = new Map<string, Buffer>();
for (const artifact of rentalManifest.downloads) {
  const bytes = await readFile(`dist${artifact.url}`);
  if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error(`租车数据文件校验失败：${artifact.url}`);
  rentalArtifacts.set(artifact.url, bytes);
}
const rentalIndex = parseRentalIndex(JSON.parse(rentalArtifacts.get(rentalManifest.index.url)!.toString("utf8")), rentalManifest);
const rentalIds = new Set<string>();
const reviewedRentalDetails: RentalLocation[] = [];
for (const partition of rentalManifest.partitions) {
  const data = parseRentalPartition(JSON.parse(rentalArtifacts.get(partition.url)!.toString("utf8")), rentalManifest, rentalIndex);
  for (const row of data.records) { if (rentalIds.has(row.id)) throw new Error(`租车门店跨分区重复：${row.id}`); rentalIds.add(row.id); if (row.official) reviewedRentalDetails.push(row); }
}
if (rentalIds.size !== rentalManifest.count) throw new Error("全国租车数据总数不符");
const reviewedRentals = rentalIndex.records.filter(row => row.verification === "OFFICIAL_FACILITY_CHECKED");
for (const locale of locales) for (const row of reviewedRentalDetails) {
  if (!messages[locale][row.official!.summaryKey]?.trim()) throw new Error(`还车机场缺少本地化摘要：${locale}/${row.id}`);
}

const guideSourceBytes = await readFile("dist/field-guides/refuel-sources.json");
const guideSources: unknown = JSON.parse(guideSourceBytes.toString("utf8"));
const guideErrors = [...validateFieldGuideSources(guideSources), ...validateGuideMessages(messages, locales)];
if (guideErrors.length) throw new Error(guideErrors.join("\n"));
if (JSON.stringify(guideSources) !== JSON.stringify(fieldGuideProvenance)) throw new Error("加油指引公开来源记录与构建时配置不一致。");

const manifestBytes = await readFile("dist/data/manifest.json");
const manifest = parseDataManifest(JSON.parse(manifestBytes.toString("utf8")));
async function checkedArtifact(artifact: Artifact) {
  const bytes = await readFile(`dist${artifact.path}`);
  if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error(`Data artifact checksum mismatch: ${artifact.path}`);
  return JSON.parse(bytes.toString("utf8")) as unknown;
}
const registry = await checkedArtifact(manifest.sourceRegistry);
const errors = validateRegistry(registry, manifest);
if (errors.length) throw new Error(errors.join("\n"));
const publicRegistry = JSON.parse(await readFile("dist/data/source-registry.json", "utf8"));
if (JSON.stringify(publicRegistry) !== JSON.stringify(registry)) throw new Error("Public registry differs from manifest snapshot");
const stationIds = new Set<string>();
for (const partition of manifest.stations.partitions) {
  const data = parseStationFile(await checkedArtifact(partition), partition, manifest.stations.version);
  for (const station of data.stations) {
    if (stationIds.has(station.id)) throw new Error(`Duplicate station across partitions: ${station.id}`);
    stationIds.add(station.id);
  }
}
if (stationIds.size !== manifest.stations.count) throw new Error("Station total mismatch");
await checkedArtifact(manifest.stations.audit);
parsePriceFile(await checkedArtifact(manifest.prices), manifest.prices);
await readFile(`dist${manifest.stations.noticeUrl}`, "utf8");
const siteOrigin = "https://fuel-me-japan.com";
const shell = await readFile("dist/index.html", "utf8");
if (!/<meta\s+name="robots"\s+content="noindex(?:,\s*nofollow)?"\s*\/?>/.test(shell)) throw new Error("M0.1 preview must remain noindex until user acceptance");
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function render(locale: Locale, kind: "home" | "directory" | "guide" | "about" = "home") {
  const suffix = { home: "", directory: "return-car/", guide: "refuel-guide/", about: "about/" }[kind];
  const routePath = `/${locale}/${suffix}`;
  const title = kind === "home" ? messages[locale].pageTitle : `${kind === "guide" ? messages[locale].rgTitle : kind === "about" ? messages[locale].aboutTitle : messages[locale].rdTitle} | Fuel Me Japan`;
  const description = kind === "home" ? messages[locale].description : kind === "guide" ? messages[locale].rgIntro : kind === "about" ? messages[locale].aboutIntro : messages[locale].rdIntro;
  return shell
    .replace('<html lang="en">', `<html lang="${locale}">`)
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escape(title)}</title>`,
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escape(description)}" />`,
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="${siteOrigin}${routePath}" />\n${locales.map((language) => `<link rel="alternate" hreflang="${language}" href="${siteOrigin}/${language}/${suffix}" />`).join("\n")}<link rel="alternate" hreflang="x-default" href="${siteOrigin}/en/${suffix}" /></head>`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(<App locale={locale} initialRoute={parseRoute(routePath)} rentalShell={kind === "directory"} />)}</div>`,
    );
}
for (const locale of locales) {
  await mkdir(`dist/${locale}`, { recursive: true });
  await writeFile(`dist/${locale}/index.html`, render(locale));
  await mkdir(`dist/${locale}/return-car`, { recursive: true });
  await writeFile(`dist/${locale}/return-car/index.html`, render(locale, "directory"));
  await mkdir(`dist/${locale}/refuel-guide`, { recursive: true });
  await writeFile(`dist/${locale}/refuel-guide/index.html`, render(locale, "guide"));
  await mkdir(`dist/${locale}/about`, { recursive: true });
  await writeFile(`dist/${locale}/about/index.html`, render(locale, "about"));
}
await writeFile("dist/index.html", render("en"));
await writeFile(
  "dist/build-provenance.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      milestone: "M0.1",
      builtAt: new Date().toISOString(),
      transformationVersion: manifest.transformationVersion,
      sourceRegistry: manifest.sourceRegistry,
      dataManifest: { path: "/data/manifest.json", sha256: createHash("sha256").update(manifestBytes).digest("hex") },
      ingestedSources: manifest.sources,
      stationCount: manifest.stations.count,
      priceRecordCount: manifest.prices.count,
      fieldGuides: { refuel: { path: "/field-guides/refuel-sources.json", sha256: createHash("sha256").update(guideSourceBytes).digest("hex"), reviewDate: fieldGuideProvenance.reviewDate, transformationVersion: fieldGuideProvenance.transformationVersion } },
      rentalLocations: { path: rentalManifestUrl, sha256: createHash("sha256").update(rentalBytes).digest("hex"), count: rentalManifest.count, reviewDate: rentalManifest.reviewDate, transformationVersion: rentalManifest.transformationVersion, version: rentalManifest.version, sourceIds: rentalManifest.sources.map(source => source.id), counterCount: rentalIndex.records.filter(row => row.candidateStatus === "COUNTER_ONLY").length, officialFacilityCount: reviewedRentals.length, reviewedAirports: [...new Set(reviewedRentals.map(row => row.airportCode))].sort(), note: "全国候选库；七机场共18条有限官方事实（7家Times、6家Nippon、5家Toyota），核对地址及归还安排；新增坐标沿用来源参考点，全部车辆入口未核实。非完整覆盖或公司整库授权。" },
      surveyDate: manifest.prices.surveyDate,
      publishedAt: manifest.prices.publishedAt,
      note: "OSM 覆盖不完整；官方都道府县参考价与站点数据分开存储。没有站点即时报价。导入器不执行定时调度或部署。",
    },
    null,
    2,
  ),
);
console.log(
  "已预渲染五语言首页、关于页面、独立加油指引、还车目录壳及英文根目录；全国租车分区及来源许可已校验。",
);
