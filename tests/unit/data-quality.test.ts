import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { airportReviewQueue, readCheckedArtifact, stationCoverage, targetRegions } from "../../scripts/data-quality";
import type { Station } from "../../src/lib/stations";
import type { RentalLocation } from "../../src/lib/rental";

const station: Station = {
  id: "osm:node:1", osmId: 1, osmType: "node", lat: 26.2, lon: 127.66, prefectureCode: "JP-47",
  serviceType: "UNKNOWN", fuelRegular: "UNKNOWN", fuelHighOctane: "UNKNOWN", fuelDiesel: "UNKNOWN",
  paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", source: "osm", positionMethod: "OSM_NODE",
  sourceUpdatedAt: "2022-01-01T00:00:00Z",
};
const rental: RentalLocation = {
  id: "times-naha-airport", lat: station.lat, lon: station.lon, prefectureCode: "JP-47",
  aliases: [], companyId: "times", companyName: "Times", names: {primary: "那霸", languages: {}},
  address: null, positionKind: "SHOP_REFERENCE", candidateStatus: "OFFICIAL_RETURN_FACILITY",
  verification: "OFFICIAL_FACILITY_CHECKED", vehicleEntranceStatus: "NOT_VERIFIED", airportCode: "OKA",
  sourceIds: ["times-official"], phones: [], websites: [], sources: [], returnRule: null,
  official: {sourceId: "times-official", checkedAt: "2026-09-30", url: "https://www.timescar-rental.com/en/okinawa/shop/4701/", supplementaryUrls: [], summaryKey: "rental.airport.OKA"},
};

describe("offline data quality observations", () => {
  it("preserves UNKNOWN separately from recorded YES and NO", () => {
    const report = stationCoverage([station, {...station, id: "osm:node:2", fuelRegular: "YES", paymentVisa: "NO", serviceType: "SELF", name: "ENEOS"}]);
    expect(report.triState.fuelRegular).toEqual({YES: 1, NO: 0, UNKNOWN: 1});
    expect(report.triState.paymentVisa).toEqual({YES: 0, NO: 1, UNKNOWN: 1});
    expect(report.text.name).toEqual({recorded: 1, missing: 1});
    expect(report.serviceType).toEqual({SELF: 1, FULL: 0, UNKNOWN: 1});
  });
  it("handles empty scopes without percentages or false coverage", () => {
    expect(stationCoverage([]).count).toBe(0);
    expect(stationCoverage([]).triState.fuelRegular).toEqual({YES: 0, NO: 0, UNKNOWN: 0});
  });
  it("keeps Okinawa separate from the seven prefectures of Kyushu", () => {
    const kyushu = targetRegions.find(row => row.id === "kyushu")!;
    expect(kyushu.codes).toHaveLength(7);
    expect([...kyushu.codes]).not.toContain("JP-47");
  });
  it("keeps unknown regular candidates, excludes explicit NO and distant stations, and includes border candidates", () => {
    const result = airportReviewQueue([station,
      {...station, id: "osm:node:2", lat: 26.21, prefectureCode: "JP-46"},
      {...station, id: "osm:node:3", fuelRegular: "NO"},
      {...station, id: "osm:node:4", lat: 28},
    ], [rental])[0];
    expect(result.eligibleCandidatesWithin10Km.REGULAR).toBe(2);
    expect(result.eligibleCandidatesWithin10Km.DIESEL).toBe(3);
    expect(result.nearestRegularCandidates.map(row => row.stationId)).toEqual(["osm:node:1", "osm:node:2"]);
    expect(result.nearestRegularCandidates[0].fieldsToCheck).toContain("fuelRegular");
    expect(result.nearestRegularCandidates[0].objectLastModifiedAt).toBe("2022-01-01T00:00:00Z");
    expect(result.vehicleEntranceStatus).toBe("NOT_VERIFIED");
  });
  it("does not promote unreviewed rentals or other airports into the priority queue", () => {
    expect(airportReviewQueue([station], [{...rental, official: null, verification: "NOT_VERIFIED"}, {...rental, airportCode: "NRT"}])).toEqual([]);
  });
  it("rejects modified artifact bytes and paths outside public data", async () => {
    const root = await mkdtemp(join(tmpdir(), "fmj-quality-"));
    try {
      await mkdir(join(root, "data"));
      const bytes = Buffer.from('{"checked":true}\n');
      await writeFile(join(root, "data/test.json"), bytes);
      const artifact = {path: "/data/test.json", bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex")};
      expect(await readCheckedArtifact(root, artifact)).toEqual(bytes);
      await expect(readCheckedArtifact(root, {...artifact, path: "/data/../../outside.json"})).rejects.toThrow("路径");
      await writeFile(join(root, "data/test.json"), '{"checked":null}\n');
      await expect(readCheckedArtifact(root, artifact)).rejects.toThrow("校验和");
    } finally { await rm(root, {recursive: true, force: true}); }
  });
});
