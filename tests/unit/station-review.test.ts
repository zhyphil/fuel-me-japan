import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { stationReviews, applyReviewedStationFacts } from "../../src/lib/station-review";
import { haversineKm, validateStation, parseStationFile, type DataManifest } from "../../src/lib/stations";
import { messages, locales } from "../../src/i18n";
import { StationHours } from "../../src/components/StationHours";
import { StationSources } from "../../src/components/StationSources";
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const raw = manifest.stations.partitions.flatMap(partition => {
  const bytes = readFileSync(`public${partition.path}`);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(partition.sha256);
  return parseStationFile(JSON.parse(bytes.toString()), partition, manifest.stations.version).stations;
});
describe("reviewed station supplements", () => {
  it("has nine unique close identities with exact original records and only approved factual fields", () => {
    expect(stationReviews).toHaveLength(9);
    expect(new Set(stationReviews.map(row => row.osm.id)).size).toBe(9);
    for (const review of stationReviews) {
      expect(raw.find(station => station.id === review.osm.id)).toEqual(review.osm);
      expect(haversineKm(review.osm, review.referencePoint)).toBeLessThan(.05);
      expect(review.checkedAt).toBe("2026-10-01");
      expect(["eneos-ss.com", "map.idemitsu.com", "www.kitanihon-oil.co.jp"]).toContain(new URL(review.url).hostname);
      expect(Object.keys(review.facts).every(key => ["name", "address", "openingHours", "serviceType"].includes(key))).toBe(true);
    }
  });
  for (const review of stationReviews) it(`preserves source, identity, fuel and cards: ${review.osm.id}`, () => {
    const original = structuredClone(review.osm);
    const displayed = applyReviewedStationFacts(original);
    expect(original).toEqual(review.osm);
    expect(displayed.reviewedFacts?.osm).toEqual(original);
    for (const key of ["id", "lat", "lon", "source", "sourceUpdatedAt", "originalBrand", "normalizedBrand", "fuelRegular", "fuelHighOctane", "fuelDiesel", "paymentVisa", "paymentMastercard"] as const) expect(displayed[key]).toEqual(original[key]);
    // Only the runtime overlay can carry this metadata; downloaded records cannot.
    expect(validateStation(displayed)).toContain("Unapproved station field (including price or gogoUrl)");
  });
  it("stops applying a supplement after an upstream timestamp, position, field or identity change", () => {
    const old = stationReviews[0].osm;
    for (const patch of [{sourceUpdatedAt: "2026-09-30T00:00:00Z"}, {lat: old.lat + .0001}, {address: "Updated upstream"}, {id: "osm:node:2", osmId: 2}]) {
      const changed = {...old, ...patch};
      expect(applyReviewedStationFacts(changed)).toBe(changed);
      expect(changed.reviewedFacts).toBeUndefined();
    }
    expect(applyReviewedStationFacts({...old, name: undefined}).reviewedFacts).toBeUndefined();
  });
  it("keeps both Sunday closure corrections and original contrary OSM hours", () => {
    const ash = applyReviewedStationFacts(stationReviews.find(row => row.osm.id === "osm:node:5699750321")!.osm);
    expect(ash.openingHours).toContain("Su off");
    expect(ash.reviewedFacts!.osm.openingHours).toContain("Su 08:00-19:00");
    const air = applyReviewedStationFacts(stationReviews.find(row => row.osm.id === "osm:node:5694016271")!.osm);
    expect(air.openingHours).toContain("Su[2,4] off");
    expect(air.reviewedFacts!.osm.openingHours).toBe("08:00-19:00");
    for (const locale of locales) {
      const html = renderToStaticMarkup(createElement(StationHours, {value: air.openingHours, locale, review: air.reviewedFacts}));
      expect(html).toContain(messages[locale][air.reviewedFacts!.hoursKey!]);
      expect(html).toContain("Su[2,4] off");
      const source = renderToStaticMarkup(createElement(StationSources, {station: air, locale}));
      expect(source).toContain(air.reviewedFacts!.url.replaceAll("&", "&amp;"));
      expect(source).toContain("08:00-19:00");
      expect(source).toContain(air.sourceUpdatedAt);
    }
  });
});
