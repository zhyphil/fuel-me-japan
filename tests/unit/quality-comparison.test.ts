import { describe, expect, it } from "vitest";
import { buildQualityReport, compareQualityReports } from "../../scripts/data-quality";
const baseline = await buildQualityReport("public", "2026-10-01");
describe("candidate quality comparisons", () => {
  it("keeps raw coverage distinct from displayed official supplements without claiming source freshness", () => {
    expect(baseline.stationSupplements).toMatchObject({reviewed: 9, applied: 9, inactiveIds: []});
    expect(baseline.national.stations.count).toBe(16454);
    expect(baseline.national.displayedStations.count).toBe(16454);
    expect(baseline.national.displayedStations.text.address.recorded).toBeGreaterThan(baseline.national.stations.text.address.recorded);
    expect(baseline.national.displayedStations.triState).toEqual(baseline.national.stations.triState);
    expect(compareQualityReports(baseline, baseline)).toMatchObject({decision: "UNCHANGED", changedManifests: [], changes: [], alerts: []});
  });
  it("requires manual review of count, reference date or artifact differences", () => {
    const after = structuredClone(baseline);
    after.national.stations.count += 1;
    after.inputs.stationManifestSha256 = "f".repeat(64);
    const diff = compareQualityReports(baseline, after);
    expect(diff.decision).toBe("REVIEW_REQUIRED");
    expect(diff.changedManifests).toEqual(["stations"]);
    expect(diff.changes).toContainEqual({field: "national.stations.count", before: 16454, after: 16455, delta: 1});
    after.inputs.stationManifestSha256 = baseline.inputs.stationManifestSha256;
    after.national.stations.count -= 1;
    after.prices.publishedAt = "2026-10-01";
    expect(compareQualityReports(baseline, after).decision).toBe("REVIEW_REQUIRED");
  });
  it("reports displayed coverage improvements against an older raw-only schema-1 baseline", () => {
    const before = structuredClone(baseline);
    Reflect.deleteProperty(before.national, "displayedStations");
    for (const region of before.regions) Reflect.deleteProperty(region, "displayedStations");
    Reflect.deleteProperty(before, "stationSupplements");
    const diff = compareQualityReports(before, baseline);
    expect(diff.decision).toBe("REVIEW_REQUIRED");
    expect(diff.changes.some(change => change.field === "national.displayedStations.text.address.recorded" && change.delta > 0)).toBe(true);
  });
  it("flags date regressions and inactive identity supplements rather than relaxing matching", () => {
    const after = structuredClone(baseline);
    after.inputs.stationSnapshotAt = "2020-01-01T00:00:00Z";
    after.prices.surveyDate = "2020-01-01";
    after.stationSupplements.inactiveIds = ["osm:node:5699750321"];
    const diff = compareQualityReports(baseline, after);
    expect(diff.alerts).toHaveLength(3);
    expect(diff.decision).toBe("REVIEW_REQUIRED");
  });
});
