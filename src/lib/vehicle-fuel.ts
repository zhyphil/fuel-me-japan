import { messages, japaneseLabels, type Locale } from "../i18n";
import { checkScope, date, object, parseVehicleRegistry, requireVehicle, scopeKeys, token, vehicleCopyVersion, vehicleFuels, type VehicleFuel, type VehicleRegistry, type VehicleScope } from "./vehicle-sources";

export interface VehicleMapping extends VehicleScope {
  id: string; fuelType: VehicleFuel; verificationStatus: "VERIFIED" | "UNKNOWN";
  sourceId: string; evidenceId: string; evidenceVersion: string; verifiedAt: string | null;
}
export interface VehicleMappings { schemaVersion: 1; version: string; records: VehicleMapping[] }
export interface VehicleSelection { rentalCompany: string | null; make: string; model: string; variant: string; modelYear: number | null }
export const emptyVehicleSelection = (): VehicleSelection => ({ rentalCompany: null, make: "", model: "", variant: "", modelYear: null });
export interface VehicleData { readonly version: string; readonly registry: VehicleRegistry; readonly mappings: VehicleMappings }
export type VehicleResult = { status: "UNKNOWN" } | { status: "VERIFIED"; mapping: VehicleMapping; source: VehicleRegistry["sources"][number]; evidence: VehicleRegistry["sources"][number]["evidence"][number]; version: string };
const validated = new WeakSet<VehicleData>();
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
// Binds review to the entire My Fuel copy, including neutral Japanese recognition labels.
export function vehicleSafetyCopy(locale: Locale): string {
  return JSON.stringify({ version: vehicleCopyVersion, locale, labels: [japaneseLabels.regular, japaneseLabels.highOctane, japaneseLabels.diesel], copy: Object.entries(messages[locale]).filter(([key]) => key.startsWith("myFuel")).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) });
}
export function parseVehicleMappings(value: unknown, version: string, now = Date.now()): VehicleMappings {
  const root = object(value, ["schemaVersion", "version", "records"]);
  requireVehicle(root.schemaVersion === 1 && root.version === version && Array.isArray(root.records), "mapping schema/version");
  const ids = new Set<string>();
  for (const raw of root.records) {
    const row = object(raw, [...scopeKeys, "id", "fuelType", "verificationStatus", "sourceId", "evidenceId", "evidenceVersion", "verifiedAt"]);
    checkScope(row);
    for (const key of ["id", "sourceId", "evidenceId", "evidenceVersion"]) token(row[key]);
    requireVehicle(!ids.has(String(row.id)), "duplicate mapping id"); ids.add(String(row.id));
    requireVehicle(vehicleFuels.includes(row.fuelType as VehicleFuel), "invalid fuel");
    if (row.verificationStatus === "VERIFIED") { requireVehicle(row.fuelType !== "UNKNOWN", "verified UNKNOWN"); date(row.verifiedAt, now); }
    else requireVehicle(row.verificationStatus === "UNKNOWN" && row.fuelType === "UNKNOWN" && row.verifiedAt === null, "unknown must not recommend fuel");
  }
  return root as unknown as VehicleMappings;
}
function freezeDeep(value: object): void {
  Object.values(value).forEach((child) => { if (child && typeof child === "object") freezeDeep(child); });
  Object.freeze(value);
}
export async function validateVehicleData(registryValue: unknown, mappingsValue: unknown, version: string, now = Date.now()): Promise<VehicleData> {
  token(version);
  // Clone so validation cannot freeze or trust mutable caller-owned records.
  const registry = parseVehicleRegistry(structuredClone(registryValue), version, now);
  const mappings = parseVehicleMappings(structuredClone(mappingsValue), version, now);
  for (const review of registry.safetyReview.locales) {
    requireVehicle(review.sha256 === await sha256(new TextEncoder().encode(vehicleSafetyCopy(review.locale))), "safety copy hash mismatch");
  }
  if (mappings.records.length) requireVehicle(registry.safetyReview.status === "APPROVED", "safety review pending");
  for (const row of mappings.records) {
    const source = registry.sources.find((candidate) => candidate.id === row.sourceId);
    requireVehicle(source?.status === "APPROVED" && source.productionEnabled, "source is not approved for production");
    const evidence = source.evidence.find((candidate) => candidate.id === row.evidenceId);
    requireVehicle(evidence && scopeKeys.every((key) => evidence[key] === row[key]) && evidence.version === row.evidenceVersion && evidence.fuelType === row.fuelType, "mapping exceeds exact evidence scope");
    if (row.verifiedAt) requireVehicle(row.verifiedAt >= source.reviewDate!, "mapping predates source review");
  }
  // Overlap is invalid even for equal fuels. A broad record also overlaps a company-specific one.
  for (let i = 0; i < mappings.records.length; i++) {
    const a = mappings.records[i];
    for (const b of mappings.records.slice(i + 1)) {
      const sameVehicle = a.make === b.make && a.model === b.model && a.variant === b.variant;
      const sameCompany = a.rentalCompany === null || b.rentalCompany === null || a.rentalCompany === b.rentalCompany;
      requireVehicle(!(sameVehicle && sameCompany && a.modelYearFrom <= b.modelYearTo && b.modelYearFrom <= a.modelYearTo), "ambiguous or overlapping mapping");
    }
  }
  const data = { version, registry, mappings };
  freezeDeep(data); validated.add(data); return data;
}
export function resolveVehicleFuel(selection: VehicleSelection, data: VehicleData): VehicleResult {
  if (!validated.has(data) || !selection || typeof selection !== "object" || !selection.make || !selection.model || !selection.variant || !Number.isInteger(selection.modelYear)) return { status: "UNKNOWN" };
  const matches = data.mappings.records.filter((row) => (row.rentalCompany === null || row.rentalCompany === selection.rentalCompany) && row.make === selection.make && row.model === selection.model && row.variant === selection.variant && selection.modelYear! >= row.modelYearFrom && selection.modelYear! <= row.modelYearTo);
  if (matches.length !== 1 || matches[0].verificationStatus !== "VERIFIED") return { status: "UNKNOWN" };
  const mapping = matches[0];
  const source = data.registry.sources.find((item) => item.id === mapping.sourceId)!;
  return { status: "VERIFIED", mapping, source, evidence: source.evidence.find((item) => item.id === mapping.evidenceId)!, version: data.version };
}
