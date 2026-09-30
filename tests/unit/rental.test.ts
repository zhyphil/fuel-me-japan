import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  canSelectRentalDestination, findRentalById, loadRentalIndex, loadRentalLocation, loadRentalManifest,
  loadRentalPartition, parseIndex, parseManifest, parsePartition, rentalManifestUrl,
  rentalNeedsRecheck, rentalRuleFor, searchRentals, type RentalArtifact,
} from "../../src/lib/rental";

function json(url: string): unknown { return JSON.parse(readFileSync(`public${url}`, "utf8")); }
const manifest = parseManifest(json(rentalManifestUrl));
const index = parseIndex(json(manifest.index.url), manifest);
const partitions = manifest.partitions.map(p => parsePartition(json(p.url), manifest, index));
const records = partitions.flatMap(p => p.records);
const tokyo = partitions.find(p => p.prefectureCode === "JP-13")!;
const clone = <T>(v: T): T => structuredClone(v);
afterEach(() => vi.unstubAllGlobals());

describe("nationwide rental artifacts", () => {
  it("strictly parses every record and all 48 partitions against index and manifest", () => {
    expect(partitions).toHaveLength(48);
    expect(records).toHaveLength(manifest.count);
    expect(new Set(records.map(r => r.id)).size).toBe(manifest.count);
    expect(new Set(records.flatMap(r => r.sources.map(s => s.key))).size).toBe(records.reduce((n, r) => n + r.sources.length, 0));
    for (const a of manifest.downloads) {
      const bytes = readFileSync(`public${a.url}`);
      expect(bytes.byteLength).toBe(a.bytes);
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(a.sha256);
    }
  });
  it("retains only seven official Times facilities and no verified vehicle entrance", () => {
    const official = records.filter(r => r.verification === "OFFICIAL_FACILITY_CHECKED");
    expect(official.map(r => r.airportCode).sort()).toEqual(["CTS", "FUK", "HND", "KIX", "NGO", "NRT", "OKA"]);
    expect(records.every(r => r.vehicleEntranceStatus === "NOT_VERIFIED")).toBe(true);
    expect(official.find(r => r.airportCode === "KIX")?.positionKind).toBe("FACILITY_REFERENCE");
    for (const r of official) expect(r.official?.checkedAt).toBe("2026-09-30");
  });
  it("keeps counters unverified and unavailable as return destinations", () => {
    const counters = records.filter(r => r.candidateStatus === "COUNTER_ONLY");
    expect(counters.length).toBeGreaterThan(0);
    expect(counters.every(r => !canSelectRentalDestination(r) && r.official === null && r.verification === "NOT_VERIFIED")).toBe(true);
    expect(searchRentals(index, { limit: 10000 }).every(canSelectRentalDestination)).toBe(true);
    expect(searchRentals(index, { limit: 10000, includeCounters: true })).toHaveLength(manifest.count);
  });
  it("never applies Times rules to another company", () => {
    const other = records.find(r => r.companyId === "toyota")!;
    expect(rentalRuleFor(other)).toBeNull();
    const times = records.find(r => r.companyId === "times")!;
    expect(rentalRuleFor(times)?.fullTank).toBe("STANDARD_SUBJECT_TO_CONTRACT");
    const invalid = clone(partitions.find(p => p.records.some(r => r.id === other.id))!);
    invalid.records.find(r => r.id === other.id)!.returnRule = times.returnRule;
    expect(() => parsePartition(invalid)).toThrow();
  });
  it("preserves original brand evidence without replacing Narita's name", () => {
    const r = records.find(r => r.airportCode === "NRT")!;
    expect(r.names.primary).toContain("成田");
    expect(r.names.primary).not.toContain("宮崎");
    expect(r.sources.find(s => s.sourceId === "overture")?.attributes.brand).toBeTruthy();
    expect(r.sourceIds).toEqual(["osm", "overture", "times-official"]);
  });
});

