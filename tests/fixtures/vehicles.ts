// FICTIONAL TEST DATA ONLY. Names, evidence and approval records below describe no real car or review.
import { createHash } from "node:crypto";
import type { VehicleMapping, VehicleMappings, VehicleSelection } from "../../src/lib/vehicle-fuel";
import { readFileSync } from "node:fs";
import type { Locale, MessageKey } from "../../src/i18n";
import { vehicleCopyVersion, vehicleLocales, type VehicleRegistry } from "../../src/lib/vehicle-sources";
import type { VehicleManifest } from "../../src/lib/vehicle-data";
// Read locale JSON as files: Playwright uses native ESM and does not transform JSON imports.
export const fixtureMessages = Object.fromEntries(vehicleLocales.map((locale) => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<Locale, Record<MessageKey, string>>;
function fixtureSafetyCopy(locale: Locale) {
  return JSON.stringify({ version: vehicleCopyVersion, locale, labels: ["レギュラー", "ハイオク", "軽油"], copy: Object.entries(fixtureMessages[locale]).filter(([key]) => key.startsWith("myFuel")).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0) });
}
export const fixtureNow = Date.parse("2026-09-30T12:00:00Z");
export function vehicleFixture() {
  const version = "fictional-test-1";
  const records: VehicleMapping[] = (["REGULAR", "HIGH_OCTANE", "DIESEL", "UNKNOWN"] as const).map((fuel, i) => ({
    id: `fictional-${i}`, market: "JP", rentalCompany: null, make: "Fictional Test Motors", model: "Imaginary Test Car", variant: `Test ${fuel}`, modelYearFrom: 2020, modelYearTo: 2022,
    fuelType: fuel, verificationStatus: fuel === "UNKNOWN" ? "UNKNOWN" : "VERIFIED", sourceId: "fictional-source", evidenceId: `evidence-${i}`, evidenceVersion: "fictional-evidence-1", verifiedAt: fuel === "UNKNOWN" ? null : "2026-09-20",
  }));
  const mappings: VehicleMappings = { schemaVersion: 1, version, records };
  const registry: VehicleRegistry = { schemaVersion: 1, version, sources: [{
    id: "fictional-source", status: "APPROVED", productionEnabled: true, owner: "Fictional Test Evidence Owner", url: "https://example.test/fictional", purpose: "仅测试：虚构车辆用油", termsUrl: "https://example.test/terms", allowedUseAssessment: "仅测试：虚构授权记录，不是实际许可", attribution: "仅测试：虚构数据", refreshPolicy: "仅测试：人工复核", reviewDate: "2026-09-20", reviewer: "Fictional test reviewer", approvalEvidenceUrl: "https://example.test/fictional-approval", fetchedAt: "2026-09-19T12:00:00Z", sourceUpdatedAt: "UNKNOWN", transformationVersion: "test-1",
    evidence: records.map((row) => ({ market: row.market, rentalCompany: row.rentalCompany, make: row.make, model: row.model, variant: row.variant, modelYearFrom: row.modelYearFrom, modelYearTo: row.modelYearTo, fuelType: row.fuelType, id: row.evidenceId, version: row.evidenceVersion, url: "https://example.test/fictional-manual", locator: `Fictional test table: ${row.evidenceId}` })),
  }], safetyReview: { status: "APPROVED", copyVersion: vehicleCopyVersion, locales: vehicleLocales.map((locale) => ({ locale, sha256: createHash("sha256").update(fixtureSafetyCopy(locale)).digest("hex"), reviewer: "Fictional test reviewer", reviewedAt: "2026-09-20" })) } };
  return { version, registry, mappings };
}
export function exactSelection(variant = "Test REGULAR"): VehicleSelection { return { rentalCompany: null, make: "Fictional Test Motors", model: "Imaginary Test Car", variant, modelYear: 2021 }; }
export function fixtureArtifacts(fixture = vehicleFixture()) {
  const files: Record<string, string> = {};
  const manifest: VehicleManifest = { schemaVersion: 1, version: fixture.version, registry: null!, mappings: null! };
  for (const kind of ["registry", "mappings"] as const) {
    const body = JSON.stringify(fixture[kind]);
    const path = `/data/vehicles/${kind}-${fixture.version}.json`;
    files[path] = body;
    manifest[kind] = { path, version: fixture.version, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") };
  }
  files["/data/vehicles/manifest.json"] = JSON.stringify(manifest);
  return { files, manifest };
}
