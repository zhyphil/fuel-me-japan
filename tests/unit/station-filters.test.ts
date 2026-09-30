import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { activeFilterCount, applyStationFilters, copyStationFilters, emptyStationFilters, filterBrand, sameStationFilters, stationFilterOptions, UNKNOWN_BRAND } from "../../src/lib/station-filters";
import type { DataManifest, Station, StationFile } from "../../src/lib/stations";
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const real: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const make = (id: number, fields: Partial<Station> = {}) => ({ ...real.stations[0], id: `osm:node:${id}`, osmId: id, originalBrand: undefined, normalizedBrand: undefined, name: "Central", address: "North", paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", serviceType: "UNKNOWN", ...fields }) as Station;
const rows = [
  make(1, { originalBrand: "ENEOS", paymentVisa: "YES", serviceType: "SELF" }),
  make(2, { originalBrand: "エネオス", paymentVisa: "YES", paymentMastercard: "YES", serviceType: "FULL", address: "South" }),
  make(3, { originalBrand: "Cosmo", paymentMastercard: "YES", serviceType: "SELF" }),
  make(4, { originalBrand: "Shell", paymentVisa: "NO", serviceType: "FULL" }),
  make(5, { name: "ENEOS" }),
];
const ids = (stations: Station[]) => stations.map((station) => station.id);

describe("station filters", () => {
  it("leaves records, ordering and distance untouched when unrestricted", () => {
    const stations = rows.map((station, index) => ({ ...station, distanceKm: index }));
    expect(applyStationFilters(stations, "", emptyStationFilters())).toBe(stations);
    expect(applyStationFilters(stations, "North", emptyStationFilters()).map((station) => station.distanceKm)).toEqual([0, 2, 3, 4]);
  });
  it("ORs each category, ANDs categories, and intersects the text query", () => {
    const filters = { brands: ["brand:eneos", "brand:cosmo"], payments: ["visa", "mastercard"] as const, services: ["SELF", "FULL"] as const };
    const state = { ...filters, payments: [...filters.payments], services: [...filters.services] };
    expect(ids(applyStationFilters(rows, "", state))).toEqual(["osm:node:1", "osm:node:2", "osm:node:3"]);
    expect(ids(applyStationFilters(rows, "ＳＯＵＴＨ", state))).toEqual(["osm:node:2"]);
    state.services = ["SELF"];
    expect(ids(applyStationFilters(rows, "South", state))).toEqual([]);
  });
  it("requires explicit YES and service values, never treats UNKNOWN as acceptance", () => {
    expect(ids(applyStationFilters(rows, "", { ...emptyStationFilters(), payments: ["visa"] }))).toEqual(["osm:node:1", "osm:node:2"]);
    expect(ids(applyStationFilters(rows, "", { ...emptyStationFilters(), services: ["FULL"] }))).toEqual(["osm:node:2", "osm:node:4"]);
    expect(ids(applyStationFilters(rows, "", { ...emptyStationFilters(), brands: [UNKNOWN_BRAND] }))).toEqual(["osm:node:5"]);
  });
  it("counts loaded records and does not double count the payment union", () => {
    const options = stationFilterOptions(rows);
    expect(options.payments).toEqual({ visa: 2, mastercard: 2 });
    expect(options.services).toEqual({ SELF: 2, FULL: 2 });
    expect(options.brands.find((brand) => brand.key === "brand:eneos")?.count).toBe(2);
    expect(options.brands.reduce((sum, brand) => sum + brand.count, 0)).toBe(rows.length);
    expect(applyStationFilters(rows, "", { ...emptyStationFilters(), payments: ["visa", "mastercard"] })).toHaveLength(3);
  });
  it.each([" ENEOS ", "ｅｎｅｏｓ", "エネオス"])("merges the confirmed ENEOS alias %s", (originalBrand) => {
    expect(filterBrand({ originalBrand }).key).toBe("brand:eneos");
  });
  it.each(["Cosmo", "Cosmo Oil", "ＣＯＳＭＯ", "コスモ", "コスモ石油"])("merges the confirmed Cosmo alias %s", (originalBrand) => {
    expect(filterBrand({ originalBrand }).key).toBe("brand:cosmo");
  });
  it("uses same-brand normalized metadata only with a recorded original brand", () => {
    expect(filterBrand({ originalBrand: "出光", normalizedBrand: "Idemitsu" }).key).toBe("brand:idemitsu");
    expect(filterBrand({ normalizedBrand: "ENEOS" }).key).toBe(UNKNOWN_BRAND);
    expect(filterBrand({ originalBrand: "  ", normalizedBrand: "ENEOS" }).key).toBe(UNKNOWN_BRAND);
    expect(filterBrand({ originalBrand: "Shell", normalizedBrand: "apollostation" }).key).toBe("brand:shell");
    expect(filterBrand({ originalBrand: "出光", normalizedBrand: "apollostation" }).key).toBe("brand:idemitsu");
    expect(new Set(["Shell", "出光", "apollostation"].map((originalBrand) => filterBrand({ originalBrand }).key)).size).toBe(3);
  });
  it("keeps a stable count/text order and an explicit unknown option, independent of input order", () => {
    expect(stationFilterOptions(rows).brands).toEqual(stationFilterOptions([...rows].reverse()).brands);
    expect(stationFilterOptions(rows.slice(0, 4)).brands.find((brand) => brand.key === UNKNOWN_BRAND)?.count).toBe(0);
  });
  it("isolates drafts and reset, and compares selection sets without order sensitivity", () => {
    const applied = { brands: ["brand:eneos", "brand:cosmo"], payments: ["visa" as const], services: [] };
    const draft = copyStationFilters(applied);
    draft.brands.pop();
    expect(applied.brands).toHaveLength(2);
    expect(activeFilterCount(applied)).toBe(3);
    expect(sameStationFilters(applied, { ...applied, brands: [...applied.brands].reverse() })).toBe(true);
    expect(sameStationFilters(applied, draft)).toBe(false);
    expect(activeFilterCount(emptyStationFilters())).toBe(0);
    expect(applied.payments).toEqual(["visa"]);
  });
});
