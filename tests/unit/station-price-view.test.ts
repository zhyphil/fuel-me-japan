import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DataManifest, StationFile } from "../../src/lib/stations";
import { STATION_QUOTES, stationPriceViews, allFuelPriceViews, type StationQuote } from "../../src/lib/station-price-view";
import { FuelPrice, FuelPrices, markerFuelPrices, priceDisplayText } from "../../src/components/FuelPrice";
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const file: StationFile = JSON.parse(readFileSync(`public${manifest.stations.partitions.find((p) => p.code === "JP-01")!.path}`, "utf8"));
// Synthetic prices exist only in this pure display test.
const stations = file.stations.slice(0, 6).map((s) => ({ ...s, fuelRegular: "UNKNOWN" as const }));
const now = Date.parse("2026-09-30T10:00:00Z");
const quotes: StationQuote[] = [180, 160, 170, 160, 190, 200].map((price, i) => ({ stationId: stations[i].id, fuelType: "REGULAR", priceJpyPerL: price, unit: "JPY/L", basis: "CASH_TAX_INCLUDED_GENERAL", sourceId: "synthetic", sourceUrl: "https://example.com/quote", observedAt: "2026-09-30T01:00:00Z", fetchedAt: "2026-09-30T02:00:00Z", validUntil: "2026-10-01T00:00:00Z" }));
const views = (q = quotes, s = stations) => [...stationPriceViews(s, q, "REGULAR", now).values()];
describe("independent station quote presentation", () => {
  it("production is empty and never borrows regional prices", () => { expect(STATION_QUOTES).toEqual([]); expect(views(STATION_QUOTES as StationQuote[]).every((v) => v.status === "unknown" && !v.quote)).toBe(true); });
  it("ranks distinct price levels, preserves ties, and is independent of input ordering", () => {
    expect(views().map((v) => v.tone)).toEqual(["medium", "low", "low", "low", "medium", "high"]);
    expect(views([...quotes].reverse())).toEqual(views());
    expect(views(quotes.slice(0, 3)).slice(0, 3).map((v) => v.tone)).toEqual(["high", "low", "medium"]);
    expect(views(quotes.map((q) => ({ ...q, priceJpyPerL: 160 }))).every((v) => v.status === "valid" && v.tone === "unknown")).toBe(true);
  });
  it("does not mix fuel, source, prefecture or observation day", () => {
    expect([...stationPriceViews(stations, quotes, "DIESEL", now).values()].every((v) => v.status === "unknown")).toBe(true);
    expect(views(quotes.map((q, i) => ({ ...q, sourceId: `source-${i}` }))).every((v) => v.tone === "unknown")).toBe(true);
    expect(views(quotes.slice(0, 3).map((q, i) => ({ ...q, observedAt: `2026-09-${28 + i}T01:00:00Z` }))).every((v) => v.tone === "unknown")).toBe(true);
    expect(views(quotes, stations.map((s, i) => ({ ...s, prefectureCode: `JP-0${i + 1}` })) ).every((v) => v.tone === "unknown")).toBe(true);
    expect(views(quotes.slice(0, 2)).every((v) => v.tone === "unknown")).toBe(true);
  });
  it.each([
    { validUntil: "2026-09-30T10:00:00Z" }, { validUntil: undefined }, { observedAt: "2026-02-30T00:00:00Z" },
    { observedAt: "2026-10-01T00:00:00Z" }, { fetchedAt: "2026-10-01T00:00:00Z" }, { fetchedAt: "2026-09-29T00:00:00Z" },
    { sourceUrl: "http://example.com" }, { sourceId: "" }, { priceJpyPerL: Infinity }, { priceJpyPerL: NaN },
    { priceJpyPerL: 0 }, { priceJpyPerL: 1001 }, { unit: "USD/L" }, { basis: "MEMBER_ONLY" },
  ])("rejects invalid, missing, stale, future or incompatible quote %j", (patch) => {
    const result = views([{ ...quotes[0], ...patch } as StationQuote])[0];
    expect(result).toMatchObject({ status: "unknown", tone: "unknown" }); expect(result.quote).toBeUndefined();
  });
  it("does not arbitrarily choose duplicate records and honors explicit fuel NO", () => {
    expect(views([...quotes, { ...quotes[0], priceJpyPerL: 120 }])[0].status).toBe("unknown");
    expect(views(quotes, stations.map((s) => ({ ...s, fuelRegular: "NO" as never }))).every((v) => v.status === "unavailable" && !v.quote)).toBe(true);
  });
  it("renders no price label or empty element without a quote, while preserving valid prices", () => {
    for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const) {
      for (const status of ["unknown", "unavailable", "valid"] as const) {
        const view = { status, tone: "unknown" as const, comparableCount: 0 };
        expect(priceDisplayText(view, locale)).toBe("");
        expect(renderToStaticMarkup(createElement(FuelPrice, { view, fuel: "REGULAR", locale }))).toBe("");
      }
      const view = views(quotes.slice(0, 3))[1];
      const html = renderToStaticMarkup(createElement(FuelPrice, { view, fuel: "REGULAR", locale }));
      expect(html).toContain("160");
      expect(html).toContain("price-low");
    }
  });
  it("provides text in addition to color and keeps valid unranked prices visible", () => {
    expect(priceDisplayText(views(quotes.slice(0, 3))[0], "en")).toContain("Higher");
    expect(priceDisplayText(views(quotes.slice(0, 1))[0], "en")).toContain("180");
    expect(priceDisplayText(views(quotes.slice(0, 1))[0], "en")).toContain("Not comparable");
  });
});


