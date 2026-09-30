import { describe, expect, it } from "vitest";
import registry from "../../public/data/source-registry.json";
import manifest from "../../public/data/manifest.json";
import { validateRegistry } from "../../src/lib/source-registry";
function changedEntry(index: number, patch: Record<string, unknown>) {
  return { ...registry, sources: registry.sources.map((s, i) => i === index ? { ...s, ...patch } : s) };
}
describe("M0.1 source approval and ingestion proof gate", () => {
  it("accepts reviewed OSM/Geofabrik/METI and leaves gogo/rental pending", () => {
    expect(validateRegistry(registry, manifest)).toEqual([]);
    expect(registry.sources.filter((s) => s.productionEnabled).map((s) => s.id)).toEqual(["osm", "geofabrik", "meti-prices"]);
    expect(registry.sources.filter((s) => !s.productionEnabled).every((s) => s.status === "PENDING_REVIEW" && s.fetchedAt === null)).toBe(true);
  });
  it("accepts a candidate registry without ingestion", () => {
    expect(validateRegistry({ schemaVersion: 1, milestone: "M0.1", sources: registry.sources.filter((s) => !s.productionEnabled) })).toEqual([]);
  });
  it("rejects enabled sources without actual manifests or review", () => {
    expect(validateRegistry(registry)).toContain("Approved source requires matching manifest: osm.");
    expect(validateRegistry(changedEntry(0, { reviewDate: null }), manifest)).toContain("Missing/invalid reviewDate: osm.");
    expect(validateRegistry(changedEntry(3, { productionEnabled: true, status: "APPROVED" }), manifest)).toContain("Unapproved production source: gogo.");
  });
  it("rejects missing provenance, unsafe URLs and duplicate identifiers", () => {
    expect(validateRegistry({ sources: [] })).not.toEqual([]);
    expect(validateRegistry(changedEntry(0, { owner: "" }), manifest)).toContain("Missing owner.");
    expect(validateRegistry(changedEntry(0, { sourceUrl: "javascript:alert(1)" }), manifest)).toContain("Invalid sourceUrl.");
    expect(validateRegistry({ ...registry, sources: [...registry.sources, registry.sources[0]] }, manifest)).toContain("Duplicate source: osm.");
  });
  it("rejects hash, timestamp, transformation, URL and approval mismatches", () => {
    for (const patch of [{ inputSha256: "0".repeat(64) }, { sourceUpdatedAt: "2026-09-28T00:00:00Z" }, { transformationVersion: "invented" }, { ingestedSourceUrl: "https://example.com/file.pbf" }, { productionEnabled: false, status: "PENDING_REVIEW" }]) {
      expect(validateRegistry(changedEntry(0, patch), manifest).length).toBeGreaterThan(0);
    }
    expect(validateRegistry(changedEntry(3, { fetchedAt: "2026-09-30T00:00:00Z" }), manifest)).toContain("Pending source has unverified fetchedAt: gogo.");
  });
});