describe("strict parsers reject corruption", () => {
  it.each([
    ["version", (m: typeof manifest) => { m.version = "rental-v9-abcdefabcdefabcd"; }],
    ["count", (m: typeof manifest) => { m.count++; }],
    ["path traversal", (m: typeof manifest) => { m.index.url = "/data/rental/nationwide/../secret.json"; }],
    ["external path", (m: typeof manifest) => { m.index.url = "https://x.test/index.json"; }],
    ["duplicate partition", (m: typeof manifest) => { m.partitions[1] = m.partitions[0]; }],
    ["missing download", (m: typeof manifest) => { m.downloads.pop(); }],
    ["missing license", (m: typeof manifest) => { m.licenses.pop(); }],
    ["hash", (m: typeof manifest) => { m.index.sha256 = "bad"; }],
    ["bytes", (m: typeof manifest) => { m.index.bytes = -1; }],
    ["source license", (m: typeof manifest) => { m.sources[0].licenses = ["CC0-1.0"]; }],
    ["duplicate source", (m: typeof manifest) => { m.sources[1] = m.sources[0]; }],
  ] as const)("rejects manifest %s", (_name, mutate) => {
    const m = clone(manifest); mutate(m); expect(() => parseManifest(m)).toThrow();
  });
  it.each([
    ["duplicate ID", (data: typeof index) => { data.records[1].id = data.records[0].id; }],
    ["duplicate alias", (data: typeof index) => { data.records[1].aliases = [data.records[0].id]; }],
    ["nonfinite latitude", (data: typeof index) => { data.records[0].lat = Infinity; }],
    ["outside Japan", (data: typeof index) => { data.records[0].lon = 100; }],
    ["unsafe ID", (data: typeof index) => { data.records[0].id = "__proto__"; }],
    ["count", (data: typeof index) => { data.count--; }],
    ["wrong prefecture", (data: typeof index) => { data.records[0].prefectureCode = "JP-99"; }],
    ["fabricated official status", (data: typeof index) => { data.records[0].verification = "OFFICIAL_FACILITY_CHECKED"; }],
    ["wrong company", (data: typeof index) => { data.records.find(r => r.airportCode === "KIX")!.companyId = "orix"; }],
  ] as const)("rejects index %s", (_name, mutate) => {
    const data = clone(index); mutate(data); expect(() => parseIndex(data, manifest)).toThrow();
  });
  it("rejects nested prototype pollution and nonplain objects", () => {
    const data = clone(index);
    data.records[0].names.languages = JSON.parse('{"__proto__":{"polluted":true}}');
    expect(() => parseIndex(data)).toThrow();
    Object.setPrototypeOf(data.records[0].names, { primary: "forged" });
    expect(() => parseIndex(data)).toThrow();
    expect(Object.hasOwn({}, "polluted")).toBe(false);
  });
  it("rejects unknown fields, missing coordinates, source provenance and index/detail drift", () => {
    const data = clone(tokyo);
    Object.assign(data.records[0], { guessedHours: "24/7" });
    expect(() => parsePartition(data)).toThrow();
    const missing = clone(tokyo); Reflect.deleteProperty(missing.records[0], "lat");
    expect(() => parsePartition(missing)).toThrow();
    const badSource = clone(tokyo); badSource.records[0].sources[0].recordId = "fake";
    expect(() => parsePartition(badSource)).toThrow();
    const drift = clone(tokyo); drift.records[0].lat += .001;
    expect(() => parsePartition(drift, manifest, index)).toThrow();
    const wrong = clone(tokyo); wrong.records[0].prefectureCode = "JP-12";
    expect(() => parsePartition(wrong)).toThrow();
  });
  it("rejects an unapproved Overture source and dropped upstream license", () => {
    const data = clone(tokyo); const m = data.records.flatMap(r => r.sources).find(s => s.sourceId === "overture")!;
    (m.attributes.sources as { dataset: string }[])[0].dataset = "unapproved";
    expect(() => parsePartition(data)).toThrow();
    const dropped = clone(tokyo); dropped.records.flatMap(r => r.sources).find(s => s.sourceId === "overture")!.licenses = ["CC0-1.0"];
    expect(() => parsePartition(dropped)).toThrow();
  });
  it("rejects official entrance, changed date, and counter upgrades", () => {
    const data = clone(tokyo); const official = data.records.find(r => r.airportCode === "HND")!;
    official.official!.checkedAt = "2026-10-01";
    expect(() => parsePartition(data)).toThrow();
    const entrance = clone(tokyo); Object.assign(entrance.records[0], { vehicleEntranceStatus: "VERIFIED" });
    expect(() => parsePartition(entrance)).toThrow();
    const counter = clone(tokyo); counter.records.find(r => r.candidateStatus === "COUNTER_ONLY")!.candidateStatus = "OFFICIAL_RETURN_FACILITY";
    expect(() => parsePartition(counter)).toThrow();
  });
});

