import { expect, it } from "vitest";
import { stationBrand } from "../../src/lib/station-brand";
it.each(["ENEOS", "エネオス", "eneos"])("maps only recorded ENEOS alias %s", (originalBrand) => { expect(stationBrand({ originalBrand }).logo).toBe("/brands/eneos-symbol.svg"); });
it.each(["Cosmo", "COSMO", "コスモ", "コスモ石油"])("maps only recorded Cosmo alias %s", (originalBrand) => { expect(stationBrand({ originalBrand }).logo).toBe("/brands/cosmo-symbol.svg"); });
it.each(["Shell", "Idemitsu", "出光", "apollostation", "Other brand"])("keeps recorded brand %s without upgrading", (originalBrand) => { expect(stationBrand({ originalBrand })).toEqual({ text: originalBrand }); });
it("does not infer missing brands from a name or normalizedBrand", () => { expect(stationBrand({})).toEqual({ text: "" }); });
