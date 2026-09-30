import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import sources from "../../public/brands/sources.json";
import { brandIdentities, normalizeBrandAlias, stationBrand } from "../../src/lib/station-brand";
import { filterBrand } from "../../src/lib/station-filters";

it.each([
  [" ＥＮＥＯＳ ", "eneos-symbol.svg"], ["ENEOS EneJet", "eneos-symbol.svg"],
  ["コスモ石油 (Cosmo)", "cosmo-symbol.svg"], ["Cosmo Oil", "cosmo-symbol.svg"],
  ["ホクレン", "hokuren.svg"], ["IDEMITSU", "idemitsu.svg"], ["出光", "idemitsu.svg"],
  ["JA-SS", "ja.svg"], ["JA SS", "ja.svg"], ["モービル", "mobil.svg"],
  ["Esso Express", "esso.svg"], ["コストコ　ガスステーション", "costco.svg"],
  ["KIRKLAND Signature", "kirkland.svg"], ["東京ガス", "tokyo-gas.svg"],
  ["イワタニ", "iwatani.png"], ["INPEX", "inpex.svg"], ["LAWSON", "lawson.svg"], ["7-Eleven", "seven-eleven.svg"],
])("uses the reviewed logo for recorded alias %s in every view", (originalBrand, asset) => {
  expect(stationBrand({ originalBrand }).logo).toBe(`/brands/${asset}`);
  expect(filterBrand({ originalBrand }).logo).toBe(`/brands/${asset}`);
  expect(stationBrand({ originalBrand }).text).toBe(originalBrand.trim());
});
it.each(["Shell", "シェル", "昭和シェル", "apollostation", "キグナス", "SOLATO", "Carenex", "丸紅エネルギー", "Mobile", "Cosmos", "MOL", "Other brand", "エネフリ;apollostation", "ENEOS dealer", "brand= 出光興産"])("keeps %s on the fallback without guessing identity or permission", (originalBrand) => {
  expect(stationBrand({ originalBrand })).toEqual({ text: originalBrand });
  expect(filterBrand({ originalBrand, normalizedBrand: "ENEOS" }).logo).toBeUndefined();
});
it("does not infer missing brands or upgrade legacy records from normalized metadata", () => {
  expect(stationBrand({})).toEqual({ text: "" });
  expect(filterBrand({ normalizedBrand: "ENEOS" }).logo).toBeUndefined();
  expect(filterBrand({ originalBrand: "Esso", normalizedBrand: "ENEOS" }).logo).toBe("/brands/esso.svg");
  expect(filterBrand({ originalBrand: "出光", normalizedBrand: "apollostation" }).logo).toBe("/brands/idemitsu.svg");
  expect(filterBrand({ originalBrand: "昭和シェル", normalizedBrand: "apollostation" }).key).toBe("brand:shell");
});
it("has no ambiguous alias and gives every shipped logo a verifiable local source", () => {
  const aliases = brandIdentities.flatMap(brand => brand.aliases.map(normalizeBrandAlias));
  expect(new Set(aliases).size).toBe(aliases.length);
  const assets = sources.assets.flatMap(asset => [asset.assetPath, "symbolAssetPath" in asset ? asset.symbolAssetPath : undefined]);
  for (const brand of brandIdentities) if (brand.logo) expect(assets).toContain(brand.logo);
  for (const asset of sources.assets) {
    expect(asset.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
    expect(asset.licenseAsDeclared).toBe("PD-textlogo");
    const bytes = readFileSync(`public${asset.assetPath}`);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
    if (asset.assetPath.endsWith(".svg")) {
      const svg = bytes.toString();
      expect(svg).toMatch(/<svg\b/);
      expect(svg).not.toMatch(/<(?:script|foreignObject|image|animate|set)\b|\son[a-z]+=|(?:xlink:)?href=["'](?!#)/i);
    }
  }
});
