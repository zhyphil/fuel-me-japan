/** Static data contracts. No location permission, persistence or analytics here. */
export type TriState = "YES" | "NO" | "UNKNOWN";
export type ServiceType = "SELF" | "FULL" | "UNKNOWN";
export type FuelType = "REGULAR" | "HIGH_OCTANE" | "DIESEL";
export type PrefectureCode = `JP-${string}`;
export type PartitionCode = PrefectureCode | "UNKNOWN";
export type BBox = [number, number, number, number]; // west, south, east, north
export interface Coordinates { lat: number; lon: number }
export interface Station extends Coordinates {
  id: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  name?: string;
  originalBrand?: string;
  normalizedBrand?: string;
  address?: string;
  openingHours?: string;
  serviceType: ServiceType;
  paymentVisa: TriState;
  paymentMastercard: TriState;
  fuelRegular: TriState;
  fuelHighOctane: TriState;
  fuelDiesel: TriState;
  gogoUrl?: string; // Reserved contract field: rejected until verified mappings are approved.
  sourceUpdatedAt: string;
  prefectureCode: PartitionCode;
  city?: string; // Only observed addr:city, never inferred from prefecture.
  source: "osm";
  positionMethod: "OSM_NODE" | "SURFACE_POINT" | "LINE_MIDPOINT";
}
export type TypedStation = Station;
export interface OfficialReferencePrice {
  prefectureCode: PrefectureCode;
  fuelType: FuelType;
  priceJpy: number;
  surveyDate: string;
  publishedAt: string;
  fetchedAt: string;
  sourceUrl: string;
}
export interface Artifact { path: string; sha256: string; bytes: number }
export interface StationPartition extends Artifact {
  code: PartitionCode;
  count: number;
  bbox: BBox | null;
  cells: BBox[];
}
export interface SourceProof {
  sourceId: "osm" | "geofabrik" | "meti-prices";
  sourceUrl: string;
  inputSha256: string;
  fetchedAt: string;
  sourceUpdatedAt: string;
  transformationVersion: string;
}
export interface DataManifest {
  schemaVersion: 1;
  milestone: "M0.1";
  transformationVersion: string;
  sourceRegistry: Artifact;
  sources: SourceProof[];
  stations: {
    version: string;
    transformationVersion: string;
    inputSha256: string;
    sourceIds: string[];
    sourceUpdatedAt: string;
    count: number;
    partitions: StationPartition[];
    audit: Artifact;
    license: "ODbL-1.0";
    licenseUrl: string;
    noticeUrl: string;
    coverage: string;
  };
  prices: Artifact & {
    transformationVersion: string;
    inputSha256: string;
    sourceIds: string[];
    count: 141;
    surveyDate: string;
    publishedAt: string;
    unit: "JPY/L";
    basis: "CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE";
  };
}
export interface StationFile {
  schemaVersion: 1;
  version: string;
  prefectureCode: PartitionCode;
  stations: Station[];
}
export interface PriceFile {
  schemaVersion: 1;
  source: "meti-prices";
  unit: "JPY/L";
  basis: "CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE";
  surveyDate: string;
  publishedAt: string;
  fetchedAt: string;
  sourceUrl: string;
  records: OfficialReferencePrice[];
}
export const prefectureCodes: PrefectureCode[] = Array.from({ length: 47 }, (_, i) => `JP-${String(i + 1).padStart(2, "0")}` as PrefectureCode);
export const partitionCodes: PartitionCode[] = [...prefectureCodes, "UNKNOWN"];
const states = ["YES", "NO", "UNKNOWN"];
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function isSha256(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/.test(value); }
export function isDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value && ms <= Date.now();
}
export function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && isDate(value.slice(0, 10)) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= Date.now();
}
export function isHttps(value: unknown): value is string {
  try { return typeof value === "string" && new URL(value).protocol === "https:" && !new URL(value).username && !new URL(value).password; } catch { return false; }
}
function nonempty(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }
function integer(value: unknown, min = 0): value is number { return Number.isSafeInteger(value) && (value as number) >= min; }
export function isJapanCoordinates(value: unknown): value is Coordinates {
  return isRecord(value) && typeof value.lat === "number" && Number.isFinite(value.lat) && value.lat >= 20 && value.lat <= 46 && typeof value.lon === "number" && Number.isFinite(value.lon) && value.lon >= 122 && value.lon <= 155;
}
function isBBox(value: unknown): value is BBox {
  return Array.isArray(value) && value.length === 4 && value.every((n) => typeof n === "number" && Number.isFinite(n)) && value[0] >= 122 && value[2] <= 155 && value[1] >= 20 && value[3] <= 46 && value[0] <= value[2] && value[1] <= value[3];
}
export function isArtifact(value: unknown): value is Artifact {
  return isRecord(value) && typeof value.path === "string" && /^\/data\/[A-Za-z0-9_/-]+(?:\.[A-Za-z0-9_-]+)?\.json$/.test(value.path) && !value.path.includes("..") && isSha256(value.sha256) && integer(value.bytes, 1);
}
export function validateStation(value: unknown): string[] {
  if (!isRecord(value)) return ["Invalid station object"];
  const errors: string[] = [];
  if (!["node", "way", "relation"].includes(String(value.osmType)) || !integer(value.osmId, 1) || value.id !== `osm:${value.osmType}:${value.osmId}`) errors.push("Invalid stable typed OSM id");
  if (!isJapanCoordinates(value)) errors.push("Invalid Japan coordinates");
  for (const key of ["paymentVisa", "paymentMastercard", "fuelRegular", "fuelHighOctane", "fuelDiesel"]) if (!states.includes(String(value[key]))) errors.push(`Invalid ${key}`);
  if (!["SELF", "FULL", "UNKNOWN"].includes(String(value.serviceType))) errors.push("Invalid serviceType");
  if (!partitionCodes.includes(value.prefectureCode as PartitionCode)) errors.push("Invalid prefectureCode");
  if (value.source !== "osm" || !isTimestamp(value.sourceUpdatedAt)) errors.push("Invalid station provenance");
  if (!["OSM_NODE", "SURFACE_POINT", "LINE_MIDPOINT"].includes(String(value.positionMethod))) errors.push("Invalid positionMethod");
  for (const key of ["name", "originalBrand", "normalizedBrand", "address", "openingHours", "city"]) if (key in value && !nonempty(value[key])) errors.push(`Invalid ${key}`);
  const allowed = new Set(["id", "osmType", "osmId", "lat", "lon", "name", "originalBrand", "normalizedBrand", "address", "openingHours", "serviceType", "paymentVisa", "paymentMastercard", "fuelRegular", "fuelHighOctane", "fuelDiesel", "sourceUpdatedAt", "prefectureCode", "city", "source", "positionMethod"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) errors.push("Unapproved station field (including price or gogoUrl)");
  return errors;
}
export function parseStationFile(value: unknown, entry?: StationPartition, version?: string): StationFile {
  if (!isRecord(value) || value.schemaVersion !== 1 || !nonempty(value.version) || !partitionCodes.includes(value.prefectureCode as PartitionCode) || !Array.isArray(value.stations)) throw new Error("Invalid station partition schema");
  const ids = new Set<string>();
  for (const row of value.stations) {
    const errors = validateStation(row);
    if (errors.length) throw new Error(errors.join("; "));
    const s = row as Station;
    if (ids.has(s.id) || s.prefectureCode !== value.prefectureCode) throw new Error("Duplicate or mispartitioned station");
    ids.add(s.id);
    if (entry?.bbox && (s.lon < entry.bbox[0] || s.lat < entry.bbox[1] || s.lon > entry.bbox[2] || s.lat > entry.bbox[3])) throw new Error("Station outside manifest bbox");
    if (entry && !entry.cells.some((b) => s.lon >= b[0] && s.lat >= b[1] && s.lon <= b[2] && s.lat <= b[3])) throw new Error("Station missing from cell lookup");
  }
  if (entry && (value.prefectureCode !== entry.code || value.stations.length !== entry.count)) throw new Error("Station partition manifest mismatch");
  if (version && value.version !== version) throw new Error("Station version mismatch");
  return value as unknown as StationFile;
}
export function parsePriceFile(value: unknown, expected?: DataManifest["prices"]): PriceFile {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.source !== "meti-prices" || value.unit !== "JPY/L" || value.basis !== "CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE" || !isDate(value.surveyDate) || !isDate(value.publishedAt) || !isTimestamp(value.fetchedAt) || value.surveyDate > value.publishedAt || value.publishedAt > value.fetchedAt.slice(0, 10) || typeof value.sourceUrl !== "string" || !/^https:\/\/www\.enecho\.meti\.go\.jp\/statistics\/petroleum_and_lpgas\/pl007\/xlsx\/\d{6}\.xlsx$/.test(value.sourceUrl) || !Array.isArray(value.records) || value.records.length !== 141) throw new Error("Invalid official price schema, provenance, units or coverage");
  const keys = new Set<string>();
  for (const row of value.records) {
    if (!isRecord(row) || !prefectureCodes.includes(row.prefectureCode as PrefectureCode) || !["REGULAR", "HIGH_OCTANE", "DIESEL"].includes(String(row.fuelType)) || typeof row.priceJpy !== "number" || !Number.isFinite(row.priceJpy) || row.priceJpy < 50 || row.priceJpy > 400) throw new Error("Invalid prefectural price record");
    for (const field of ["surveyDate", "publishedAt", "fetchedAt", "sourceUrl"]) if (row[field] !== value[field]) throw new Error("Price record provenance mismatch");
    const key = `${row.prefectureCode}:${row.fuelType}`;
    if (keys.has(key)) throw new Error("Duplicate prefectural price record");
    keys.add(key);
  }
  if (expected && (value.surveyDate !== expected.surveyDate || value.publishedAt !== expected.publishedAt || value.records.length !== expected.count)) throw new Error("Price manifest mismatch");
  return value as unknown as PriceFile;
}
export function parseDataManifest(value: unknown): DataManifest {
  if (!isRecord(value) || value.schemaVersion !== 1 || value.milestone !== "M0.1" || !nonempty(value.transformationVersion) || !isArtifact(value.sourceRegistry) || !Array.isArray(value.sources) || value.sources.length !== 3 || !isRecord(value.stations) || !isRecord(value.prices)) throw new Error("Invalid data manifest schema");
  const ids = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source) || !["osm", "geofabrik", "meti-prices"].includes(String(source.sourceId)) || !isHttps(source.sourceUrl) || !isSha256(source.inputSha256) || !isTimestamp(source.fetchedAt) || !(isTimestamp(source.sourceUpdatedAt) || isDate(source.sourceUpdatedAt)) || Date.parse(source.sourceUpdatedAt) > Date.parse(source.fetchedAt) || source.transformationVersion !== value.transformationVersion || ids.has(String(source.sourceId))) throw new Error("Invalid or duplicate manifest source proof");
    ids.add(String(source.sourceId));
  }
  const stations = value.stations, prices = value.prices;
  if (!nonempty(stations.version) || !isTimestamp(stations.sourceUpdatedAt) || !integer(stations.count, 1) || !isArtifact(stations.audit) || stations.license !== "ODbL-1.0" || stations.licenseUrl !== "https://opendatacommons.org/licenses/odbl/1-0/" || stations.noticeUrl !== "/data/OSM-NOTICE.txt" || !nonempty(stations.coverage) || !Array.isArray(stations.partitions) || stations.partitions.length !== 48) throw new Error("Invalid station manifest");
  const codes = new Set<string>();
  let count = 0;
  for (const entry of stations.partitions) {
    if (!isArtifact(entry) || !isRecord(entry) || !partitionCodes.includes(entry.code as PartitionCode) || codes.has(String(entry.code)) || !integer(entry.count) || !Array.isArray(entry.cells) || !entry.cells.every(isBBox) || (entry.count === 0 ? entry.bbox !== null || entry.cells.length !== 0 : !isBBox(entry.bbox) || entry.cells.length === 0)) throw new Error("Invalid or duplicate station partition descriptor");
    codes.add(String(entry.code)); count += entry.count;
  }
  if (count !== stations.count) throw new Error("Station total mismatch");
  if (!isArtifact(prices) || prices.count !== 141 || prices.unit !== "JPY/L" || prices.basis !== "CASH_TAX_INCLUDED_PREFECTURAL_REFERENCE" || !isDate(prices.surveyDate) || !isDate(prices.publishedAt) || prices.surveyDate > prices.publishedAt) throw new Error("Invalid price manifest");
  for (const [dataset, expectedIds] of [[stations, ["osm", "geofabrik"]], [prices, ["meti-prices"]]] as const) {
    if (!isSha256(dataset.inputSha256) || dataset.transformationVersion !== value.transformationVersion || !Array.isArray(dataset.sourceIds) || dataset.sourceIds.join(",") !== expectedIds.join(",")) throw new Error("Dataset source mismatch");
    for (const id of expectedIds) {
      const source = value.sources.find((s) => isRecord(s) && s.sourceId === id);
      if (source.inputSha256 !== dataset.inputSha256 || source.sourceUpdatedAt !== (id === "meti-prices" ? prices.publishedAt : stations.sourceUpdatedAt)) throw new Error("Dataset/source proof mismatch");
    }
  }
  return value as unknown as DataManifest;
}
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const rad = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * rad, deltaLon = (b.lon - a.lon) * rad;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(deltaLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function selectNearbyPartitions(manifest: DataManifest, position: Coordinates, radiusKm = 50): StationPartition[] {
  if (!isJapanCoordinates(position) || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 50) throw new Error("Invalid search position/radius");
  // Conservative spherical envelope: cell intersection includes both sides of borders.
  const angular = radiusKm / 6371.0088;
  const latDelta = angular * 180 / Math.PI;
  const lonDelta = Math.asin(Math.sin(angular) / Math.cos(position.lat * Math.PI / 180)) * 180 / Math.PI;
  const box: BBox = [position.lon - lonDelta, position.lat - latDelta, position.lon + lonDelta, position.lat + latDelta];
  const intersects = (b: BBox) => b[0] <= box[2] && b[2] >= box[0] && b[1] <= box[3] && b[3] >= box[1];
  return manifest.stations.partitions.filter((p) => p.bbox && intersects(p.bbox) && p.cells.some(intersects));
}
export function nearbyStations(stations: Station[], position: Coordinates, radiusKm = 50): (Station & { distanceKm: number })[] {
  const unique = new Map(stations.map((s) => [s.id, s]));
  return [...unique.values()].map((s) => ({ ...s, distanceKm: haversineKm(position, s) })).filter((s) => s.distanceKm <= radiusKm).sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
}
export async function fetchArtifact(artifact: Artifact, signal?: AbortSignal): Promise<unknown> {
  if (!isArtifact(artifact)) throw new Error("Invalid artifact descriptor");
  const response = await fetch(artifact.path, { signal });
  if (!response.ok) throw new Error(`Data HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== artifact.bytes) throw new Error("Data byte count mismatch");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (hash !== artifact.sha256) throw new Error("Data checksum mismatch");
  signal?.throwIfAborted();
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function loadDataManifest(signal?: AbortSignal): Promise<DataManifest> {
  const response = await fetch("/data/manifest.json", { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`Manifest HTTP ${response.status}`);
  const manifest = parseDataManifest(await response.json());
  const registry = await fetchArtifact(manifest.sourceRegistry, signal);
  const { validateRegistry } = await import("./source-registry");
  const errors = validateRegistry(registry, manifest);
  if (errors.length) throw new Error(errors.join("; "));
  signal?.throwIfAborted();
  return manifest;
}
export async function loadStationPartitions(manifest: DataManifest, codes: PartitionCode[], signal?: AbortSignal): Promise<Station[]> {
  const entries = [...new Set(codes)].map((code) => {
    const entry = manifest.stations.partitions.find((p) => p.code === code);
    if (!entry) throw new Error("Unknown station partition");
    return entry;
  });
  const files = await Promise.all(entries.map(async (entry) => parseStationFile(await fetchArtifact(entry, signal), entry, manifest.stations.version)));
  signal?.throwIfAborted();
  return [...new Map(files.flatMap((f) => f.stations).map((s) => [s.id, s])).values()];
}
export async function loadNearbyStations(manifest: DataManifest, position: Coordinates, signal?: AbortSignal, radiusKm = 50) {
  const entries = selectNearbyPartitions(manifest, position, radiusKm);
  return nearbyStations(await loadStationPartitions(manifest, entries.map((e) => e.code), signal), position, radiusKm);
}
export async function loadPrefectureStations(manifest: DataManifest, code: PrefectureCode, signal?: AbortSignal) {
  if (!prefectureCodes.includes(code)) throw new Error("Invalid manual prefecture");
  return loadStationPartitions(manifest, [code], signal);
}
export async function loadOfficialPrices(manifest: DataManifest, signal?: AbortSignal): Promise<PriceFile> {
  return parsePriceFile(await fetchArtifact(manifest.prices, signal), manifest.prices);
}
