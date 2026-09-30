import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadRentalData, parseRentalData, rentalNeedsRecheck, timesHomeUrl } from "../../src/lib/return-car";
import { locales, messages } from "../../src/i18n";
import { createAnalytics } from "../../src/lib/analytics";
import { returnCandidates } from "../../src/lib/return-car";
import type { Station } from "../../src/lib/stations";

const point = { lat: 26.2110555, lon: 127.6582094 };
function station(id: number, lat: number, overrides: Partial<Station> = {}): Station {
  return { id: `osm:node:${id}`, osmId: id, osmType: "node", lat, lon: point.lon, prefectureCode: "JP-47", fuelRegular: "UNKNOWN", fuelHighOctane: "UNKNOWN", fuelDiesel: "UNKNOWN", paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", serviceType: "UNKNOWN", source: "osm", positionMethod: "OSM_NODE", sourceUpdatedAt: "2026-09-29T00:00:00Z", ...overrides };
}
describe("return-car candidates", () => {
  it("excludes explicit NO for only the chosen fuel, keeps UNKNOWN without inventing supply", () => {
    const rows = [station(1, point.lat, { fuelRegular: "NO", fuelDiesel: "YES" }), station(2, 26.22), station(3, 26.23, { fuelRegular: "YES", fuelDiesel: "NO" })];
    expect(returnCandidates(rows, point, "REGULAR").map(s => s.id)).toEqual(["osm:node:2", "osm:node:3"]);
    expect(returnCandidates(rows, point, "DIESEL").map(s => s.id)).toEqual(["osm:node:1", "osm:node:2"]);
    expect(returnCandidates(rows, point, "HIGH_OCTANE")[0].fuelHighOctane).toBe("UNKNOWN");
  });
  it("uses the return point for distance, excludes beyond 10km, sorts and limits to ten", () => {
    const rows = Array.from({ length: 12 }, (_, i) => station(i + 1, point.lat + (i + 1) / 1000)).reverse();
    const result = returnCandidates([...rows, station(99, 26.5)], point, "REGULAR");
    expect(result.map(s => s.osmId)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(result[0].distanceKm).toBeCloseTo(0.1112, 4);
    expect(result[0]).not.toHaveProperty("priceJpy");
  });
});

const now = Date.parse("2026-10-01T00:00:00Z");
function fixture() { return JSON.parse(readFileSync("public/data/rental/locations.json", "utf8")); }
describe("limited rental-data provenance gate", () => {
  it("accepts only the three reviewed branches with correct OSM mappings and five localized names", () => {
    const data = parseRentalData(fixture(), now);
    expect(data.count).toBe(3);
    expect(data.records.map(row => row.osmId)).toEqual([4716765290, 13042879292, undefined]);
    expect(data.records.map(row => row.companyId)).toEqual(["times", "times", "times"]);
    expect(data.records[2].lat).toBe(33.580013935265356);
    expect(data.sources[2].allowedUseAssessment).toBe("LIMITED_FACTS_MANUAL");
    expect(data.rule.receipt).toBe("MAY_BE_REQUESTED");
    for (const locale of locales) {
      for (const row of data.records) expect(messages[locale][row.nameKey]).toBeTruthy();
      expect(messages[locale].rcOfficial).toContain("Times CAR RENTAL");
    }
    expect(timesHomeUrl).toBe("https://www.timescar-rental.com/en/");
  });
  const mutations: [string, (data: ReturnType<typeof fixture>) => void][] = [
    ["schema", data => { data.schemaVersion = 2; }],
    ["count", data => { data.count = 4; }],
    ["extra location", data => { data.records.push({ ...data.records[0], id: "extra" }); }],
    ["duplicate", data => { data.records[1] = data.records[0]; }],
    ["unknown company", data => { data.records[0].companyId = "other"; }],
    ["outside Japan", data => { data.records[0].lat = 48.8; }],
    ["wrong local coordinates", data => { data.records[1].lat = 42.8; }],
    ["old Chitose point", data => { data.records[1].osmId = 4926916121; }],
    ["Fukuoka pretends OSM", data => { data.records[2].osmId = 123; }],
    ["wrong prefecture", data => { data.records[0].prefectureCode = "JP-01"; }],
    ["unknown name key", data => { data.records[0].nameKey = "unknown"; }],
    ["new source", data => { data.sources[0].id = "unapproved"; }],
    ["duplicate source", data => { data.sources[1] = data.sources[0]; }],
    ["pending source", data => { data.sources[2].allowedUseAssessment = "PENDING"; }],
    ["whole database claim", data => { data.sources[2].allowedUseAssessment = "AUTHORIZED_DATABASE"; }],
    ["wrong terms", data => { data.sources[2].termsUrl = "https://example.com/"; }],
    ["missing attribution", data => { data.sources[0].attribution = ""; }],
    ["wrong source mapping", data => { data.records[0].positionSourceId = "times-limited-facts"; }],
    ["unknown rule", data => { data.rule.receipt = "REQUIRED"; }],
    ["guessed hours", data => { data.records[0].openingHours = "24/7"; }],
    ["unapproved price", data => { data.records[0].priceJpy = 100; }],
    ["future review", data => { data.reviewDate = "2030-01-01"; }],
    ["invalid date", data => { data.reviewDate = "2026-02-30"; }],
    ["mismatched check date", data => { data.records[0].checkedAt = "2026-09-29"; }],
    ["wrong OSM snapshot", data => { data.osm.inputSha256 = "a".repeat(64); }],
  ];
  it.each(mutations)("rejects %s", (_name, mutate) => {
    const data = fixture(); mutate(data); expect(() => parseRentalData(data, now)).toThrow();
  });
  it("warns at exactly 90 days with an injected clock, never rolls forward the checked date", () => {
    const checked = Date.parse("2026-09-30T00:00:00Z");
    expect(rentalNeedsRecheck("2026-09-30", checked + 90 * 86400000 - 1)).toBe(false);
    expect(rentalNeedsRecheck("2026-09-30", checked + 90 * 86400000)).toBe(true);
    expect(rentalNeedsRecheck("bad", now)).toBe(true);
    expect(rentalNeedsRecheck("2026-10-02", now)).toBe(true);
    expect(parseRentalData(fixture(), checked + 120 * 86400000).reviewDate).toBe("2026-09-30");
  });
  it("validates runtime responses and honors cancellation", async () => {
    const data = fixture(); data.sources[2].allowedUseAssessment = "PENDING";
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(data)));
    vi.stubGlobal("fetch", fetcher);
    try {
      await expect(loadRentalData(undefined, now)).rejects.toThrow();
      fetcher.mockResolvedValue(new Response(JSON.stringify(fixture())));
      const controller = new AbortController(); controller.abort();
      await expect(loadRentalData(controller.signal, now)).rejects.toThrow();
      expect(fetcher.mock.calls[1][1].signal).toBe(controller.signal);
      fetcher.mockResolvedValue(new Response("", { status: 503 }));
      await expect(loadRentalData(undefined, now)).rejects.toThrow("503");
    } finally { vi.unstubAllGlobals(); }
  });
});

it.each(["return_car_start", "return_location_selected", "return_station_selected", "return_navigation_click", "navigate_click"] as const)("%s keeps only allowlisted locale", name => {
  const adapter = vi.fn();
  createAnalytics(adapter).track(name, { locale: "zh-Hans", lat: 26.2110555, lon: 127.6582094, locationId: "times-naha-airport", fuel: "DIESEL" } as { locale: "zh-Hans" });
  expect(adapter).toHaveBeenCalledExactlyOnceWith({ name, properties: { locale: "zh-Hans" } });
});
