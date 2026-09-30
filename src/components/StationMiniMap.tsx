import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "../i18n";
import { stationBrand } from "../lib/station-brand";
import { stationMiniMapTiles, type MiniMapTile } from "../lib/station-mini-map";
import type { Station } from "../lib/stations";

interface Props { station: Station; locale: Locale; tileUrl: string | null | undefined; onOpen: () => void }

export function StationMiniMap({ station, locale, tileUrl, onOpen }: Props) {
  const t = messages[locale];
  const button = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = button.current;
    if (!element) return;
    let visible = false;
    const measure = () => {
      if (!visible) { setSize(null); return; }
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) => previous?.width === width && previous.height === height ? previous : { width, height });
    };
    // The viewport AND the scrolling list clip this observer. Hidden rows have no tile images.
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; measure(); });
    const resize = new ResizeObserver(measure);
    visibility.observe(element); resize.observe(element);
    return () => { visibility.disconnect(); resize.disconnect(); };
  }, []);
  const tiles = size && tileUrl ? stationMiniMapTiles(station, size.width, size.height) : [];
  const logo = stationBrand(station).logo ?? "/brands/fuel-pump.svg";
  return <div className="station-mini-map">
    <button ref={button} type="button" id={`thumbnail-${station.id}`} className="station-mini-map-open" aria-label={t.smOpen.replace("{name}", station.name || t.ffUnnamed)} onClick={onOpen}>
      {size && tileUrl && tiles.length ? <TilePreview key={`${station.lat}:${station.lon}:${size.width}:${size.height}:${tileUrl}`} tiles={tiles} tileUrl={tileUrl} locale={locale} /> : <span className="station-mini-map-message" aria-hidden="true">{tileUrl === null ? t.smUnavailable : t.mapLoading}</span>}
      <span className="station-mini-map-pin" aria-hidden="true"><img src={logo} alt="" width="24" height="24" onError={(event) => { if (event.currentTarget.getAttribute("src") !== "/brands/fuel-pump.svg") event.currentTarget.src = "/brands/fuel-pump.svg"; }} /></span>
      <span className="station-mini-map-expand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6m0-6-6 6M10 20H4v-6m0 6 6-6" /></svg></span>
    </button>
    <a className="station-mini-map-attribution" href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a>
  </div>;
}

function TilePreview({ tiles, tileUrl, locale }: { tiles: MiniMapTile[]; tileUrl: string; locale: Locale }) {
  const t = messages[locale];
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  return <>
    <span className="station-mini-map-tiles" aria-hidden="true">{tiles.map((tile) => {
      const key = `${tile.x}:${tile.y}`;
      return <img key={key} src={tileUrl.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y))} alt="" width="256" height="256" decoding="async" draggable={false} style={{ left: tile.left, top: tile.top }} onLoad={() => setLoaded((current) => new Set(current).add(key))} onError={() => setFailed(true)} />;
    })}</span>
    {(failed || loaded.size < tiles.length) && <span className="station-mini-map-message" aria-hidden="true">{failed ? t.smUnavailable : t.mapLoading}</span>}
  </>;
}
