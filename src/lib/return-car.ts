import { isJapanCoordinates, isRecord, loadDataManifest, loadNearbyStations, nearbyStations, type Coordinates, type FuelType, type PrefectureCode, type Station } from "./stations";
import type { MessageKey } from "../i18n";

export const rentalDataUrl = "/data/rental/locations.json";
export const timesHomeUrl = "https://www.timescar-rental.com/en/";
export const rentalVersion = "m04-limited-times-1";
const dayMs = 86_400_000;
const fuelField = { REGULAR: "fuelRegular", HIGH_OCTANE: "fuelHighOctane", DIESEL: "fuelDiesel" } as const;
export function returnFuelSupply(station: Station, fuel: FuelType) { return station[fuelField[fuel]]; }
export function returnCandidates(stations: Station[], point: Coordinates, fuel: FuelType) {
  if (!isJapanCoordinates(point) || !(fuel in fuelField)) throw new Error("Invalid return search");
  return nearbyStations(stations, point, 10).filter(station => returnFuelSupply(station, fuel) !== "NO").slice(0, 10);
}
export type ReturnCandidate = ReturnType<typeof returnCandidates>[number];
export interface RentalLocation extends Coordinates {
  id: string; companyId: "times"; nameKey: MessageKey; nameJa: string; addressJa: string;
  prefectureCode: PrefectureCode; officialCheckUrl: string; positionSourceId: "rental-osm" | "times-limited-facts";
  factSourceId: "times-limited-facts"; positionKind: "SHOP_REFERENCE"; osmId?: number; checkedAt: string;
}
interface RentalSource {
  id: string; owner: string; url: string; purpose: string; termsUrl: string; allowedUseAssessment: string;
  attribution: string; refreshPolicy: string; reviewDate: string; transformationVersion: string;
}
export interface RentalData {
  schemaVersion: 1; transformationVersion: string; count: 3; reviewDate: string; sources: RentalSource[]; records: RentalLocation[];
  rule: { companyId: "times"; sourceId: "times-limited-facts"; officialCheckUrl: string; checkedAt: string; fullTank: "STANDARD_SUBJECT_TO_CONTRACT"; receipt: "MAY_BE_REQUESTED" };
  osm: { inputSha256: string; sourceDate: string; license: "ODbL-1.0"; licenseUrl: string; noticeUrl: string; downloadUrl: string; excludedOsmIds: number[] };
}
const approvedLocations = [
  { id: "times-naha-airport", nameKey: "rcNaha", prefectureCode: "JP-47", lat: 26.2110555, lon: 127.6582094, officialCheckUrl: `${timesHomeUrl}okinawa/shop/4701/`, positionSourceId: "rental-osm", osmId: 4716765290 },
  { id: "times-new-chitose-airport", nameKey: "rcChitose", prefectureCode: "JP-01", lat: 42.8165023, lon: 141.678983, officialCheckUrl: `${timesHomeUrl}hokkaido/shop/0105/`, positionSourceId: "rental-osm", osmId: 13042879292 },
  { id: "times-fukuoka-airport-international", nameKey: "rcFukuoka", prefectureCode: "JP-40", lat: 33.580013935265356, lon: 130.44219502340152, officialCheckUrl: `${timesHomeUrl}fukuoka/shop/4034/`, positionSourceId: "times-limited-facts" },
] as const;
const approvedSources = [
  { id: "rental-osm", url: "https://www.openstreetmap.org/copyright", termsUrl: "https://opendatacommons.org/licenses/odbl/1-0/", allowedUseAssessment: "ODBL_DERIVED" },
  { id: "rental-geofabrik", url: "https://download.geofabrik.de/asia/japan-260929.osm.pbf", termsUrl: "https://download.geofabrik.de/", allowedUseAssessment: "ODBL_DISTRIBUTION" },
  { id: "times-limited-facts", url: timesHomeUrl, termsUrl: `${timesHomeUrl}aboutlink/`, allowedUseAssessment: "LIMITED_FACTS_MANUAL" },
] as const;
function checkedDate(value: unknown, now: number): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(ms) && ms <= now && new Date(ms).toISOString().slice(0, 10) === value;
}
export function rentalNeedsRecheck(date: string, now = Date.now()) {
  return !checkedDate(date, now) || now - Date.parse(`${date}T00:00:00Z`) >= 90 * dayMs;
}
function matches(row: Record<string, unknown>, expected: Record<string, unknown>) {
  return Object.entries(expected).every(([key, value]) => row[key] === value);
}
function exactKeys(row: Record<string, unknown>, keys: string[]) {
  return Object.keys(row).length === keys.length && keys.every(key => key in row);
}
export function parseRentalData(value: unknown, now = Date.now()): RentalData {
  if (!isRecord(value) || !exactKeys(value, ["schemaVersion", "transformationVersion", "count", "reviewDate", "sources", "records", "rule", "osm"]) || value.schemaVersion !== 1 || value.transformationVersion !== rentalVersion || value.count !== 3 || !checkedDate(value.reviewDate, now) || !Array.isArray(value.sources) || value.sources.length !== 3 || !Array.isArray(value.records) || value.records.length !== 3) throw new Error("Invalid rental schema/count/date");
  const sourceIds = new Set<string>();
  for (const source of value.sources) {
    if (!isRecord(source)) throw new Error("Invalid rental source");
    const approved = approvedSources.find(entry => entry.id === source.id);
    if (!approved || !matches(source, approved) || sourceIds.has(approved.id) || !exactKeys(source, ["id", "owner", "url", "purpose", "termsUrl", "allowedUseAssessment", "attribution", "refreshPolicy", "reviewDate", "transformationVersion"]) || ["owner", "purpose", "attribution", "refreshPolicy"].some(key => typeof source[key] !== "string" || !source[key].trim()) || source.reviewDate !== value.reviewDate || source.transformationVersion !== rentalVersion) throw new Error("Unapproved rental source or policy");
    sourceIds.add(approved.id);
  }
  const ids = new Set<string>();
  for (const row of value.records) {
    if (!isRecord(row)) throw new Error("Invalid rental location");
    const approved = approvedLocations.find(entry => entry.id === row.id);
    if (!approved || !matches(row, approved) || !isJapanCoordinates(row) || ids.has(approved.id) || row.companyId !== "times" || row.factSourceId !== "times-limited-facts" || row.positionKind !== "SHOP_REFERENCE" || row.checkedAt !== value.reviewDate || ["nameJa", "addressJa"].some(key => typeof row[key] !== "string" || !row[key].trim()) || !exactKeys(row, ["id", "nameKey", "nameJa", "addressJa", "companyId", "prefectureCode", "lat", "lon", "officialCheckUrl", "positionSourceId", "factSourceId", "positionKind", "checkedAt", ...("osmId" in approved ? ["osmId"] : [])])) throw new Error("Unapproved or duplicate rental location/mapping");
    ids.add(approved.id);
  }
  if (!isRecord(value.rule) || !exactKeys(value.rule, ["companyId", "sourceId", "officialCheckUrl", "checkedAt", "fullTank", "receipt"]) || !matches(value.rule, { companyId: "times", sourceId: "times-limited-facts", officialCheckUrl: `${timesHomeUrl}agreement/gas.html`, checkedAt: value.reviewDate, fullTank: "STANDARD_SUBJECT_TO_CONTRACT", receipt: "MAY_BE_REQUESTED" })) throw new Error("Unapproved rental rule");
  const osm = value.osm;
  if (!isRecord(osm) || !exactKeys(osm, ["inputSha256", "sourceDate", "license", "licenseUrl", "noticeUrl", "downloadUrl", "excludedOsmIds"]) || !matches(osm, { inputSha256: "c083bcad49fa77462f8f3c5cb5f4fda5f346f6f69f45075c61b71b4ac199ecdd", sourceDate: "2026-09-29", license: "ODbL-1.0", licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/", noticeUrl: "/data/rental/NOTICE.txt", downloadUrl: rentalDataUrl }) || !Array.isArray(osm.excludedOsmIds) || osm.excludedOsmIds.length !== 1 || osm.excludedOsmIds[0] !== 4926916121 || value.reviewDate < String(osm.sourceDate)) throw new Error("Invalid rental OSM provenance");
  return value as unknown as RentalData;
}
export async function loadRentalData(signal?: AbortSignal, now = Date.now()) {
  const response = await fetch(rentalDataUrl, { signal, cache: "no-cache" });
  if (!response.ok) throw new Error(`Rental HTTP ${response.status}`);
  const data = parseRentalData(await response.json(), now);
  signal?.throwIfAborted();
  return data;
}
export async function loadReturnCandidates(point: RentalLocation, fuel: FuelType, signal?: AbortSignal) {
  const manifest = await loadDataManifest(signal);
  const stations = await loadNearbyStations(manifest, point, signal, 10);
  signal?.throwIfAborted();
  return returnCandidates(stations, point, fuel);
}
