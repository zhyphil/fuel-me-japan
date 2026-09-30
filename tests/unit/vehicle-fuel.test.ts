import { readFile } from "node:fs/promises";
import { describe, expect, it, vi, afterEach } from "vitest";
import { decodeVehicleArtifact, loadVehicleData, parseVehicleManifest } from "../../src/lib/vehicle-data";
import { emptyVehicleSelection, parseVehicleMappings, resolveVehicleFuel, validateVehicleData, type VehicleData, type VehicleSelection } from "../../src/lib/vehicle-fuel";
import { parseVehicleRegistry, safeUrl } from "../../src/lib/vehicle-sources";
import { exactSelection, fixtureArtifacts, fixtureNow, vehicleFixture } from "../fixtures/vehicles";

const validate = (fixture = vehicleFixture()) => validateVehicleData(fixture.registry, fixture.mappings, fixture.version, fixtureNow);
afterEach(() => vi.unstubAllGlobals());
describe("exact vehicle and independent approval gates", () => {
  it.each(["REGULAR", "HIGH_OCTANE", "DIESEL"])("resolves only the exact reviewed fictional %s", async (fuel) => {
    const data = await validate();
    expect(resolveVehicleFuel(exactSelection(`Test ${fuel}`), data)).toMatchObject({ status: "VERIFIED", mapping: { fuelType: fuel } });
    expect(Object.isFrozen(data.mappings.records[0])).toBe(true);
  });
  it("retains UNKNOWN and rejects unvalidated casts", async () => {
    const data = await validate();
    expect(resolveVehicleFuel(exactSelection("Test UNKNOWN"), data)).toEqual({ status: "UNKNOWN" });
    expect(resolveVehicleFuel(exactSelection(), { ...data } as VehicleData)).toEqual({ status: "UNKNOWN" });
    expect(resolveVehicleFuel(emptyVehicleSelection(), data)).toEqual({ status: "UNKNOWN" });
    expect(resolveVehicleFuel(null as unknown as VehicleSelection, data)).toEqual({ status: "UNKNOWN" });
  });
  it.each([
    { make: "fictional test motors" }, { model: "Imaginary" }, { variant: "" }, { variant: "UNKNOWN" },
    { modelYear: null }, { modelYear: 2019 }, { modelYear: 2023 }, { modelYear: 2020.5 },
  ])("does not guess missing, similar or out-of-range selection: %j", async (change) => {
    expect(resolveVehicleFuel({ ...exactSelection(), ...change }, await validate())).toEqual({ status: "UNKNOWN" });
  });
  it("includes exact range endpoints", async () => {
    const data = await validate();
    for (const modelYear of [2020, 2022]) expect(resolveVehicleFuel({ ...exactSelection(), modelYear }, data).status).toBe("VERIFIED");
  });
  it("honors explicit company scope, with no cross-company or omitted-company fallback", async () => {
    const fixture = vehicleFixture();
    fixture.mappings.records[0].rentalCompany = "Fictional Rental A";
    fixture.registry.sources[0].evidence[0].rentalCompany = "Fictional Rental A";
    const data = await validate(fixture);
    for (const rentalCompany of [null, "Fictional Rental B"]) expect(resolveVehicleFuel({ ...exactSelection(), rentalCompany }, data).status).toBe("UNKNOWN");
    expect(resolveVehicleFuel({ ...exactSelection(), rentalCompany: "Fictional Rental A" }, data).status).toBe("VERIFIED");
    expect(resolveVehicleFuel({ ...exactSelection("Test DIESEL"), rentalCompany: "Fictional Rental B" }, data).status).toBe("VERIFIED");
  });
  it.each(["duplicate-id", "same-fuel-overlap", "conflicting-fuel", "broad-company-overlap"])("rejects ambiguity: %s", async (kind) => {
    const fixture = vehicleFixture();
    const copy = { ...fixture.mappings.records[0] };
    if (kind !== "duplicate-id") { copy.id = "second"; copy.evidenceId = "second-evidence"; }
    if (kind === "conflicting-fuel") copy.fuelType = "DIESEL";
    if (kind === "broad-company-overlap") copy.rentalCompany = "Fictional Rental A";
    fixture.mappings.records.push(copy);
    if (kind !== "duplicate-id") fixture.registry.sources[0].evidence.push({ ...fixture.registry.sources[0].evidence[0], id: copy.evidenceId, fuelType: copy.fuelType, rentalCompany: copy.rentalCompany });
    await expect(validate(fixture)).rejects.toThrow();
  });
  it.each([
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].productionEnabled = false; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].status = "PENDING_REVIEW"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources = []; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].allowedUseAssessment = ""; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].approvalEvidenceUrl = null; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].evidence[0].variant = "Other variant"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].evidence[0].modelYearTo = 2021; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].evidence[0].rentalCompany = "Fictional A"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].evidenceVersion = "other"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].variant = "UNKNOWN"; f.registry.sources[0].evidence[0].variant = "UNKNOWN"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].modelYearTo = 2019; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].evidence[0].url = "javascript:alert(1)"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].verificationStatus = "UNKNOWN"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].fuelType = "UNKNOWN"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].verifiedAt = "2099-01-01"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].verifiedAt = "2026-02-30"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.mappings.records[0].verifiedAt = "2026-09-19"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].reviewDate = "2099-01-01"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.sources[0].fetchedAt = "2026-02-30T12:00:00Z"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.copyVersion = "old"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.locales.pop(); },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.locales[1] = f.registry.safetyReview.locales[0]; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.locales[0].reviewedAt = "2099-01-01"; },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.locales[0].sha256 = "0".repeat(64); },
    (f: ReturnType<typeof vehicleFixture>) => { f.registry.safetyReview.status = "PENDING_REVIEW"; f.registry.safetyReview.locales.forEach((row) => { row.reviewer = null; row.reviewedAt = null; }); },
  ])("fails closed on unapproved, malformed, stale-copy or out-of-scope data #%#", async (mutate) => {
    const fixture = vehicleFixture(); mutate(fixture); await expect(validate(fixture)).rejects.toThrow();
  });
  it("rejects unknown fields and versions", () => {
    const f = vehicleFixture();
    expect(() => parseVehicleRegistry({ ...f.registry, implicitApproval: true }, f.version, fixtureNow)).toThrow();
    expect(() => parseVehicleMappings({ ...f.mappings, version: "old" }, f.version, fixtureNow)).toThrow();
  });
  it.each(["http://example.test/", "javascript:alert(1)", "https://user:pass@example.test/", "//example.test/a", "https://example.test\\@evil.test", "https://localhost/a", "https://127.0.0.1/a"])("rejects unsafe evidence URL %s", (url) => expect(() => safeUrl(url)).toThrow());
});

