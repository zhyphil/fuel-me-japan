import { isRecord, partitionCodes, type PartitionCode } from "./stations";

export const FAVORITES_KEY = "fuel-me-japan.favorites.v1";
export const FAVORITES_LIMIT = 200;
export interface Favorite { id: string; partition: PartitionCode }
export type FavoriteNotice = "storage" | "corrupt" | null;
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
export function isFavorite(value: unknown): value is Favorite {
  if (!isRecord(value) || !exactKeys(value, ["id", "partition"]) || typeof value.id !== "string" || !partitionCodes.includes(value.partition as PartitionCode)) return false;
  const match = /^osm:(node|way|relation):([1-9]\d{0,15})$/.exec(value.id);
  return Boolean(match && Number.isSafeInteger(Number(match[2])));
}
export function parseFavorites(raw: string | null): Favorite[] {
  if (raw === null) return [];
  if (raw.length > 24_000) throw new Error("Oversize favorites");
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || !exactKeys(value, ["version", "entries"]) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > FAVORITES_LIMIT || !value.entries.every(isFavorite)) throw new Error("Invalid favorites");
  const unique = new Map<string, Favorite>();
  for (const entry of value.entries) if (!unique.has(entry.id)) unique.set(entry.id, { id: entry.id, partition: entry.partition });
  return [...unique.values()];
}
export function readFavorites(): { entries: Favorite[]; notice: FavoriteNotice } {
  let raw: string | null;
  try { raw = window.localStorage.getItem(FAVORITES_KEY); } catch { return { entries: [], notice: "storage" }; }
  try { return { entries: parseFavorites(raw), notice: null }; } catch { return { entries: [], notice: "corrupt" }; }
}
export function saveFavorites(entries: readonly Favorite[]): boolean {
  try {
    // Whitelist on both read and write. Never serialize station objects.
    const safe = parseFavorites(JSON.stringify({ version: 1, entries: entries.map(({ id, partition }) => ({ id, partition })) }));
    window.localStorage.setItem(FAVORITES_KEY, JSON.stringify({ version: 1, entries: safe }));
    return true;
  } catch { return false; }
}
