import { japaneseLabels, messages, type Locale } from "../i18n";
import type { FuelType } from "../lib/stations";
import type { StationPriceView } from "../lib/station-price-view";
const names = { REGULAR: "ffRegular", DIESEL: "ffDiesel", HIGH_OCTANE: "ffHighOctane" } as const;
const japanese = { REGULAR: japaneseLabels.regular, DIESEL: japaneseLabels.diesel, HIGH_OCTANE: japaneseLabels.highOctane };
const tones = { unknown: "fpNotComparable", low: "fpLow", medium: "fpMedium", high: "fpHigh" } as const;
export function fuelDisplayName(fuel: FuelType, locale: Locale): string { return `${messages[locale][names[fuel]]} / ${japanese[fuel]}`; }
export function priceDisplayText(view: StationPriceView, locale: Locale): string {
  const t = messages[locale];
  if (view.status !== "valid" || !view.quote) return "";
  return `${view.quote.priceJpyPerL.toLocaleString(locale)} ${t.ffJpyL} · ${t[tones[view.tone]]}`;
}
export function FuelPrice({ view, fuel, locale }: { view: StationPriceView; fuel: FuelType; locale: Locale }) {
  if (!priceDisplayText(view, locale)) return null;
  return <span className={`station-price price-${view.tone}`} aria-label={`${fuelDisplayName(fuel, locale)}: ${priceDisplayText(view, locale)}`}>{priceDisplayText(view, locale)}</span>;
}
