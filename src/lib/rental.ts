/** Lazy rental data contract. Only the small reviewed whitelist is bundled; no requests at module load. */
import reviewedContract from "./rental-reviewed.json" with { type: "json" };
import type { MessageKey } from "../i18n";
export const rentalManifestUrl = "/data/rental/nationwide/manifest.json";
export const rentalTransformationVersion = "rental-v1";
export const rentalPrefectureCodes = [...Array.from({ length: 47 }, (_, i) => `JP-${String(i + 1).padStart(2, "0")}`), "UNKNOWN"] as const;
export const rentalSourceIds = ["osm", "overture", "times-official", "nippon-official", "toyota-official"] as const;
export type RentalSourceId = typeof rentalSourceIds[number];
export type RentalCompanyId = "toyota" | "nippon" | "orix" | "times" | "nissan" | "budget" | "niconico" | "honda" | "ekiren" | "ots" | "UNKNOWN";
export type RentalCandidateStatus = "CANDIDATE" | "COUNTER_ONLY" | "OFFICIAL_RETURN_FACILITY";
export type RentalVerification = "NOT_VERIFIED" | "OFFICIAL_FACILITY_CHECKED";
export type RentalPositionKind = "SOURCE_POINT" | "AREA_REFERENCE" | "LINE_REFERENCE" | "SHOP_REFERENCE" | "FACILITY_REFERENCE";
export type RentalAirportCode = "NRT" | "HND" | "KIX" | "NGO" | "CTS" | "FUK" | "OKA";
export interface RentalNames { primary: string | null; languages: Record<string, string> }
export interface RentalIndexEntry {
  id: string; aliases: string[]; names: RentalNames; companyId: RentalCompanyId; companyName: string | null;
  prefectureCode: string; lat: number; lon: number; address: string | null; positionKind: RentalPositionKind;
  candidateStatus: RentalCandidateStatus; verification: RentalVerification; vehicleEntranceStatus: "NOT_VERIFIED";
  airportCode: RentalAirportCode | null; sourceIds: RentalSourceId[];
}
export interface RentalMember {
  sourceId: RentalSourceId; key: string; recordId: string; sourceDate: string; url: string;
  licenses: string[]; attributes: Record<string, unknown>;
}
export type RentalOfficialSourceId = "times-official" | "nippon-official" | "toyota-official";
export type RentalSummaryKey = Extract<MessageKey, `rental.${string}`>;
export interface RentalOfficialCheck {
  sourceId: RentalOfficialSourceId; checkedAt: string; url: string; supplementaryUrls: string[]; summaryKey: RentalSummaryKey;
}
export interface RentalReturnRule {
  companyId: "times"; sourceId: "times-official"; url: string; checkedAt: string;
  fullTank: "STANDARD_SUBJECT_TO_CONTRACT"; receipt: "MAY_BE_REQUESTED";
}
export interface RentalLocation extends RentalIndexEntry {
  phones: string[]; websites: string[]; sources: RentalMember[];
  official: RentalOfficialCheck | null; returnRule: RentalReturnRule | null;
}
export interface RentalIndex { schemaVersion: 1; version: string; count: number; records: RentalIndexEntry[] }
export interface RentalPartition { schemaVersion: 1; version: string; prefectureCode: string; count: number; records: RentalLocation[] }
export interface RentalArtifact { url: string; sha256: string; bytes: number; count?: number }
export interface RentalPartitionArtifact extends RentalArtifact { code: string; count: number }
export interface RentalSource {
  id: RentalSourceId; name: string; sourceDate: string; url: string; licenses: string[]; attribution: string;
}
export interface RentalManifest {
  schemaVersion: 1; transformationVersion: "rental-v1"; version: string; count: number; reviewDate: string;
  license: "ODbL-1.0"; sources: RentalSource[]; index: RentalArtifact & { count: number };
  partitions: RentalPartitionArtifact[]; audit: RentalArtifact; officialOverrides: RentalArtifact;
  sourceRegistry: RentalArtifact; identity: RentalArtifact; notice: RentalArtifact; licenses: RentalArtifact[]; downloads: RentalArtifact[];
}
const root = "/data/rental/nationwide/";
const companies = ["toyota", "nippon", "orix", "times", "nissan", "budget", "niconico", "honda", "ekiren", "ots", "UNKNOWN"];
const licenseNames = ["ODbL-1.0.txt", "Apache-2.0.txt", "CDLA-Permissive-2.0.txt", "CC0-1.0.txt", "Foursquare-NOTICE.txt"];
const sourceLicenses = { osm: ["ODbL-1.0"], overture: ["Apache-2.0", "CC0-1.0", "CDLA-Permissive-2.0"], "times-official": ["LIMITED_FACTS"], "nippon-official": ["LIMITED_FACTS"], "toyota-official": ["LIMITED_FACTS"] };
const upstreamLicenses: Record<string, string> = { Foursquare: "Apache-2.0", Overture: "CDLA-Permissive-2.0", meta: "CDLA-Permissive-2.0", AllThePlaces: "CC0-1.0" };
interface ReviewedFact { attributes: Record<string, unknown>; sourceId: RentalOfficialSourceId; recordId: string; summaryKey: RentalSummaryKey; websiteUrl: string; reviewedSourceKeys: string[] }
const reviewedFacts = reviewedContract.records as Record<string, ReviewedFact>;
const airportCodes = new Set(Object.values(reviewedFacts).map(fact => fact.attributes.airportCode));
const isOfficialSource = (sourceId: string) => ["times-official", "nippon-official", "toyota-official"].includes(sourceId);
const indexKeys = ["id", "aliases", "names", "companyId", "companyName", "prefectureCode", "lat", "lon", "address", "positionKind", "candidateStatus", "verification", "vehicleEntranceStatus", "airportCode", "sourceIds"];
function check(test: unknown, message = "Invalid rental data"): asserts test { if (!test) throw new Error(message); }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v)); }
function text(v: unknown): v is string { return typeof v === "string" && v.trim().length > 0; }
function integer(v: unknown): v is number { return typeof v === "number" && Number.isSafeInteger(v) && v >= 0; }
function id(v: unknown): v is string { return typeof v === "string" && /^[a-z0-9][a-z0-9-]{0,119}$/.test(v) && !["constructor", "prototype", "__proto__"].includes(v); }
function version(v: unknown): v is string { return typeof v === "string" && /^rental-v1-[0-9a-f]{16}$/.test(v); }
function keys(v: Record<string, unknown>, required: string[], optional: string[] = []) {
  check(required.every(k => Object.hasOwn(v, k)) && Object.keys(v).every(k => required.includes(k) || optional.includes(k)), "Unexpected rental fields");
}
function safe(v: unknown, depth = 0): void {
  check(depth < 60, "Excessive nesting");
  if (Array.isArray(v)) { for (const x of v) safe(x, depth + 1); }
  else if (v !== null && typeof v === "object") {
    check(object(v), "Invalid object prototype");
    for (const [k, x] of Object.entries(v)) { check(!["__proto__", "prototype", "constructor"].includes(k), "Unsafe property"); safe(x, depth + 1); }
  } else check(v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)), "Non-JSON value");
}
function day(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === v;
}
function dateOrTime(v: unknown): v is string {
  return day(v) || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(v) && day(v.slice(0, 10)) && Number.isFinite(Date.parse(v)));
}
function http(v: unknown): v is string {
  if (!text(v) || /[\s\\]/.test(v)) return false;
  try { const u = new URL(v); return ["http:", "https:"].includes(u.protocol) && !!u.hostname && !u.username && !u.password; } catch { return false; }
}
function list(v: unknown, predicate: (x: unknown) => boolean, nonempty = false): asserts v is unknown[] {
  check(Array.isArray(v) && (!nonempty || v.length > 0) && v.every(predicate) && new Set(v).size === v.length, "Invalid or repeated list member");
}
function same(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  if (object(a) && object(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => Object.hasOwn(b, k) && same(a[k], b[k]));
  return a === b;
}
function coordinates(v: Record<string, unknown>) {
  check(typeof v.lat === "number" && Number.isFinite(v.lat) && v.lat >= 20 && v.lat <= 46 && typeof v.lon === "number" && Number.isFinite(v.lon) && v.lon >= 122 && v.lon <= 155, "Invalid Japan coordinates");
}
function artifact(v: unknown, expectedUrl?: string): asserts v is RentalArtifact {
  check(object(v)); keys(v, ["url", "sha256", "bytes"], ["count"]);
  check(typeof v.url === "string" && /^\/data\/rental\/nationwide\/(?:snapshots\/rental-v1-[0-9a-f]{16}\/(?:[a-z-]+\.json|partitions\/(?:JP-(?:0[1-9]|[1-3][0-9]|4[0-7])|UNKNOWN)\.json)|licenses\/(?:ODbL-1\.0|Apache-2\.0|CDLA-Permissive-2\.0|CC0-1\.0|Foursquare-NOTICE)\.txt|NOTICE\.txt)$/.test(v.url), "Unsafe artifact path");
  check(!expectedUrl || v.url === expectedUrl, "Artifact version/path mismatch");
  check(typeof v.sha256 === "string" && /^[a-f0-9]{64}$/.test(v.sha256) && integer(v.bytes) && v.bytes > 0 && (v.count === undefined || integer(v.count)), "Invalid artifact metadata");
}
export function parseManifest(value: unknown): RentalManifest {
  safe(value); check(object(value));
  keys(value, ["schemaVersion", "transformationVersion", "version", "count", "reviewDate", "license", "sources", "index", "partitions", "audit", "officialOverrides", "sourceRegistry", "identity", "notice", "licenses", "downloads"]);
  check(value.schemaVersion === 1 && value.transformationVersion === rentalTransformationVersion && version(value.version) && integer(value.count) && value.count > 0 && day(value.reviewDate) && value.license === "ODbL-1.0");
  check(Array.isArray(value.sources) && value.sources.length === rentalSourceIds.length);
  const approvedSources = {
    osm: ["2026-09-29", "https://download.geofabrik.de/asia/japan-260929.osm.pbf"],
    overture: ["2026-09-23", "https://docs.overturemaps.org/attribution/"],
    "times-official": ["2026-09-30", "https://www.timescar-rental.com/en/"],
    "nippon-official": ["2026-10-01", "https://www.nipponrentacar.co.jp/"],
    "toyota-official": ["2026-10-01", "https://rent.toyota.co.jp/"],
  };
  check(value.reviewDate === reviewedContract.reviewDate, "Unreviewed rental date");
  const sourceSet = new Set<string>();
  for (const s of value.sources) {
    check(object(s)); keys(s, ["id", "name", "sourceDate", "url", "licenses", "attribution"]);
    check(rentalSourceIds.includes(s.id as RentalSourceId) && !sourceSet.has(String(s.id)) && text(s.name) && day(s.sourceDate) && s.sourceDate <= value.reviewDate && http(s.url) && text(s.attribution));
    list(s.licenses, text, true); check(same([...s.licenses].sort(), [...sourceLicenses[s.id as RentalSourceId]].sort()));
    check(s.sourceDate === approvedSources[s.id as RentalSourceId][0] && s.url === approvedSources[s.id as RentalSourceId][1], "Unapproved source URL or snapshot");
    sourceSet.add(String(s.id));
  }
  const prefix = `${root}snapshots/${value.version}/`;
  artifact(value.index, prefix + "index.json"); check(value.index.count === value.count);
  check(Array.isArray(value.partitions) && value.partitions.length === 48);
  const codes = new Set<string>(); let count = 0;
  for (const p of value.partitions) {
    check(object(p)); keys(p, ["code", "url", "sha256", "bytes", "count"]);
    check(typeof p.code === "string" && rentalPrefectureCodes.includes(p.code) && !codes.has(p.code) && integer(p.count));
    const { code, ...a } = p; artifact(a, prefix + `partitions/${code}.json`); codes.add(p.code); count += p.count;
  }
  check(count === value.count, "Partition total mismatch");
  for (const [key, filename] of [["audit", "audit"], ["officialOverrides", "official-overrides"], ["sourceRegistry", "sources"], ["identity", "identity"]]) artifact(value[key], prefix + filename + ".json");
  artifact(value.notice, root + "NOTICE.txt");
  check(Array.isArray(value.licenses) && value.licenses.length === licenseNames.length);
  value.licenses.forEach((v, i) => artifact(v, root + "licenses/" + licenseNames[i]));
  const required = [value.index, ...value.partitions.map(p => { const a = { ...p }; delete a.code; return a; }), value.audit, value.officialOverrides, value.sourceRegistry, value.identity, value.notice, ...value.licenses];
  check(Array.isArray(value.downloads) && value.downloads.length === required.length);
  const downloadUrls = new Set<string>();
  for (const a of value.downloads) { artifact(a); check(!downloadUrls.has(a.url) && required.some(b => same(a, b)), "Missing or inconsistent download"); downloadUrls.add(a.url); }
  return value as unknown as RentalManifest;
}
function parseEntry(v: unknown, full = false): asserts v is RentalIndexEntry {
  check(object(v)); keys(v, full ? [...indexKeys, "phones", "websites", "sources", "official", "returnRule"] : indexKeys);
  check(id(v.id)); list(v.aliases, id); check(!v.aliases.includes(v.id));
  check(object(v.names)); keys(v.names, ["primary", "languages"]);
  check(v.names.primary === null || text(v.names.primary)); check(object(v.names.languages));
  check(Object.entries(v.names.languages).every(([k, name]) => /^[A-Za-z][A-Za-z0-9:_-]{0,49}$/.test(k) && text(name)));
  check(companies.includes(String(v.companyId)) && (v.companyName === null || text(v.companyName)) && (v.companyId === "UNKNOWN") === (v.companyName === null));
  check(typeof v.prefectureCode === "string" && rentalPrefectureCodes.includes(v.prefectureCode)); coordinates(v);
  check(v.address === null || text(v.address));
  check(["SOURCE_POINT", "AREA_REFERENCE", "LINE_REFERENCE", "SHOP_REFERENCE", "FACILITY_REFERENCE"].includes(String(v.positionKind)) && ["CANDIDATE", "COUNTER_ONLY", "OFFICIAL_RETURN_FACILITY"].includes(String(v.candidateStatus)) && ["NOT_VERIFIED", "OFFICIAL_FACILITY_CHECKED"].includes(String(v.verification)) && v.vehicleEntranceStatus === "NOT_VERIFIED");
  list(v.sourceIds, x => rentalSourceIds.includes(x as RentalSourceId), true);
  if (v.candidateStatus === "OFFICIAL_RETURN_FACILITY") {
    check(Object.hasOwn(reviewedFacts, v.id), "Unreviewed official identity");
    const fact = reviewedFacts[v.id]; const attrs = fact.attributes;
    check(["companyId", "prefectureCode", "positionKind", "airportCode", "lat", "lon"].every(key => v[key] === attrs[key]) && v.names.primary === attrs.nameJa && v.address === attrs.addressJa && v.verification === "OFFICIAL_FACILITY_CHECKED" && v.sourceIds.includes(fact.sourceId) && v.sourceIds.filter(source => isOfficialSource(String(source))).length === 1, "Unreviewed official identity");
  } else check(v.verification === "NOT_VERIFIED" && v.airportCode === null && !v.sourceIds.some(source => isOfficialSource(String(source))) && !["SHOP_REFERENCE", "FACILITY_REFERENCE"].includes(String(v.positionKind)), "Candidate cannot claim official verification");
}
function uniqueRecords(rows: RentalIndexEntry[]) {
  const ids = new Set<string>();
  for (const r of rows) for (const ident of [r.id, ...r.aliases]) { check(!ids.has(ident), "Duplicate rental ID or alias"); ids.add(ident); }
}
export function parseIndex(value: unknown, manifest?: RentalManifest): RentalIndex {
  safe(value); check(object(value)); keys(value, ["schemaVersion", "version", "count", "records"]);
  check(value.schemaVersion === 1 && version(value.version) && integer(value.count) && Array.isArray(value.records) && value.records.length === value.count);
  value.records.forEach(r => parseEntry(r)); const rows = value.records as RentalIndexEntry[]; uniqueRecords(rows);
  if (manifest) {
    check(value.version === manifest.version && value.count === manifest.count, "Index manifest mismatch");
    for (const p of manifest.partitions) check(rows.filter(r => r.prefectureCode === p.code).length === p.count, "Index partition count mismatch");
  }
  check(rows.filter(r => r.verification === "OFFICIAL_FACILITY_CHECKED").length === Object.keys(reviewedFacts).length, "Official coverage mismatch");
  return value as unknown as RentalIndex;
}
function parseMember(v: unknown): asserts v is RentalMember {
  check(object(v)); keys(v, ["sourceId", "key", "recordId", "sourceDate", "url", "licenses", "attributes"]);
  check(rentalSourceIds.includes(v.sourceId as RentalSourceId) && id(v.key) && text(v.recordId) && dateOrTime(v.sourceDate) && http(v.url) && object(v.attributes));
  list(v.licenses, x => sourceLicenses[v.sourceId as RentalSourceId].includes(String(x)), true);
  if (v.sourceId === "osm") {
    check(/^(node|way|relation)\/[1-9]\d*$/.test(v.recordId) && v.key === `osm-${v.recordId[0]}${v.recordId.split("/")[1]}` && v.url === `https://www.openstreetmap.org/${v.recordId}` && same(v.licenses, ["ODbL-1.0"]));
    const p = v.attributes.properties; check(object(p) && integer(p["@id"]) && `${p["@type"]}/${p["@id"]}` === v.recordId && typeof p["@timestamp"] === "number" && new Date(p["@timestamp"] * 1000).toISOString() === new Date(v.sourceDate).toISOString());
    check(Array.isArray(v.attributes.geometryVariants) && v.attributes.geometryVariants.length > 0);
  } else if (v.sourceId === "overture") {
    check(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v.recordId) && v.key === `overture-${v.recordId}` && v.attributes.id === v.recordId && v.sourceDate === "2026-09-23" && v.url === `https://explore.overturemaps.org/#id=${v.recordId}`);
    check(Array.isArray(v.attributes.sources) && v.attributes.sources.length > 0);
    const found = new Set<string>();
    for (const s of v.attributes.sources) {
      check(object(s) && typeof s.dataset === "string" && Object.hasOwn(upstreamLicenses, s.dataset) && s.license === upstreamLicenses[s.dataset] && (s.record_id === null || text(s.record_id)), "Unapproved upstream provenance"); found.add(String(s.license));
    }
    check(same([...found].sort(), [...v.licenses].sort()), "Lost upstream license");
  } else {
    const ident = v.key.replace(/^official-/, "");
    check(Object.hasOwn(reviewedFacts, ident), "Unreviewed official source identity");
    const fact = reviewedFacts[ident];
    check(v.key === `official-${ident}` && v.sourceId === fact.sourceId && v.recordId === fact.recordId && v.sourceDate === fact.attributes.checkedAt && v.url === fact.attributes.officialCheckUrl && same(v.licenses, ["LIMITED_FACTS"]) && same(v.attributes, fact.attributes), "Unreviewed official source fact");
  }
}
function parseDetail(v: unknown): asserts v is RentalLocation {
  parseEntry(v, true); const r = v as unknown as Record<string, unknown>;
  list(r.phones, text); list(r.websites, http); check(Array.isArray(r.sources) && r.sources.length > 0);
  const sourceKeys = new Set<string>(); const sources = new Set<string>();
  for (const s of r.sources) { parseMember(s); check(!sourceKeys.has(s.key)); sourceKeys.add(s.key); sources.add(s.sourceId); }
  check(same([...sources].sort(), [...v.sourceIds].sort()));
  if (v.verification === "OFFICIAL_FACILITY_CHECKED") {
    const fact = reviewedFacts[v.id]; const attrs = fact.attributes;
    check(object(r.official)); keys(r.official, ["sourceId", "checkedAt", "url", "supplementaryUrls", "summaryKey"]);
    check(r.official.sourceId === fact.sourceId && r.official.checkedAt === attrs.checkedAt && r.official.url === attrs.officialCheckUrl && r.official.summaryKey === fact.summaryKey && same(r.official.supplementaryUrls, attrs.supplementarySourceUrls), "Official detail mismatch");
    const officialSources = (r.sources as RentalMember[]).filter(s => isOfficialSource(s.sourceId));
    check(officialSources.length === 1 && officialSources[0].key === `official-${v.id}` && same(officialSources[0].attributes, attrs), "Official fact mismatch");
    if (fact.sourceId !== "times-official") {
      check(same([...sourceKeys].filter(key => !key.startsWith("official-")).sort(), [...fact.reviewedSourceKeys].sort()), "Unreviewed source mapping");
      if (attrs.officialPhone) check(same(r.phones, [attrs.officialPhone]), "Official phone mismatch");
    }
  } else check(r.official === null);
  if (v.companyId === "times") {
    check(object(r.returnRule)); keys(r.returnRule, ["companyId", "sourceId", "url", "checkedAt", "fullTank", "receipt"]);
    check(same(r.returnRule, { companyId: "times", sourceId: "times-official", url: "https://www.timescar-rental.com/en/agreement/gas.html", checkedAt: "2026-09-30", fullTank: "STANDARD_SUBJECT_TO_CONTRACT", receipt: "MAY_BE_REQUESTED" }));
  } else check(r.returnRule === null, "Company rule leakage");
}
export function parsePartition(value: unknown, manifest?: RentalManifest, index?: RentalIndex): RentalPartition {
  safe(value); check(object(value)); keys(value, ["schemaVersion", "version", "prefectureCode", "count", "records"]);
  check(value.schemaVersion === 1 && version(value.version) && typeof value.prefectureCode === "string" && rentalPrefectureCodes.includes(value.prefectureCode) && integer(value.count) && Array.isArray(value.records) && value.records.length === value.count);
  for (const r of value.records) { parseDetail(r); check(r.prefectureCode === value.prefectureCode, "Mispartitioned rental"); }
  const rows = value.records as RentalLocation[]; uniqueRecords(rows);
  const allSourceKeys = rows.flatMap(r => r.sources.map(s => s.key)); check(new Set(allSourceKeys).size === allSourceKeys.length, "Source object duplicated");
  if (manifest) { const p = manifest.partitions.find(p => p.code === value.prefectureCode); check(p && p.count === value.count && value.version === manifest.version, "Partition manifest mismatch"); }
  if (index) {
    check(index.version === value.version);
    const expected = index.records.filter(r => r.prefectureCode === value.prefectureCode);
    check(expected.length === rows.length);
    const byId = new Map(expected.map(r => [r.id, r]));
    for (const r of rows) { const entry = Object.fromEntries(indexKeys.map(k => [k, r[k as keyof RentalLocation]])); check(same(entry, byId.get(r.id)), "Index/detail mismatch"); }
  }
  return value as unknown as RentalPartition;
}
async function fetchJson(url: string, signal?: AbortSignal, expected?: RentalArtifact): Promise<unknown> {
  signal?.throwIfAborted();
  const response = await fetch(url, { signal, cache: "no-cache" });
  check(response.ok, `Rental HTTP ${response.status}`);
  const bytes = await response.arrayBuffer(); signal?.throwIfAborted();
  if (expected) {
    check(bytes.byteLength === expected.bytes, "Rental byte count mismatch");
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), b => b.toString(16).padStart(2, "0")).join("");
    check(digest === expected.sha256, "Rental SHA256 mismatch");
  }
  signal?.throwIfAborted(); return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function loadRentalManifest(signal?: AbortSignal): Promise<RentalManifest> {
  return parseManifest(await fetchJson(rentalManifestUrl, signal));
}
export async function loadRentalIndex(manifest: RentalManifest, signal?: AbortSignal): Promise<RentalIndex> {
  parseManifest(manifest);
  return parseIndex(await fetchJson(manifest.index.url, signal, manifest.index), manifest);
}
export async function loadRentalPartition(manifest: RentalManifest, code: string, signal?: AbortSignal, index?: RentalIndex): Promise<RentalPartition> {
  parseManifest(manifest); const p = manifest.partitions.find(p => p.code === code); check(p, "Unknown rental partition");
  return parsePartition(await fetchJson(p.url, signal, p), manifest, index);
}
export function findRentalById(index: RentalIndex, id: string): RentalIndexEntry | undefined {
  return index.records.find(r => r.id === id || r.aliases.includes(id));
}
export async function loadRentalLocation(manifest: RentalManifest, index: RentalIndex, id: string, signal?: AbortSignal): Promise<RentalLocation> {
  check(index.version === manifest.version); const entry = findRentalById(index, id); check(entry, "Unknown rental ID");
  const data = await loadRentalPartition(manifest, entry.prefectureCode, signal, index);
  const record = data.records.find(r => r.id === entry.id); check(record); return record;
}
export function canSelectRentalDestination(row: RentalIndexEntry): boolean { return row.candidateStatus !== "COUNTER_ONLY"; }
export function rentalNeedsRecheck(checkedAt: string, now = Date.now()): boolean {
  const time = Date.parse(`${checkedAt}T00:00:00Z`);
  return !day(checkedAt) || !Number.isFinite(now) || now < time || now - time >= 90 * 86400000;
}
export function rentalOfficialWebsite(row: RentalLocation): string | null {
  const fact = Object.hasOwn(reviewedFacts, row.id) ? reviewedFacts[row.id] : null;
  return row.official && fact && row.companyId === fact.attributes.companyId ? fact.websiteUrl : null;
}
export function rentalRuleFor(row: RentalLocation): RentalReturnRule | null { return row.companyId === "times" ? row.returnRule : null; }
function normalizeQuery(v: string) { return v.normalize("NFKC").toLocaleLowerCase("en").replace(/[\s\p{P}\p{S}]+/gu, ""); }
export interface RentalSearchOptions { query?: string; companyId?: RentalCompanyId; prefectureCode?: string; airportCode?: RentalAirportCode; includeCounters?: boolean; limit?: number }
export function searchRentals(index: RentalIndex, options: RentalSearchOptions = {}): RentalIndexEntry[] {
  const query = normalizeQuery(options.query ?? ""); const limit = options.limit ?? 100;
  const airportQuery = airportCodes.has(query.toUpperCase()) ? query.toUpperCase() : null;
  check(integer(limit) && limit <= 10000, "Invalid rental result limit");
  check(!options.companyId || companies.includes(options.companyId));
  check(!options.prefectureCode || rentalPrefectureCodes.includes(options.prefectureCode));
  check(!options.airportCode || airportCodes.has(options.airportCode));
  return index.records.filter(r => (options.includeCounters || canSelectRentalDestination(r)) && (!options.companyId || r.companyId === options.companyId) && (!options.prefectureCode || r.prefectureCode === options.prefectureCode) && (!options.airportCode || r.airportCode === options.airportCode) && (!query || (airportQuery ? r.airportCode === airportQuery : [r.names.primary, ...Object.values(r.names.languages), r.companyName, r.address, r.airportCode, r.id, ...r.aliases].some(v => v && normalizeQuery(v).includes(query))))).slice(0, limit);
}
