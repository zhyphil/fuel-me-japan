import { japaneseLabels, messages, type Locale } from "../i18n";
import type { FuelType } from "../lib/stations";
import type { FuelPriceViews, StationPriceView } from "../lib/station-price-view";
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


export function FuelPrices({ views, fuels, stationId, locale }: { views: FuelPriceViews; fuels: readonly FuelType[]; stationId: string; locale: Locale }) {
  return <>{fuels.map((fuel) => {
    const view = views[fuel].get(stationId);
    return view && priceDisplayText(view, locale) ? <span key={fuel} className="station-fuel-price"><span>{fuelDisplayName(fuel, locale)}</span><FuelPrice view={view} fuel={fuel} locale={locale} /></span> : null;
  })}</>;
}

export function markerFuelPrices(views: FuelPriceViews, fuels: readonly FuelType[], stationId: string, locale: Locale) {
  const shortNames = { REGULAR: "mfRegular", HIGH_OCTANE: "mfHighOctane", DIESEL: "mfDiesel" } as const;
  return fuels.flatMap((fuel) => {
    const view = views[fuel].get(stationId);
    if (!view || view.status !== "valid" || !view.quote) return [];
    return [{ fuel, text: `${messages[locale][shortNames[fuel]]} ${view.quote.priceJpyPerL.toLocaleString(locale)} ${messages[locale].ffJpyL}`, tone: view.tone,
      label: `${fuelDisplayName(fuel, locale)}: ${priceDisplayText(view, locale)}` }];
  });
}
