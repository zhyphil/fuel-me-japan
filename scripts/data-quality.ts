/** Offline observation coverage. No requests, data promotion, or analytics collection. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDataManifest, parseStationFile, parsePriceFile, type Station, type Artifact } from "../src/lib/stations";
import { parseManifest, parseIndex, parsePartition, type RentalArtifact, type RentalLocation } from "../src/lib/rental";
import { validateRegistry } from "../src/lib/source-registry";
import { returnCandidates } from "../src/lib/return-car";
import { applyReviewedStationFacts, stationReviews, stationReviewMatches } from "../src/lib/station-review";
import { STATION_QUOTES } from "../src/lib/station-price-view";

export const targetRegions = [
  { id: "hokkaido", label: "北海道", codes: ["JP-01"] },
  { id: "okinawa", label: "冲绳", codes: ["JP-47"] },
  { id: "kyushu", label: "九州七县（不含另列的冲绳）", codes: ["JP-40", "JP-41", "JP-42", "JP-43", "JP-44", "JP-45", "JP-46"] },
] as const;

export function stationCoverage(stations: Station[]) {
  const count = stations.length;
  const textFields = ["name", "address", "openingHours", "originalBrand"] as const;
  const stateFields = ["fuelRegular", "fuelHighOctane", "fuelDiesel", "paymentVisa", "paymentMastercard"] as const;
  const text = Object.fromEntries(textFields.map(field => {
    const recorded = stations.filter(row => row[field]?.trim()).length;
    return [field, { recorded, missing: count - recorded }];
  }));
  const triState = Object.fromEntries(stateFields.map(field => [field, {
    YES: stations.filter(row => row[field] === "YES").length,
    NO: stations.filter(row => row[field] === "NO").length,
    UNKNOWN: stations.filter(row => row[field] === "UNKNOWN").length,
  }]));
  return { count, text, triState, serviceType: {
    SELF: stations.filter(row => row.serviceType === "SELF").length,
    FULL: stations.filter(row => row.serviceType === "FULL").length,
    UNKNOWN: stations.filter(row => row.serviceType === "UNKNOWN").length,
  } };
}

export function rentalCoverage(rows: RentalLocation[]) {
  return {
    count: rows.length,
    counters: rows.filter(row => row.candidateStatus === "COUNTER_ONLY").length,
    nonCounters: rows.filter(row => row.candidateStatus !== "COUNTER_ONLY").length,
    officialFacilities: rows.filter(row => row.verification === "OFFICIAL_FACILITY_CHECKED").length,
    missingAddress: rows.filter(row => !row.address?.trim()).length,
    missingPhone: rows.filter(row => !row.phones.length).length,
    missingWebsite: rows.filter(row => !row.websites.length).length,
    entrancesNotVerified: rows.filter(row => row.vehicleEntranceStatus === "NOT_VERIFIED").length,
  };
}

export function airportReviewQueue(stations: Station[], rentals: RentalLocation[]) {
  return rentals.filter(row => row.official && ["CTS", "OKA", "FUK"].includes(row.airportCode ?? ""))
    .sort((a, b) => a.id.localeCompare(b.id, "en"))
    .map(rental => {
      const regular = returnCandidates(stations, rental, "REGULAR");
      const highOctane = returnCandidates(stations, rental, "HIGH_OCTANE");
      const diesel = returnCandidates(stations, rental, "DIESEL");
      return {
        rentalId: rental.id, airportCode: rental.airportCode, companyId: rental.companyId,
        name: rental.names.primary, officialUrl: rental.official!.url,
        checkedAt: rental.official!.checkedAt, vehicleEntranceStatus: rental.vehicleEntranceStatus,
        eligibleCandidatesWithin10Km: { REGULAR: regular.length, HIGH_OCTANE: highOctane.length, DIESEL: diesel.length },
        nearestRegularCandidates: regular.slice(0, 3).map(station => ({
          stationId: station.id, prefectureCode: station.prefectureCode, name: station.name ?? null,
          brand: station.originalBrand ?? null, address: station.address ?? null,
          lat: station.lat, lon: station.lon, straightLineDistanceKm: Number(station.distanceKm.toFixed(3)),
          objectLastModifiedAt: station.sourceUpdatedAt,
          osmUrl: `https://www.openstreetmap.org/${station.osmType}/${station.osmId}`,
          fieldsToCheck: [
            ...(!station.name ? ["name"] : []), ...(!station.address ? ["address"] : []),
            ...(!station.openingHours ? ["openingHours"] : []),
            ...(station.serviceType === "UNKNOWN" ? ["serviceType"] : []),
            ...(station.fuelRegular === "UNKNOWN" ? ["fuelRegular"] : []),
            ...(station.paymentVisa === "UNKNOWN" ? ["paymentVisa"] : []),
            ...(station.paymentMastercard === "UNKNOWN" ? ["paymentMastercard"] : []),
          ],
        })),
      };
    });
}

export async function readCheckedArtifact(publicRoot: string, artifact: Artifact | RentalArtifact) {
  const url = "path" in artifact ? artifact.path : artifact.url;
  const root = resolve(publicRoot);
  const file = resolve(root, `.${url}`);
  if (!url.startsWith("/data/") || !file.startsWith(root + sep)) throw new Error("资料路径超出公开数据目录");
  const bytes = await readFile(file);
  if (bytes.length !== artifact.bytes || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256)
    throw new Error(`资料大小或校验和不匹配：${url}`);
  return bytes;
}

export async function buildQualityReport(publicRoot: string, asOf: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0, 10) !== asOf)
    throw new Error("统计日期无效");
  const root = resolve(publicRoot);
  const manifestBytes = await readFile(resolve(root, "data/manifest.json"));
  const manifest = parseDataManifest(JSON.parse(manifestBytes.toString("utf8")));
  const rentalManifestBytes = await readFile(resolve(root, "data/rental/nationwide/manifest.json"));
  const rentalManifest = parseManifest(JSON.parse(rentalManifestBytes.toString("utf8")));
  if (asOf < manifest.stations.sourceUpdatedAt.slice(0, 10) || asOf < manifest.prices.publishedAt || asOf < rentalManifest.reviewDate)
    throw new Error("统计日期早于所读取资料的日期");
  let checkedArtifacts = 0;
  const read = async (artifact: Artifact | RentalArtifact) => {
    const bytes = await readCheckedArtifact(root, artifact); checkedArtifacts += 1; return bytes;
  };
  const registry = JSON.parse((await read(manifest.sourceRegistry)).toString("utf8"));
  const registryErrors = validateRegistry(registry, manifest);
  if (registryErrors.length) throw new Error(registryErrors.join("\n"));
  const stations: Station[] = [];
  for (const partition of manifest.stations.partitions) {
    const data = parseStationFile(JSON.parse((await read(partition)).toString("utf8")), partition, manifest.stations.version);
    stations.push(...data.stations);
  }
  await read(manifest.stations.audit);
  const prices = parsePriceFile(JSON.parse((await read(manifest.prices)).toString("utf8")), manifest.prices);
  if (stations.length !== manifest.stations.count || new Set(stations.map(row => row.id)).size !== stations.length)
    throw new Error("加油站总数不符或跨分区重复");
  const rentalArtifacts = new Map<string, Buffer>();
  for (const artifact of rentalManifest.downloads) rentalArtifacts.set(artifact.url, await read(artifact));
  const index = parseIndex(JSON.parse(rentalArtifacts.get(rentalManifest.index.url)!.toString("utf8")), rentalManifest);
  const rentals: RentalLocation[] = [];
  for (const partition of rentalManifest.partitions) {
    rentals.push(...parsePartition(JSON.parse(rentalArtifacts.get(partition.url)!.toString("utf8")), rentalManifest, index).records);
  }
  if (rentals.length !== rentalManifest.count || new Set(rentals.map(row => row.id)).size !== rentals.length)
    throw new Error("租车记录总数不符或跨分区重复");
  return {
    schemaVersion: 1, asOf,
    interpretation: "只统计当前快照已记录字段；不是全国实际门店覆盖率、实时营业状态、实际油种供应率或外国信用卡接受率。UNKNOWN不计为YES或NO。",
    inputs: {
      stationManifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
      stationVersion: manifest.stations.version, stationSnapshotAt: manifest.stations.sourceUpdatedAt,
      rentalManifestSha256: createHash("sha256").update(rentalManifestBytes).digest("hex"),
      rentalVersion: rentalManifest.version, rentalReviewDate: rentalManifest.reviewDate,
      checkedArtifacts,
    },
    stationSupplements: {
      reviewed: stationReviews.length,
      applied: stationReviews.filter(review => stations.some(station => station.id === review.osm.id && stationReviewMatches(station, review))).length,
      inactiveIds: stationReviews.filter(review => !stations.some(station => station.id === review.osm.id && stationReviewMatches(station, review))).map(review => review.osm.id),
      note: "人工有限事实单独列出；OSM原始字段覆盖统计不改写。上游记录变动后停止套用补充，重新核对后才恢复。",
    },
    prices: { referenceRecords: prices.records.length, surveyDate: prices.surveyDate, publishedAt: prices.publishedAt,
      stationQuoteRecords: STATION_QUOTES.length, note: "都道府县参考价不能作为单站报价；统计日期不是资料刷新日期。" },
    national: { stations: stationCoverage(stations), displayedStations: stationCoverage(stations.map(applyReviewedStationFacts)), rentals: rentalCoverage(rentals) },
    regions: targetRegions.map(region => ({ ...region,
      stations: stationCoverage(stations.filter(row => (region.codes as readonly string[]).includes(row.prefectureCode))),
      displayedStations: stationCoverage(stations.filter(row => (region.codes as readonly string[]).includes(row.prefectureCode)).map(applyReviewedStationFacts)),
      rentals: rentalCoverage(rentals.filter(row => (region.codes as readonly string[]).includes(row.prefectureCode))),
    })),
    airportReviewQueue: airportReviewQueue(stations, rentals),
    queueNote: "候选复用现有10公里直线距离与油种NO排除逻辑；前三条只是核对抽样，不是路线或加油推荐。OSM更新时间不是现场核验时间；车辆入口仍未核实。",
    attribution: { text: "© OpenStreetMap 贡献者；租车资料来源与原始许可见全国manifest。",
      copyrightUrl: "https://www.openstreetmap.org/copyright", license: "ODbL-1.0",
      stationDownloads: "/data/manifest.json", rentalDownloads: "/data/rental/nationwide/manifest.json" },
  };
}

export type QualityReport = Awaited<ReturnType<typeof buildQualityReport>>;
export function compareQualityReports(before: QualityReport, after: QualityReport) {
  const changes: { field: string; before: number; after: number; delta: number }[] = [];
  function compare(a: unknown, b: unknown, path: string) {
    if (typeof a === "number" && typeof b === "number" && a !== b) changes.push({ field: path, before: a, after: b, delta: b - a });
    else if (a && b && typeof a === "object" && typeof b === "object") {
      for (const key of Object.keys(a)) if (Object.hasOwn(b, key)) compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], `${path}.${key}`);
    }
  }
  // Earlier schema-1 baselines had only raw coverage. Treat that as their
  // displayed coverage so an added supplement cannot silently disappear.
  compare({ ...before.national, displayedStations: before.national.displayedStations ?? before.national.stations }, after.national, "national");
  for (const region of before.regions) {
    const next = after.regions.find(item => item.id === region.id);
    if (next) compare({ ...region, displayedStations: region.displayedStations ?? region.stations }, next, `regions.${region.id}`);
  }
  const changedManifests = [
    ...(before.inputs.stationManifestSha256 !== after.inputs.stationManifestSha256 ? ["stations"] : []),
    ...(before.inputs.rentalManifestSha256 !== after.inputs.rentalManifestSha256 ? ["rentals"] : []),
  ];
  const alerts = [
    ...(after.inputs.stationSnapshotAt < before.inputs.stationSnapshotAt ? ["加油站来源日期倒退"] : []),
    ...(after.inputs.rentalReviewDate < before.inputs.rentalReviewDate ? ["租车审核日期倒退"] : []),
    ...(after.prices.surveyDate < before.prices.surveyDate || after.prices.publishedAt < before.prices.publishedAt ? ["参考价来源日期倒退"] : []),
    ...(after.stationSupplements.inactiveIds.length ? ["上游记录发生变化，部分官方事实补充已停用，须重新核对身份"] : []),
  ];
  return { schemaVersion: 1, comparedAt: after.asOf, changedManifests, changes, alerts,
    decision: changedManifests.length || changes.length || alerts.length || JSON.stringify(before.prices) !== JSON.stringify(after.prices) ? "REVIEW_REQUIRED" : "UNCHANGED",
    note: "只比较经过校验的离线候选。UNCHANGED不是来源更新成功；发布与真实HTTP失败仍以工作流结果和诊断为准。不得自动提交或部署。",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--as-of", "--output", "--compare", "--changes-output"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error("用法：npm run data:quality -- [--as-of YYYY-MM-DD] [--output /tmp/quality.json] [--compare /tmp/before.json --changes-output /tmp/changes.json]");
    if (args[i] in options) throw new Error("重复的参数");
    options[args[i]] = args[i + 1];
  }
  const publicRoot = resolve("public");
  const output = options["--output"] ? resolve(options["--output"]) : undefined;
  if (output && (output === publicRoot || output.startsWith(publicRoot + sep))) throw new Error("质量报告不能写入生产数据目录");
  if (Boolean(options["--compare"]) !== Boolean(options["--changes-output"])) throw new Error("差异比较须同时提供比较输入与输出");
  const changesOutput = options["--changes-output"] ? resolve(options["--changes-output"]) : undefined;
  if (changesOutput && (changesOutput === publicRoot || changesOutput.startsWith(publicRoot + sep))) throw new Error("差异报告不能写入生产数据目录");
  const report = await buildQualityReport(publicRoot, options["--as-of"] ?? new Date().toISOString().slice(0, 10));
  if (changesOutput) {
    const before = JSON.parse(await readFile(resolve(options["--compare"]), "utf8")) as QualityReport;
    if (before.schemaVersion !== 1 || !before.inputs?.stationManifestSha256 || !before.inputs?.rentalManifestSha256 || !before.prices?.surveyDate || !before.national || !Array.isArray(before.regions)) throw new Error("比较输入不是质量报告");
    await mkdir(dirname(changesOutput), { recursive: true });
    await writeFile(changesOutput, JSON.stringify(compareQualityReports(before, report), null, 2) + "\n");
  }
  const text = JSON.stringify(report, null, 2) + "\n";
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, text); console.log(`质量报告已生成：${output}`); }
  else process.stdout.write(text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
