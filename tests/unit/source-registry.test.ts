import { describe, expect, it } from "vitest";
import registry from "../../public/data/source-registry.json";
import { validateRegistry } from "../../src/lib/source-registry";
describe("M0.0 source provenance gate", () => {
  it("accepts explicit pending sources without invented dates", () => {
    expect(validateRegistry(registry)).toEqual([]);
  });
  it("rejects empty registries", () => {
    expect(validateRegistry({ sources: [] })).not.toEqual([]);
  });
  it("rejects an unapproved production source", () => {
    const changed = structuredClone(registry);
    changed.sources[0].productionEnabled = true;
    expect(validateRegistry(changed)).toContain("M0.0 cannot activate osm.");
  });
  it("rejects missing provenance and duplicate source identifiers", () => {
    const changed = structuredClone(registry);
    changed.sources[0].owner = "";
    changed.sources.push(changed.sources[0]);
    expect(validateRegistry(changed)).toContain("Missing owner.");
    expect(validateRegistry(changed)).toContain("Duplicate source: osm.");
  });
  it("rejects unsafe source URLs", () => {
    const changed = structuredClone(registry);
    changed.sources[0].sourceUrl = "javascript:alert(1)";
    expect(validateRegistry(changed)).toContain("Invalid sourceUrl.");
  });
  it("rejects fabricated fetch provenance", () => {
    const changed = {
      sources: [{ ...registry.sources[0], fetchedAt: "2026-09-30T00:00:00Z" }],
    };
    expect(validateRegistry(changed)).toContain(
      "M0.0 has no verified fetchedAt for osm.",
    );
  });
});