it("renders multiple named fuels with independent colors and hides only the missing fuel", () => {
  const rows = stations.slice(0, 3).map((s) => ({ ...s, fuelDiesel: "UNKNOWN" as const, fuelHighOctane: "UNKNOWN" as const }));
  const multi = [...quotes.slice(0, 3), ...quotes.slice(0, 3).map((q, i) => ({ ...q, fuelType: "DIESEL" as const, priceJpyPerL: [130, 150, 140][i] }))];
  const views = allFuelPriceViews(rows, multi, now);
  const fuels = ["REGULAR", "DIESEL", "HIGH_OCTANE"] as const;
  expect(views.REGULAR.get(rows[0].id)?.tone).toBe("high");
  expect(views.DIESEL.get(rows[0].id)?.tone).toBe("low");
  for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const) {
    const html = renderToStaticMarkup(createElement(FuelPrices, { views, fuels, stationId: rows[0].id, locale }));
    expect(html).toContain("レギュラー"); expect(html).toContain("軽油"); expect(html).not.toContain("ハイオク");
    expect(html).toContain("180"); expect(html).toContain("130");
    const bands = markerFuelPrices(views, fuels, rows[0].id, locale);
    expect(bands.map(({ fuel, tone }) => ({ fuel, tone }))).toEqual([{ fuel: "REGULAR", tone: "high" }, { fuel: "DIESEL", tone: "low" }]);
    expect(bands[0].label).toContain("レギュラー"); expect(bands[1].label).toContain("軽油");
    expect(markerFuelPrices(views, ["HIGH_OCTANE"], rows[0].id, locale)).toEqual([]);
  }
  const full = allFuelPriceViews(rows, [...multi, ...quotes.slice(0, 3).map((q) => ({ ...q, fuelType: "HIGH_OCTANE" as const, priceJpyPerL: q.priceJpyPerL + 20 }))], now);
  expect(markerFuelPrices(full, fuels, rows[0].id, "en")).toHaveLength(3);
  expect(markerFuelPrices(full, ["DIESEL"], rows[0].id, "en")).toHaveLength(1);
});


it("revalidates every selected fuel when time passes a quote expiry", () => {
  const rows = stations.slice(0, 3);
  const before = allFuelPriceViews(rows, quotes, now);
  const after = allFuelPriceViews(rows, quotes, Date.parse("2026-10-01T00:00:00Z"));
  expect(markerFuelPrices(before, ["REGULAR", "DIESEL"], rows[0].id, "en")).toHaveLength(1);
  expect(markerFuelPrices(after, ["REGULAR", "DIESEL"], rows[0].id, "en")).toHaveLength(0);
});
