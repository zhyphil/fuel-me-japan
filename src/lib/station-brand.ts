import type { Station } from "./stations";

interface BrandIdentity {
  key: string;
  label: string;
  aliases: readonly string[];
  logo?: string;
}

// Exact, reviewed aliases only. Asset provenance is in public/brands/sources.json.
// Corporate mergers, dealer names, substrings and spelling guesses are not aliases.
export const brandIdentities: readonly BrandIdentity[] = [
  { key: "eneos", label: "ENEOS", aliases: ["ENEOS", "エネオス", "えねおす", "ENEOS EneJet", "エネオス エネジェット", "エネオスエネジェット", "EneJet"], logo: "/brands/eneos-symbol.svg" },
  { key: "cosmo", label: "Cosmo", aliases: ["Cosmo", "Cosmo Oil", "コスモ", "コスモ石油", "コスモ石油 (Cosmo)"], logo: "/brands/cosmo-symbol.svg" },
  { key: "idemitsu", label: "Idemitsu", aliases: ["Idemitsu", "出光", "出光興産", "出光石油", "出光 (Idemitsu)", "出光 (Idemitsu )"], logo: "/brands/idemitsu.svg" },
  { key: "hokuren", label: "ホクレン", aliases: ["ホクレン", "Hokuren"], logo: "/brands/hokuren.svg" },
  { key: "ja", label: "JA", aliases: ["JA", "JA-SS", "JA SS", "JASS"], logo: "/brands/ja.svg" },
  { key: "mobil", label: "Mobil", aliases: ["Mobil", "モービル", "モービル石油"], logo: "/brands/mobil.svg" },
  { key: "esso", label: "Esso", aliases: ["Esso", "エッソ", "Esso Express"], logo: "/brands/esso.svg" },
  { key: "iwatani", label: "Iwatani", aliases: ["Iwatani", "イワタニ", "イワタニ水素ステーション"], logo: "/brands/iwatani.png" },
  { key: "inpex", label: "INPEX", aliases: ["INPEX"], logo: "/brands/inpex.svg" },
  { key: "seven-eleven", label: "7-Eleven", aliases: ["7-Eleven"], logo: "/brands/seven-eleven.svg" },
  { key: "costco", label: "Costco", aliases: ["Costco Gasoline", "コストコ ガスステーション", "コストコホールセール"], logo: "/brands/costco.svg" },
  { key: "lawson", label: "LAWSON", aliases: ["LAWSON", "ローソン"], logo: "/brands/lawson.svg" },
  { key: "tokyo-gas", label: "Tokyo Gas", aliases: ["東京ガス", "Tokyo Gas"], logo: "/brands/tokyo-gas.svg" },
  { key: "kirkland", label: "Kirkland Signature", aliases: ["Kirkland Signature"], logo: "/brands/kirkland.svg" },
  // Identity is confirmed, but a reusable pictorial asset has not been established.
  { key: "shell", label: "Shell", aliases: ["Shell", "シェル", "昭和シェル", "昭和シェル石油", "Showa Shell"] },
  { key: "apollostation", label: "apollostation", aliases: ["apollostation", "アポロステーション", "Apollo Station"] },
];

export const normalizeBrandAlias = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
const aliases = new Map(brandIdentities.flatMap(brand => brand.aliases.map(alias => [normalizeBrandAlias(alias), brand] as const)));

export function recordedBrand(value: string): BrandIdentity | undefined {
  return aliases.get(normalizeBrandAlias(value));
}

export function stationBrand(station: Pick<Station, "originalBrand">): { text: string; logo?: string } {
  const text = station.originalBrand?.trim() || "";
  const logo = recordedBrand(text)?.logo;
  return { text, ...(logo ? { logo } : {}) };
}
