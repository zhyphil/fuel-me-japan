import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import { locales, messages, type Locale } from "../src/i18n";
import { createHash } from "node:crypto";
import { parseDataManifest, parseStationFile, parsePriceFile, type Artifact } from "../src/lib/stations";
import { validateRegistry } from "../src/lib/source-registry";
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
      surveyDate: manifest.prices.surveyDate,
      publishedAt: manifest.prices.publishedAt,
      note: "Partial OSM coverage; official prefectural references are separate from station data. No live station prices. No scheduler or deployment performed by the importer.",
    },
    null,
    2,
  ),
);
console.log(
  "Prerendered five locales + English root; source registry validated; provenance emitted.",
);
