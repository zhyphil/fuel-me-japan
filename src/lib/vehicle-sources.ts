// Structural checks are necessary integrity gates, never a substitute for human approval.
export const vehicleLocales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
export const vehicleCopyVersion = "my-fuel-1";
export const vehicleFuels = ["REGULAR", "HIGH_OCTANE", "DIESEL", "UNKNOWN"] as const;
export type VehicleFuel = typeof vehicleFuels[number];
export interface VehicleScope {
  market: "JP";
  rentalCompany: string | null;
  make: string;
  model: string;
  variant: string;
  modelYearFrom: number;
  modelYearTo: number;
}
export interface VehicleEvidence extends VehicleScope {
  id: string; url: string; locator: string; version: string; fuelType: VehicleFuel;
}
export interface VehicleSource {
  id: string; status: "APPROVED" | "PENDING_REVIEW"; productionEnabled: boolean;
  owner: string; url: string; purpose: string; termsUrl: string;
  allowedUseAssessment: string; attribution: string; refreshPolicy: string;
  reviewDate: string | null; reviewer: string | null; approvalEvidenceUrl: string | null;
  fetchedAt: string; sourceUpdatedAt: string; transformationVersion: string;
  evidence: VehicleEvidence[];
}
export interface SafetyReview {
  status: "APPROVED" | "PENDING_REVIEW"; copyVersion: string;
  locales: { locale: typeof vehicleLocales[number]; sha256: string; reviewer: string | null; reviewedAt: string | null }[];
}
export interface VehicleRegistry { schemaVersion: 1; version: string; sources: VehicleSource[]; safetyReview: SafetyReview }
export function requireVehicle(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`Vehicle data: ${message}`);
}
export function object(value: unknown, keys: readonly string[]): Record<string, unknown> {
  requireVehicle(value !== null && typeof value === "object" && !Array.isArray(value), "expected object");
  const data = value as Record<string, unknown>;
  requireVehicle(Object.keys(data).length === keys.length && keys.every((key) => Object.hasOwn(data, key)), "unexpected or missing fields");
  return data;
}
export function text(value: unknown): asserts value is string {
  requireVehicle(typeof value === "string" && value.length > 0 && value.length <= 2000 && value === value.trim() && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127), "invalid text");
}
export function token(value: unknown): asserts value is string { text(value); requireVehicle(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value), "invalid identifier"); }
export function hash(value: unknown): asserts value is string { requireVehicle(typeof value === "string" && /^[a-f0-9]{64}$/.test(value), "invalid hash"); }
export function safeUrl(value: unknown): asserts value is string {
  text(value);
  requireVehicle(!/[\s\\]/.test(value), "unsafe URL");
  const url = new URL(value);
  requireVehicle(url.protocol === "https:" && !url.username && !url.password && !url.port && url.hostname.includes(".") && !url.hostname.endsWith(".") && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname), "unsafe URL");
}
export function date(value: unknown, now: number, timestamp = false): asserts value is string {
  text(value);
  const pattern = timestamp ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/ : /^\d{4}-\d{2}-\d{2}$/;
  const time = Date.parse(value);
  requireVehicle(pattern.test(value) && Number.isFinite(time) && new Date(time).toISOString().replace(".000", "").slice(0, timestamp ? 20 : 10) === value && time <= now, "invalid or future date");
}
export const scopeKeys = ["market", "rentalCompany", "make", "model", "variant", "modelYearFrom", "modelYearTo"] as const;
export function checkScope(data: Record<string, unknown>) {
  requireVehicle(data.market === "JP", "unsupported market");
  if (data.rentalCompany !== null) text(data.rentalCompany);
  for (const key of ["make", "model", "variant"] as const) {
    text(data[key]);
    requireVehicle(!["unknown", "unspecified", "all", "*", "n/a"].includes(data[key].toLowerCase()), "unknown vehicle scope");
  }
  requireVehicle(Number.isInteger(data.modelYearFrom) && Number.isInteger(data.modelYearTo) && Number(data.modelYearFrom) >= 1900 && Number(data.modelYearTo) <= 2100 && Number(data.modelYearFrom) <= Number(data.modelYearTo), "invalid exact model-year range");
}
export function parseVehicleRegistry(value: unknown, version: string, now = Date.now()): VehicleRegistry {
  const root = object(value, ["schemaVersion", "version", "sources", "safetyReview"]);
  requireVehicle(root.schemaVersion === 1 && root.version === version && Array.isArray(root.sources), "registry version/schema");
  const ids = new Set<string>();
  for (const raw of root.sources) {
    const source = object(raw, ["id", "status", "productionEnabled", "owner", "url", "purpose", "termsUrl", "allowedUseAssessment", "attribution", "refreshPolicy", "reviewDate", "reviewer", "approvalEvidenceUrl", "fetchedAt", "sourceUpdatedAt", "transformationVersion", "evidence"]);
    token(source.id); requireVehicle(!ids.has(source.id), "duplicate source"); ids.add(source.id);
    for (const key of ["owner", "purpose", "allowedUseAssessment", "attribution", "refreshPolicy", "transformationVersion"]) text(source[key]);
    safeUrl(source.url); safeUrl(source.termsUrl); date(source.fetchedAt, now, true);
    if (source.sourceUpdatedAt !== "UNKNOWN") date(source.sourceUpdatedAt, now, true);
    requireVehicle(source.status === "APPROVED" || source.status === "PENDING_REVIEW", "source status");
    requireVehicle(typeof source.productionEnabled === "boolean", "source enabled flag");
    if (source.status === "APPROVED") {
      date(source.reviewDate, now); text(source.reviewer); safeUrl(source.approvalEvidenceUrl);
      requireVehicle(Date.parse(String(source.reviewDate)) >= Date.parse(String(source.fetchedAt).slice(0, 10)), "review precedes fetched evidence");
    } else requireVehicle(!source.productionEnabled && source.reviewDate === null && source.reviewer === null && source.approvalEvidenceUrl === null, "pending source cannot claim approval");
    requireVehicle(Array.isArray(source.evidence), "source evidence");
    const evidenceIds = new Set<string>();
    for (const rawEvidence of source.evidence) {
      const evidence = object(rawEvidence, [...scopeKeys, "id", "url", "locator", "version", "fuelType"]);
      checkScope(evidence); token(evidence.id); token(evidence.version); text(evidence.locator); safeUrl(evidence.url);
      requireVehicle(vehicleFuels.includes(evidence.fuelType as VehicleFuel) && !evidenceIds.has(evidence.id), "fuel or duplicate evidence"); evidenceIds.add(evidence.id);
    }
  }
  const review = object(root.safetyReview, ["status", "copyVersion", "locales"]);
  requireVehicle(review.status === "APPROVED" || review.status === "PENDING_REVIEW", "safety status");
  requireVehicle(review.copyVersion === vehicleCopyVersion && Array.isArray(review.locales) && review.locales.length === vehicleLocales.length, "safety copy version/locales");
  const reviewed = new Set<string>();
  for (const raw of review.locales) {
    const entry = object(raw, ["locale", "sha256", "reviewer", "reviewedAt"]);
    requireVehicle(vehicleLocales.includes(entry.locale as typeof vehicleLocales[number]) && !reviewed.has(String(entry.locale)), "safety locale coverage");
    reviewed.add(String(entry.locale)); hash(entry.sha256);
    if (review.status === "APPROVED") { text(entry.reviewer); date(entry.reviewedAt, now); }
    else requireVehicle(entry.reviewer === null && entry.reviewedAt === null, "pending safety cannot claim review");
  }
  return root as unknown as VehicleRegistry;
}
