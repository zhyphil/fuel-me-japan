import type { FuelType } from "./stations";
export const FUEL_PREFERENCE_KEY = "fuel-me-japan.preferred-fuel.v1";
export const DEFAULT_FUEL: FuelType = "REGULAR";
export function isFuelType(value: unknown): value is FuelType {
  return value === "REGULAR" || value === "DIESEL" || value === "HIGH_OCTANE";
}
function isFuelSelection(value: unknown): value is FuelType[] {
  return Array.isArray(value) && value.length >= 1 && value.length <= 3 && value.every(isFuelType) && new Set(value).size === value.length;
}
// Accessing localStorage itself can throw. Never persist on initial read.
export function readFuelPreference(): FuelType[] {
  try {
    const value = window.localStorage.getItem(FUEL_PREFERENCE_KEY);
    if (isFuelType(value)) return [value]; // Previous single-fuel format, without an automatic write.
    const selection: unknown = value === null ? null : JSON.parse(value);
    return isFuelSelection(selection) ? selection : [DEFAULT_FUEL];
  } catch { return [DEFAULT_FUEL]; }
}
export function saveFuelPreference(fuels: readonly FuelType[]): void {
  try { if (isFuelSelection(fuels)) window.localStorage.setItem(FUEL_PREFERENCE_KEY, JSON.stringify(fuels)); } catch { /* Memory-only selection remains usable. */ }
}
export function resetFuelPreference(): void {
  try { window.localStorage.removeItem(FUEL_PREFERENCE_KEY); } catch { /* Memory-only default remains usable. */ }
}
