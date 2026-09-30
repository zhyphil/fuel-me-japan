import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import { locales, messages, type Locale } from "../src/i18n";
import { createHash } from "node:crypto";
import { parseDataManifest, parseStationFile, parsePriceFile, type Artifact } from "../src/lib/stations";
import { validateRegistry } from "../src/lib/source-registry";
import { fieldGuideProvenance, validateFieldGuideSources, validateGuideMessages } from "../src/lib/field-guide";
import { parseRentalData, rentalDataUrl } from "../src/lib/return-car";

const rentalBytes = await readFile(`dist${rentalDataUrl}`);
const rentalData = parseRentalData(JSON.parse(rentalBytes.toString("utf8")));
await readFile(`dist${rentalData.osm.noticeUrl}`, "utf8");
for (const locale of locales) for (const row of rentalData.records) {
  if (!messages[locale][row.nameKey]?.trim()) throw new Error(`还车门店缺少本地化名称：${locale}/${row.id}`);
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
function render(locale: Locale) {
  return shell
    .replace('<html lang="en">', `<html lang="${locale}">`)
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escape(messages[locale].pageTitle)}</title>`,
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escape(messages[locale].description)}" />`,
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="${siteOrigin}/${locale}/" />\n${locales.map((language) => `<link rel="alternate" hreflang="${language}" href="${siteOrigin}/${language}/" />`).join("\n")}<link rel="alternate" hreflang="x-default" href="${siteOrigin}/en/" /></head>`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(<App locale={locale} />)}</div>`,
    );
}
for (const locale of locales) {
  await mkdir(`dist/${locale}`, { recursive: true });
  await writeFile(`dist/${locale}/index.html`, render(locale));
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
      rentalLocations: { path: rentalDataUrl, sha256: createHash("sha256").update(rentalBytes).digest("hex"), count: rentalData.count, reviewDate: rentalData.reviewDate, transformationVersion: rentalData.transformationVersion, sourceIds: rentalData.sources.map(source => source.id), note: "仅三条Times门店事实核对；不表示公司整库授权。" },
      surveyDate: manifest.prices.surveyDate,
      publishedAt: manifest.prices.publishedAt,
      note: "OSM 覆盖不完整；官方都道府县参考价与站点数据分开存储。没有站点即时报价。导入器不执行定时调度或部署。",
    },
    null,
    2,
  ),
);
console.log(
  "Prerendered five locales + English root; source registry validated; provenance emitted.",
);
