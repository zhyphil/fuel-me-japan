import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { filterStations, isPriceStale, navigationUrl, prefecturalPrices } from "../../src/lib/find-fuel";
import type { DataManifest, PriceFile, StationFile } from "../../src/lib/stations";

const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const entry = manifest.stations.partitions.find((partition) => partition.code === "JP-01")!;
const { stations }: StationFile = JSON.parse(readFileSync(`public${entry.path}`, "utf8"));
const prices: PriceFile = JSON.parse(readFileSync(`public${manifest.prices.path}`, "utf8"));

describe("Find Fuel user-facing helpers", () => {
  it("matches recorded city/address and normalized text without filling missing tags", () => {
    const recorded = stations.find((station) => station.city && station.address)!;
    expect(filterStations(stations, recorded.city!)).toContain(recorded);
    expect(filterStations(stations, recorded.address!)).toContain(recorded);
    const en = stations.find((station) => station.name === "ENEOS")!;
    expect(filterStations(stations, "  ｅｎｅｏｓ  ")).toContain(en);
    expect(filterStations(stations, " ")).toBe(stations);
    expect(filterStations(stations, "NoSuchStation_zz_9213")).toEqual([]);
  });
  it("builds external destination-only links and rejects invalid destinations", () => {
    const destination = stations[0];
    const google = new URL(navigationUrl("google", destination));
    const apple = new URL(navigationUrl("apple", destination));
    expect([...google.searchParams]).toEqual([["api", "1"], ["destination", `${destination.lat},${destination.lon}`], ["travelmode", "driving"]]);
    expect([...apple.searchParams]).toEqual([["daddr", `${destination.lat},${destination.lon}`], ["dirflg", "d"]]);
    expect(() => navigationUrl("google", { lat: NaN, lon: 139 })).toThrow();
    expect(() => navigationUrl("apple", { lat: 48.8, lon: 2.3 })).toThrow();
  });
  it("keeps unknown prefecture prices unavailable and separates all three fuels", () => {
    expect(prefecturalPrices(prices, "UNKNOWN").every((row) => row.record === undefined)).toBe(true);
    expect(prefecturalPrices(null, "JP-01").every((row) => row.record === undefined)).toBe(true);
    const rows = prefecturalPrices(prices, "JP-01");
    expect(rows.map((row) => row.fuelType)).toEqual(["REGULAR", "HIGH_OCTANE", "DIESEL"]);
    for (const row of rows) {
      expect(row.record?.prefectureCode).toBe("JP-01");
      expect(row.record?.fuelType).toBe(row.fuelType);
    }
  });
  it("flags references older than fourteen days without depending on machine time", () => {
    expect(isPriceStale("2026-09-28", Date.parse("2026-10-12T00:00:00Z"))).toBe(false);
    expect(isPriceStale("2026-09-28", Date.parse("2026-10-12T00:00:00.001Z"))).toBe(true);
    expect(isPriceStale("invalid", Date.parse("2026-09-30T00:00:00Z"))).toBe(true);
  });
});
