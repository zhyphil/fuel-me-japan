import { filterStations } from "./find-fuel";
import type { Station } from "./stations";

export type PaymentFilter = "visa" | "mastercard";
export type ServiceFilter = "SELF" | "FULL";
export interface StationFilterState {
  brands: string[];
  payments: PaymentFilter[];
  services: ServiceFilter[];
}
export const UNKNOWN_BRAND = "unknown:";
export const emptyStationFilters = (): StationFilterState => ({ brands: [], payments: [], services: [] });
export const copyStationFilters = (value: StationFilterState): StationFilterState => ({ brands: [...value.brands], payments: [...value.payments], services: [...value.services] });
export const activeFilterCount = (value: StationFilterState) => value.brands.length + value.payments.length + value.services.length;
export function sameStationFilters(a: StationFilterState, b: StationFilterState): boolean {
  return (["brands", "payments", "services"] as const).every((key) => a[key].length === b[key].length && a[key].every((value) => (b[key] as string[]).includes(value)));
}
const normalize = (value: string) => value.normalize("NFKC").trim().toLocaleLowerCase("en");
function sameBrandAlias(value: string): string {
  const key = normalize(value);
  if (["eneos", "エネオス"].includes(key)) return "eneos";
  if (["cosmo", "cosmo oil", "コスモ", "コスモ石油"].includes(key)) return "cosmo";
  if (["出光", "idemitsu"].includes(key)) return "idemitsu";
  if (["shell", "昭和シェル石油"].includes(key)) return "shell";
  if (["apollostation", "アポロステーション"].includes(key)) return "apollostation";
  return key;
}
export function filterBrand(station: Pick<Station, "originalBrand" | "normalizedBrand">): { key: string; label: string; logo?: string } {
  const original = station.originalBrand?.normalize("NFKC").trim();
  if (!original) return { key: UNKNOWN_BRAND, label: "" };
  // Normalized metadata is usable only when it denotes the same recorded brand.
  // A stale Shell/Idemitsu record must never be upgraded to apollostation.
  const recorded = sameBrandAlias(original);
  const normalized = station.normalizedBrand?.trim();
  const value = normalized && sameBrandAlias(normalized) === recorded ? normalized : original;
  const key = sameBrandAlias(value);
  return { key: `brand:${key}`, label: key === "eneos" ? "ENEOS" : key === "cosmo" ? "Cosmo" : key === "idemitsu" ? "Idemitsu" : key === "shell" ? "Shell" : key === "apollostation" ? "apollostation" : value.normalize("NFKC").trim(),
    ...(key === "eneos" || key === "cosmo" ? { logo: `/brands/${key}-symbol.svg` } : {}) };
}
export interface BrandOption { key: string; label: string; logo?: string; count: number }
export function stationFilterOptions(stations: Station[]) {
  const brands = new Map<string, BrandOption>();
  const payments = { visa: 0, mastercard: 0 };
  const services = { SELF: 0, FULL: 0 };
  for (const station of stations) {
    const brand = filterBrand(station);
    const option = brands.get(brand.key);
    if (option) { option.count++; if (brand.label < option.label) option.label = brand.label; }
    else brands.set(brand.key, { ...brand, count: 1 });
    if (station.paymentVisa === "YES") payments.visa++;
    if (station.paymentMastercard === "YES") payments.mastercard++;
    if (station.serviceType === "SELF" || station.serviceType === "FULL") services[station.serviceType]++;
  }
  if (!brands.has(UNKNOWN_BRAND)) brands.set(UNKNOWN_BRAND, { key: UNKNOWN_BRAND, label: "", count: 0 });
  return { brands: [...brands.values()].sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0)), payments, services };
}
export function applyStationFilters<T extends Station>(stations: T[], query: string, filters: StationFilterState): T[] {
  const queried = filterStations(stations, query);
  if (!activeFilterCount(filters)) return queried;
  return queried.filter((station) =>
    (!filters.brands.length || filters.brands.includes(filterBrand(station).key)) &&
    (!filters.payments.length || filters.payments.some((payment) => station[payment === "visa" ? "paymentVisa" : "paymentMastercard"] === "YES")) &&
    (!filters.services.length || filters.services.some((service) => station.serviceType === service)));
}
