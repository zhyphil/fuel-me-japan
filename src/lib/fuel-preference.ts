import type { FuelType } from "./stations";
export const FUEL_PREFERENCE_KEY = "fuel-me-japan.preferred-fuel.v1";
export const DEFAULT_FUEL: FuelType = "REGULAR";
export function isFuelType(value: unknown): value is FuelType {
  return value === "REGULAR" || value === "DIESEL" || value === "HIGH_OCTANE";
}
// Accessing localStorage itself can throw. Never persist on initial read.
export function readFuelPreference(): FuelType {
  try { const value = window.localStorage.getItem(FUEL_PREFERENCE_KEY); return isFuelType(value) ? value : DEFAULT_FUEL; }
  catch { return DEFAULT_FUEL; }
}
export function saveFuelPreference(fuel: FuelType): void {
  try { if (isFuelType(fuel)) window.localStorage.setItem(FUEL_PREFERENCE_KEY, fuel); } catch { /* Memory-only selection remains usable. */ }
}
export function resetFuelPreference(): void {
  try { window.localStorage.removeItem(FUEL_PREFERENCE_KEY); } catch { /* Memory-only default remains usable. */ }
}