describe("versioned artifacts and loader", () => {
  it.each(["https://evil.test/a", "//evil.test/a", "/data/vehicles/../x", "/data/vehicles/%2e%2e/x", "/data/vehicles/registry-fictional-test-1.json?url=evil", "/data/source-registry.json"])("rejects unsafe/noncanonical path %s", (path) => {
    const { manifest } = fixtureArtifacts(); manifest.registry.path = path; expect(() => parseVehicleManifest(manifest)).toThrow();
  });
  it("rejects mismatched versions, malformed bytes and checksum changes", async () => {
    const { manifest, files } = fixtureArtifacts();
    expect(() => parseVehicleManifest({ ...manifest, version: "other" })).toThrow();
    const bytes = new TextEncoder().encode(files[manifest.registry.path]);
    await expect(decodeVehicleArtifact(bytes, { ...manifest.registry, bytes: bytes.length + 1 })).rejects.toThrow();
    bytes[bytes.length - 1] = 32;
    await expect(decodeVehicleArtifact(bytes, manifest.registry)).rejects.toThrow();
  });
  it("loads hash-checked data using only same-origin privacy-preserving requests", async () => {
    const { files } = fixtureArtifacts();
    const fetcher = vi.fn(async (path: string) => new Response(files[path], { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const data = await loadVehicleData(new AbortController().signal);
    expect(resolveVehicleFuel(exactSelection(), data).status).toBe("VERIFIED");
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const call of fetcher.mock.calls) {
      expect(call[0]).toMatch(/^\/data\/vehicles\//);
      expect((call as unknown[])[1]).toMatchObject({ mode: "same-origin", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
    }
  });
  it.each(["http", "json", "hash", "abort"])("fails safely on %s loading errors", async (failure) => {
    const { files, manifest } = fixtureArtifacts();
    const controller = new AbortController();
    if (failure === "abort") controller.abort();
    if (failure === "json") files["/data/vehicles/manifest.json"] = "{";
    if (failure === "hash") files[manifest.mappings.path] += " ";
    vi.stubGlobal("fetch", vi.fn(async (path: string) => new Response(files[path], { status: failure === "http" ? 503 : 200 })));
    await expect(loadVehicleData(controller.signal)).rejects.toThrow();
  });
  it("ships empty mappings, no approved source or review claim, and matching safety hashes", async () => {
    const manifest = parseVehicleManifest(JSON.parse(await readFile("public/data/vehicles/manifest.json", "utf8")));
    const [registry, mappings] = await Promise.all([manifest.registry, manifest.mappings].map(async (artifact) => decodeVehicleArtifact(await readFile(`public${artifact.path}`), artifact)));
    const data = await validateVehicleData(registry, mappings, manifest.version);
    expect(data.mappings.records).toEqual([]); expect(data.registry.sources).toEqual([]);
    expect(data.registry.safetyReview.status).toBe("PENDING_REVIEW");
    expect(data.registry.safetyReview.locales.every((row) => row.reviewer === null && row.reviewedAt === null)).toBe(true);
    expect(resolveVehicleFuel(exactSelection(), data).status).toBe("UNKNOWN");
  });
});
