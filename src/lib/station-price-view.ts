import type { FuelType, Station } from "./stations";
export interface StationQuote {
  stationId: string;
  fuelType: FuelType;
  priceJpyPerL: number;
  unit: "JPY/L";
  basis: "CASH_TAX_INCLUDED_GENERAL";
  sourceId: string;
  sourceUrl: string;
  observedAt: string;
  fetchedAt: string;
  validUntil: string;
}
export type PriceTone = "unknown" | "low" | "medium" | "high";
export interface StationPriceView {
  status: "unknown" | "unavailable" | "valid";
  tone: PriceTone;
  quote?: StationQuote;
  comparableCount: number;
}
// Production boundary: no approved station-price source is connected.
export const STATION_QUOTES: readonly StationQuote[] = Object.freeze([]);
export const UNKNOWN_PRICE: StationPriceView = { status: "unknown", tone: "unknown", comparableCount: 0 };
const fields = { REGULAR: "fuelRegular", DIESEL: "fuelDiesel", HIGH_OCTANE: "fuelHighOctane" } as const;
function timestamp(value: unknown): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) return NaN;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value.slice(0, 19) ? date.getTime() : NaN;
}
function valid(quote: StationQuote, now: number): boolean {
  const observed = timestamp(quote.observedAt), fetched = timestamp(quote.fetchedAt), until = timestamp(quote.validUntil);
  if (!Number.isFinite(now) || !Number.isFinite(observed) || !Number.isFinite(fetched) || !Number.isFinite(until) || observed > now || fetched > now || fetched < observed || until <= now || until < fetched) return false;
  if (quote.unit !== "JPY/L" || quote.basis !== "CASH_TAX_INCLUDED_GENERAL" || !Number.isFinite(quote.priceJpyPerL) || quote.priceJpyPerL < 1 || quote.priceJpyPerL > 1000 || typeof quote.sourceId !== "string" || !quote.sourceId.trim()) return false;
  try { const url = new URL(quote.sourceUrl); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}
/** Compare all loaded stations, before query filtering/pagination/map movement.
 * Dates use canonical UTC ISO timestamps; observation days are Japan calendar days.
 * validUntil must come from a future reviewed source, never an invented TTL.
 */
export function stationPriceViews(stations: readonly Station[], quotes: readonly StationQuote[], fuel: FuelType, now: number): ReadonlyMap<string, StationPriceView> {
  const views = new Map<string, StationPriceView>();
  const candidates = new Map<string, StationQuote[]>();
  for (const quote of quotes) if (quote.fuelType === fuel) candidates.set(quote.stationId, [...(candidates.get(quote.stationId) ?? []), quote]);
  const groups = new Map<string, StationPriceView[]>();
  for (const station of stations) {
    if (views.has(station.id)) continue;
    if (station[fields[fuel]] === "NO") { views.set(station.id, { status: "unavailable", tone: "unknown", comparableCount: 0 }); continue; }
    const rows = candidates.get(station.id) ?? [];
    // Ambiguous duplicates, including stale competing records, require upstream review.
    if (rows.length !== 1 || !valid(rows[0], now)) { views.set(station.id, UNKNOWN_PRICE); continue; }
    const quote = rows[0];
    const view: StationPriceView = { status: "valid", tone: "unknown", quote, comparableCount: 0 };
    views.set(station.id, view);
    if (station.prefectureCode === "UNKNOWN") continue;
    const day = new Date(Date.parse(quote.observedAt) + 9 * 3600_000).toISOString().slice(0, 10);
    const key = JSON.stringify([station.prefectureCode, quote.sourceId, quote.unit, quote.basis, day]);
    groups.set(key, [...(groups.get(key) ?? []), view]);
  }
  for (const group of groups.values()) {
    const prices = [...new Set(group.map((view) => view.quote!.priceJpyPerL))].sort((a, b) => a - b);
    for (const view of group) {
      view.comparableCount = group.length;
      if (group.length >= 3 && prices.length >= 3) view.tone = (["low", "medium", "high"] as const)[Math.floor(prices.indexOf(view.quote!.priceJpyPerL) * 3 / prices.length)];
    }
  }
  return views;
}


export type FuelPriceViews = Readonly<Record<FuelType, ReadonlyMap<string, StationPriceView>>>;

/** Independent fuel cohorts: a diesel quote never changes a gasoline color. */
export function allFuelPriceViews(stations: readonly Station[], quotes: readonly StationQuote[], now: number): FuelPriceViews {
  return {
    REGULAR: stationPriceViews(stations, quotes, "REGULAR", now),
    HIGH_OCTANE: stationPriceViews(stations, quotes, "HIGH_OCTANE", now),
    DIESEL: stationPriceViews(stations, quotes, "DIESEL", now),
  };
}
