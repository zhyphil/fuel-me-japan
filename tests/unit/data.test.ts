import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi, afterEach } from "vitest";
import manifestJson from "../../public/data/manifest.json";
import { fetchArtifact, haversineKm, loadPrefectureStations, nearbyStations, parseDataManifest, parsePriceFile, parseStationFile, selectNearbyPartitions, validateStation, type Artifact, type Station, type StationPartition } from "../../src/lib/stations";
const manifest = parseDataManifest(manifestJson);
function read(artifact: Artifact) {
  const bytes = readFileSync(`public${artifact.path}`);
  expect(bytes.length).toBe(artifact.bytes);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(artifact.sha256);
  return JSON.parse(bytes.toString());
}
const first = manifest.stations.partitions[0];
const station = parseStationFile(read(first), first, manifest.stations.version).stations[0];
afterEach(() => vi.unstubAllGlobals());
describe("M0.1 actual immutable data contracts", () => {
  it("verifies all 48 partitions, uniqueness, bounds, hashes and manifest totals", () => {
    const ids = new Set<string>();
    for (const entry of manifest.stations.partitions) {
      const file = parseStationFile(read(entry), entry, manifest.stations.version);
      for (const station of file.stations) {
        expect(ids.has(station.id)).toBe(false);
        ids.add(station.id);
      }
    }
    expect(ids.size).toBe(manifest.stations.count);
    expect(read(manifest.stations.audit).uniqueObjects).toBe(ids.size);
  });
  it("keeps exact 47 x 3 official facts separate from stations", () => {
    const prices = parsePriceFile(read(manifest.prices), manifest.prices);
    expect(prices.records).toHaveLength(141);
    expect(prices.surveyDate).toBe(manifest.prices.surveyDate);
    expect(prices.publishedAt).toBe(manifest.prices.publishedAt);
    expect(station).not.toHaveProperty("price");
    expect(station).not.toHaveProperty("gogoUrl");
  });
  it("rejects fabricated or malformed station attributes", () => {
    for (const change of [{ fuelRegular: null }, { fuelDiesel: false }, { lat: 0 }, { lon: Infinity }, { id: "123" }, { price: 170 }, { gogoUrl: "https://gogo.gs/shop/123" }, { sourceUpdatedAt: "2099-01-01T00:00:00Z" }]) {
      expect(validateStation({ ...station, ...change }).length).toBeGreaterThan(0);
    }
    expect(validateStation({ ...station, fuelRegular: "UNKNOWN", serviceType: "UNKNOWN" })).toEqual([]);
  });
  it("rejects missing/duplicate/mismatched manifest and price records", () => {
    const data = read(manifest.prices);
    expect(() => parsePriceFile({ ...data, records: data.records.slice(1) })).toThrow();
    expect(() => parsePriceFile({ ...data, unit: "JPY/18L" })).toThrow();
    expect(() => parsePriceFile({ ...data, records: data.records.map((r: unknown, i: number) => i === 1 ? data.records[0] : r) })).toThrow();
    for (const mutate of [
      (d: typeof manifestJson) => { d.stations.count--; },
      (d: typeof manifestJson) => { d.stations.partitions[1] = d.stations.partitions[0]; },
      (d: typeof manifestJson) => { d.sources[0].inputSha256 = "0".repeat(64); },
      (d: typeof manifestJson) => { d.prices.surveyDate = "2026-02-30"; },
    ]) { const changed = structuredClone(manifestJson); mutate(changed); expect(() => parseDataManifest(changed)).toThrow(); }
  });
});
describe("Regional loading, explicit coordinates and straight-line distances", () => {
  it("selects both sides of borders and UNKNOWN using occupied cells", () => {
    const center = { lat: 35, lon: 139 };
    const base = manifest.stations.partitions[0];
    const partitions: StationPartition[] = [
      { ...base, code: "JP-13", bbox: [138.9, 34.9, 139, 35.1], cells: [[138.5, 34.5, 139, 35.5]] },
      { ...base, code: "JP-14", bbox: [139, 34.9, 139.1, 35.1], cells: [[139, 34.5, 139.5, 35.5]] },
      { ...base, code: "UNKNOWN", bbox: [139.01, 35, 139.01, 35], cells: [[139, 35, 139.5, 35.5]] },
      { ...base, code: "JP-01", bbox: [139, 35, 145, 45], cells: [[144.5, 44.5, 145, 45]] },
    ];
    const selected = selectNearbyPartitions({ ...manifest, stations: { ...manifest.stations, partitions } }, center);
    expect(selected.map((p) => p.code)).toEqual(["JP-13", "JP-14", "UNKNOWN"]);
    expect(selectNearbyPartitions(manifest, { lat: 35.68, lon: 139.76 }).length).toBeLessThan(15);
    expect(() => selectNearbyPartitions(manifest, { lat: 0, lon: 0 })).toThrow();
  });
  it("computes Haversine distance, filters radius and deduplicates typed ids", () => {
    expect(haversineKm({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111.195, 3);
    const a = { ...station, lat: 35, lon: 139 } as Station;
    const b = { ...station, id: "osm:node:999", lat: 35.01, lon: 139 } as Station;
    expect(nearbyStations([b, a, a], a).map((s) => s.id)).toEqual([a.id, b.id]);
    expect(nearbyStations([a, b], a, .5)).toHaveLength(1);
  });
  it("manual prefecture loading fetches one partition and invents no distances", async () => {
    const bytes = readFileSync(`public${first.path}`);
    const fetchMock = vi.fn(async () => new Response(bytes));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await loadPrefectureStations(manifest, "JP-01");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]).toBeDefined();
    expect(rows).toHaveLength(first.count);
    expect(rows[0]).not.toHaveProperty("distanceKm");
  });
  it("rejects corrupt bytes and honors aborted responses", async () => {
    const bytes = readFileSync(`public${first.path}`);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes)));
    await expect(fetchArtifact({ ...first, sha256: "0".repeat(64) })).rejects.toThrow("checksum");
    const controller = new AbortController(); controller.abort();
    await expect(fetchArtifact(first, controller.signal)).rejects.toThrow();
  });
});
