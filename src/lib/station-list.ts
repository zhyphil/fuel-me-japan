import type { FuelType, Station } from "./stations";
import type { StationPriceView } from "./station-price-view";

export type ListMode = "cheapest" | "nearest" | "favorites";
export type PriceRanking = "ranked" | "no-quotes" | "not-comparable";
export function sortCheapest<T extends Station>(stations: readonly T[], views: ReadonlyMap<string, StationPriceView>, fuel: FuelType): { stations: T[]; ranking: PriceRanking } {
  const prices = new Map<string, number>();
  const groups = new Set<string>();
  let unknownRegion = false;
  for (const station of stations) {
    const view = views.get(station.id);
    const quote = view?.status === "valid" ? view.quote : undefined;
    if (!quote || quote.fuelType !== fuel) continue;
    // Views enforce stale/duplicate/NO protections. Use the same Japan-day
    // comparison boundary as price colors, on the full filtered subset.
    if (station.prefectureCode === "UNKNOWN") unknownRegion = true;
    const day = new Date(Date.parse(quote.observedAt) + 9 * 3600_000).toISOString().slice(0, 10);
    groups.add(JSON.stringify([station.prefectureCode, quote.sourceId, quote.unit, quote.basis, day]));
    prices.set(station.id, quote.priceJpyPerL);
  }
  if (!prices.size) return { stations: [...stations], ranking: "no-quotes" };
  if (unknownRegion || groups.size !== 1 || prices.size < 2) return { stations: [...stations], ranking: "not-comparable" };
  return { stations: [...stations].sort((a, b) => {
    const left = prices.get(a.id), right = prices.get(b.id);
    return left === undefined ? right === undefined ? 0 : 1 : right === undefined ? -1 : left - right;
  }), ranking: "ranked" };
}
export function sortNearest<T extends { distanceKm?: number }>(stations: readonly T[]): T[] {
  const distance = (station: T) => typeof station.distanceKm === "number" && Number.isFinite(station.distanceKm) && station.distanceKm >= 0 ? station.distanceKm : Infinity;
  return [...stations].sort((a, b) => distance(a) === distance(b) ? 0 : distance(a) - distance(b));
}