describe("search, aliases, freshness and lazy requests", () => {
  it("treats a complete supported airport code as an exact airport lookup", () => {
    expect(searchRentals(index, { query: "ＯＫＡ", limit: 10000 }).map(row => row.id)).toEqual(["times-naha-airport"]);
    expect(searchRentals(index, { query: "fuk", limit: 10000 }).map(row => row.id)).toEqual(["times-fukuoka-airport-international"]);
    expect(searchRentals(index, { query: "Fukuoka", limit: 10000 }).length).toBeGreaterThan(1);
  });
  it("searches original/language names, company, airport and address with NFKC normalization", () => {
    expect(searchRentals(index, { query: "ＮＲＴ" }).map(r => r.id)).toContain("times-narita-airport");
    expect(searchRentals(index, { query: "小菅", companyId: "times" }).map(r => r.id)).toContain("times-narita-airport");
    expect(searchRentals(index, { airportCode: "CTS" }).map(r => r.id)).toEqual(["times-new-chitose-airport"]);
    expect(searchRentals(index, { companyId: "toyota", prefectureCode: "JP-13", limit: 3 })).toHaveLength(3);
    expect(searchRentals(index, { query: "unmatchable text 999999" })).toEqual([]);
    expect(() => searchRentals(index, { limit: -1 })).toThrow();
  });
  it("resolves historical aliases without depending on names", () => {
    const data = clone(index); data.records[0].aliases.push("rental-old-identity");
    expect(findRentalById(data, "rental-old-identity")?.id).toBe(data.records[0].id);
    expect(searchRentals(data, { query: "rental-old-identity", includeCounters: true })[0].id).toBe(data.records[0].id);
  });
  it("does not renew official dates and flags 90 days", () => {
    const day = Date.parse("2026-09-30T00:00:00Z");
    expect(rentalNeedsRecheck("2026-09-30", day + 90 * 86400000 - 1)).toBe(false);
    expect(rentalNeedsRecheck("2026-09-30", day + 90 * 86400000)).toBe(true);
    expect(rentalNeedsRecheck("2026-02-30", day)).toBe(true);
    expect(rentalNeedsRecheck("2026-10-01", day)).toBe(true);
    expect(manifest.reviewDate).toBe("2026-09-30");
  });
  it("fetches manifest, then index, then exactly the requested partition with AbortSignal", async () => {
    const fetcher = vi.fn(async (url: string) => new Response(readFileSync(`public${url}`)));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const m = await loadRentalManifest(controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const i = await loadRentalIndex(m, controller.signal);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const location = await loadRentalLocation(m, i, "times-naha-airport", controller.signal);
    expect(location.id).toBe("times-naha-airport");
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(fetcher).toHaveBeenLastCalledWith(m.partitions.find(p => p.code === "JP-47")!.url, { signal: controller.signal, cache: "no-cache" });
    await expect(loadRentalPartition(m, "JP-99")).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("rejects HTTP errors, byte/hash mismatch and malformed JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("no", { status: 503 })); vi.stubGlobal("fetch", fetcher);
    await expect(loadRentalManifest()).rejects.toThrow("503");
    fetcher.mockResolvedValue(new Response("{}")); await expect(loadRentalIndex(manifest)).rejects.toThrow("byte count");
    const bytes = readFileSync(`public${manifest.index.url}`); bytes[100] = bytes[100] === 65 ? 66 : 65;
    fetcher.mockResolvedValue(new Response(bytes)); await expect(loadRentalIndex(manifest)).rejects.toThrow("SHA256");
    fetcher.mockResolvedValue(new Response("{")); await expect(loadRentalManifest()).rejects.toThrow();
  });
  it("honors cancellation before fetch and after body read", async () => {
    const controller = new AbortController(); controller.abort();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(loadRentalManifest(controller.signal)).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
    const late = new AbortController();
    fetcher.mockResolvedValue({ ok: true, arrayBuffer: async () => { late.abort(); return new ArrayBuffer(0); } });
    await expect(loadRentalIndex(manifest, late.signal)).rejects.toThrow();
  });
  it("every manifest asset URL remains confined to the versioned data root", () => {
    manifest.downloads.forEach((a: RentalArtifact) => expect(a.url.startsWith("/data/rental/nationwide/")).toBe(true));
  });
});
