import type { Station } from "./stations";
export function stationBrand(station: Pick<Station, "originalBrand">): { text: string; logo?: string } {
  const text = station.originalBrand?.trim() || "";
  const alias = text.toLocaleLowerCase("en");
  if (["eneos", "エネオス"].includes(alias)) return { text, logo: "/brands/eneos-symbol.svg" };
  if (["cosmo", "コスモ", "コスモ石油"].includes(alias)) return { text, logo: "/brands/cosmo-symbol.svg" };
  return { text };
}
