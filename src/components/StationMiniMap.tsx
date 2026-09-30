import { messages, type Locale } from "../i18n";
import { stationBrand } from "../lib/station-brand";
import type { Station } from "../lib/stations";
import { MapThumbnail } from "./MapThumbnail";

export function StationMiniMap({ station, locale, tileUrl, onOpen }: { station: Station; locale: Locale; tileUrl: string | null | undefined; onOpen?: () => void }) {
  const t = messages[locale];
  return <MapThumbnail point={station} id={station.id} name={station.name || t.ffUnnamed} icon={stationBrand(station).logo ?? "/brands/fuel-pump.svg"} fallbackIcon="/brands/fuel-pump.svg" locale={locale} tileUrl={tileUrl} onOpen={onOpen} openLabel={t.smOpen} previewLabel={t.smPreview} />;
}
