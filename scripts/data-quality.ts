/** Offline observation coverage. No requests, data promotion, or analytics collection. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parseDataManifest, parseStationFile, parsePriceFile, type Station, type Artifact } from "../src/lib/stations";
import { parseManifest, parseIndex, parsePartition, type RentalArtifact, type RentalLocation } from "../src/lib/rental";
import { validateRegistry } from "../src/lib/source-registry";
import { returnCandidates } from "../src/lib/return-car";
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
    prices: { referenceRecords: prices.records.length, surveyDate: prices.surveyDate, publishedAt: prices.publishedAt,
      stationQuoteRecords: STATION_QUOTES.length, note: "都道府县参考价不能作为单站报价；统计日期不是资料刷新日期。" },
    national: { stations: stationCoverage(stations), rentals: rentalCoverage(rentals) },
    regions: targetRegions.map(region => ({ ...region,
      stations: stationCoverage(stations.filter(row => (region.codes as readonly string[]).includes(row.prefectureCode))),
      rentals: rentalCoverage(rentals.filter(row => (region.codes as readonly string[]).includes(row.prefectureCode))),
    })),
    airportReviewQueue: airportReviewQueue(stations, rentals),
    queueNote: "候选复用现有10公里直线距离与油种NO排除逻辑；前三条只是核对抽样，不是路线或加油推荐。OSM更新时间不是现场核验时间；车辆入口仍未核实。",
    attribution: { text: "© OpenStreetMap 贡献者；租车资料来源与原始许可见全国manifest。",
      copyrightUrl: "https://www.openstreetmap.org/copyright", license: "ODbL-1.0",
      stationDownloads: "/data/manifest.json", rentalDownloads: "/data/rental/nationwide/manifest.json" },
  };
}

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!["--as-of", "--output"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--"))
      throw new Error("用法：npm run data:quality -- [--as-of YYYY-MM-DD] [--output /tmp/quality.json]");
    if (args[i] in options) throw new Error("重复的参数");
    options[args[i]] = args[i + 1];
  }
  const publicRoot = resolve("public");
  const output = options["--output"] ? resolve(options["--output"]) : undefined;
  if (output && (output === publicRoot || output.startsWith(publicRoot + sep))) throw new Error("质量报告不能写入生产数据目录");
  const report = await buildQualityReport(publicRoot, options["--as-of"] ?? new Date().toISOString().slice(0, 10));
  const text = JSON.stringify(report, null, 2) + "\n";
  if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, text); console.log(`质量报告已生成：${output}`); }
  else process.stdout.write(text);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
