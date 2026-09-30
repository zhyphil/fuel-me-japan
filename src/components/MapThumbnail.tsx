import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "../i18n";
import { stationMiniMapTiles, type MiniMapTile } from "../lib/station-mini-map";
import type { Coordinates } from "../lib/stations";

interface Props { point: Coordinates; id: string; name: string; icon: string; fallbackIcon?: string; locale: Locale; tileUrl: string | null | undefined; onOpen?: () => void; href?: string; openLabel: string; previewLabel: string; unavailableLabel?: string }

export function MapThumbnail({ point, id, name, icon, fallbackIcon = "/icons/rental-car.svg", locale, tileUrl, onOpen, href, openLabel, previewLabel, unavailableLabel: customUnavailable }: Props) {
  const t = messages[locale];
  const preview = useRef<HTMLElement | null>(null);
  const interactive = Boolean(onOpen || href);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    const element = preview.current;
    if (!element) return;
    let visible = false;
    const measure = () => {
      if (!visible) { setSize(null); return; }
      const width = element.clientWidth;
      const height = element.clientHeight;
      setSize((previous) => previous?.width === width && previous.height === height ? previous : { width, height });
    };
    // The viewport AND the scrolling list/dialog clip this observer. Hidden rows have no tile images.
    const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; measure(); });
    const resize = new ResizeObserver(measure);
    visibility.observe(element); resize.observe(element);
    return () => { visibility.disconnect(); resize.disconnect(); };
  }, [interactive]);
  const tiles = size && tileUrl ? stationMiniMapTiles(point, size.width, size.height) : [];
  const logo = icon;
  const unavailableLabel = customUnavailable ?? (interactive ? t.smUnavailable : t.smPreviewUnavailable);
  const content = <>
    {size && tileUrl && tiles.length ? <TilePreview key={`${point.lat}:${point.lon}:${size.width}:${size.height}:${tileUrl}`} tiles={tiles} tileUrl={tileUrl} locale={locale} unavailableLabel={unavailableLabel} /> : <span className="station-mini-map-message" aria-hidden="true">{tileUrl === null ? unavailableLabel : t.mapLoading}</span>}
    <span className="station-mini-map-pin" aria-hidden="true"><img src={logo} alt="" width="24" height="24" onError={(event) => { if (event.currentTarget.getAttribute("src") !== fallbackIcon) event.currentTarget.src = fallbackIcon; }} /></span>
  </>;
  return <div className="station-mini-map">
    {href ? <a ref={element => { preview.current = element; }} id={`thumbnail-${id}`} className="station-mini-map-open" href={href} aria-label={openLabel.replace("{name}", name)}>{content}</a> : onOpen ? <button ref={element => { preview.current = element; }} type="button" id={`thumbnail-${id}`} className="station-mini-map-open" aria-label={openLabel.replace("{name}", name)} onClick={onOpen}>
      {content}
      <span className="station-mini-map-expand" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 4h6v6m0-6-6 6M10 20H4v-6m0 6 6-6" /></svg></span>
    </button> : <div ref={element => { preview.current = element; }} className="station-mini-map-preview" role="img" aria-label={previewLabel.replace("{name}", name)}>{content}</div>}
    <a className="station-mini-map-attribution" href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a>
  </div>;
}

function TilePreview({ tiles, tileUrl, locale, unavailableLabel }: { tiles: MiniMapTile[]; tileUrl: string; locale: Locale; unavailableLabel: string }) {
  const t = messages[locale];
  const [loaded, setLoaded] = useState<Set<string>>(() => new Set());
  const [failed, setFailed] = useState(false);
  return <>
    <span className="station-mini-map-tiles" aria-hidden="true">{tiles.map((tile) => {
      const key = `${tile.x}:${tile.y}`;
      return <img key={key} src={tileUrl.replace("{z}", String(tile.z)).replace("{x}", String(tile.x)).replace("{y}", String(tile.y))} alt="" width="256" height="256" decoding="async" draggable={false} style={{ left: tile.left, top: tile.top }} onLoad={() => setLoaded((current) => new Set(current).add(key))} onError={() => setFailed(true)} />;
    })}</span>
    {(failed || loaded.size < tiles.length) && <span className="station-mini-map-message" aria-hidden="true">{failed ? unavailableLabel : t.mapLoading}</span>}
  </>;
}
