import { describe, expect, it } from "vitest";
import { sortCheapest, sortNearest } from "../../src/lib/station-list";
import { stationPriceViews, type StationQuote } from "../../src/lib/station-price-view";
import type { FuelType, Station } from "../../src/lib/stations";

const now = Date.parse("2026-09-30T10:00:00Z");
const stations: Station[] = Array.from({ length: 30 }, (_, index) => ({ id: `osm:node:${index + 1}`, osmType: "node", osmId: index + 1, lat: 35, lon: 139, prefectureCode: "JP-13", source: "osm", positionMethod: "OSM_NODE", sourceUpdatedAt: "2026-09-01T00:00:00Z", fuelRegular: "UNKNOWN", fuelHighOctane: "UNKNOWN", fuelDiesel: "UNKNOWN", paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", serviceType: "UNKNOWN" }));
const quote = (index: number, price: number, patch: Partial<StationQuote> = {}): StationQuote => ({ stationId: stations[index].id, fuelType: "REGULAR", priceJpyPerL: price, unit: "JPY/L", basis: "CASH_TAX_INCLUDED_GENERAL", sourceId: "test-only", sourceUrl: "https://example.com/fixture", observedAt: "2026-09-30T01:00:00Z", fetchedAt: "2026-09-30T02:00:00Z", validUntil: "2026-10-01T00:00:00Z", ...patch });
const rank = (rows: readonly Station[], quotes: StationQuote[], fuel: FuelType = "REGULAR") => sortCheapest(rows, stationPriceViews(rows, quotes, fuel, now), fuel);
const ids = (rows: readonly Station[]) => rows.map((station) => station.id);

describe("station list ranking", () => {
  it("uses numeric prices, stable ties and unknowns last without mutating any input", () => {
    const rows = stations.slice(0, 6);
    const quotes = [quote(0, 200), quote(1, 90), quote(2, 100), quote(3, 90)];
    const copy = structuredClone({ rows, quotes });
    rows.forEach(Object.freeze); Object.freeze(rows); quotes.forEach(Object.freeze); Object.freeze(quotes);
    const result = rank(rows, quotes);
    expect(result.ranking).toBe("ranked");
    expect(ids(result.stations)).toEqual(["osm:node:2", "osm:node:4", "osm:node:3", "osm:node:1", "osm:node:5", "osm:node:6"]);
    expect({ rows, quotes }).toEqual(copy);
  });
  it("compares selected fuel only and ignores views for another fuel", () => {
    const rows = stations.slice(0, 2);
    const quotes = [quote(0, 110), quote(1, 100), quote(0, 130, { fuelType: "DIESEL" }), quote(1, 150, { fuelType: "DIESEL" }), quote(0, 190, { fuelType: "HIGH_OCTANE" }), quote(1, 180, { fuelType: "HIGH_OCTANE" })];
    expect(ids(rank(rows, quotes).stations)).toEqual(["osm:node:2", "osm:node:1"]);
    expect(ids(rank(rows, quotes, "DIESEL").stations)).toEqual(["osm:node:1", "osm:node:2"]);
    expect(ids(rank(rows, quotes, "HIGH_OCTANE").stations)).toEqual(["osm:node:2", "osm:node:1"]);
    expect(sortCheapest(rows, stationPriceViews(rows, quotes, "REGULAR", now), "DIESEL").ranking).toBe("no-quotes");
  });
  it("ranks the full set before pagination", () => {
    const result = rank(stations, stations.map((_, index) => quote(index, 200 - index)));
    expect(result.stations.slice(0, 25).map((station) => station.osmId)).toEqual(Array.from({ length: 25 }, (_, index) => 30 - index));
    expect(result.stations.slice(25).map((station) => station.osmId)).toEqual([5, 4, 3, 2, 1]);
  });
  it("preserves base order with no quotes or a single valid quote", () => {
    const rows = stations.slice(0, 3);
    expect(rank(rows, [])).toEqual({ stations: rows, ranking: "no-quotes" });
    expect(rank(rows, [quote(2, 100)])).toEqual({ stations: rows, ranking: "not-comparable" });
  });
  it.each(["prefecture", "source", "day", "unknown-region"])("does not rank incomparable %s groups but allows a comparable filtered subset", (kind) => {
    const rows = stations.slice(0, 4).map((s) => ({ ...s }));
    const quotes = rows.map((_, index) => quote(index, 190 - index * 10));
    if (kind === "prefecture") rows[2].prefectureCode = "JP-01";
    if (kind === "unknown-region") rows[2].prefectureCode = "UNKNOWN";
    if (kind === "source") quotes[2].sourceId = "another-source";
    if (kind === "day") quotes[2].observedAt = "2026-09-29T01:00:00Z";
    const views = stationPriceViews(rows, quotes, "REGULAR", now);
    expect(sortCheapest(rows, views, "REGULAR")).toEqual({ stations: rows, ranking: "not-comparable" });
    expect(ids(sortCheapest(rows.filter((_, index) => index !== 2), views, "REGULAR").stations)).toEqual(["osm:node:4", "osm:node:2", "osm:node:1"]);
  });
  it("uses Japan observation day rather than UTC day", () => {
    const rows = stations.slice(0, 2);
    expect(rank(rows, [quote(0, 180, { observedAt: "2026-09-29T15:30:00Z" }), quote(1, 170)]).ranking).toBe("ranked");
    expect(rank(rows, [quote(0, 180, { observedAt: "2026-09-29T14:30:00Z" }), quote(1, 170)]).ranking).toBe("not-comparable");
  });
  it("keeps explicit NO, stale and ambiguous duplicate prices out of ranking", () => {
    const rows = stations.slice(0, 5).map((s, index) => ({ ...s, fuelRegular: index === 0 ? "NO" as const : "UNKNOWN" as const }));
    const result = rank(rows, [quote(0, 1), quote(1, 2, { validUntil: "2026-09-30T09:00:00Z" }), quote(2, 3), quote(2, 4), quote(3, 180), quote(4, 170)]);
    expect(ids(result.stations)).toEqual(["osm:node:5", "osm:node:4", "osm:node:1", "osm:node:2", "osm:node:3"]);
  });
  it("sorts only finite nonnegative distances, preserving ties and missing order", () => {
    const rows = [{ id: "a", distanceKm: 12 }, { id: "b", distanceKm: 2 }, { id: "c", distanceKm: 2 }, { id: "d" }, { id: "e", distanceKm: NaN }, { id: "f", distanceKm: -1 }, { id: "g", distanceKm: Infinity }, { id: "h", distanceKm: 0 }];
    const copy = structuredClone(rows); Object.freeze(rows);
    expect(sortNearest(rows).map((row) => row.id)).toEqual(["h", "b", "c", "a", "d", "e", "f", "g"]);
    expect(rows).toEqual(copy);
  });
});
