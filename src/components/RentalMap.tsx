import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { messages, type Locale } from "../i18n";
import { createMapClusterCache, filterMapClusters } from "../lib/map-view";
import type { RentalIndexEntry } from "../lib/rental";
import { rentalName } from "../lib/rental-view";
import { rentalHref } from "../lib/routes";

type Props = { rows: RentalIndexEntry[]; locale: Locale; tileUrl: string | null | undefined; search: string; fitKey: string; overview?: boolean; previewId?: string | null; markerPrefix?: string };
const japan: Leaflet.LatLngBoundsExpression = [[24, 123], [46, 146]];
export function RentalMap(props: Props) {
  const { locale, tileUrl, fitKey, rows, previewId, overview } = props;
  const t = messages[locale];
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const runtime = useRef<{ map: Leaflet.Map; draw: () => void; fit: () => void } | null>(null);
  const [ready, setReady] = useState(0);
  const [failed, setFailed] = useState(false);
  const [clusterLimit, setClusterLimit] = useState(20);
  const [cluster, setCluster] = useState<RentalIndexEntry[]>([]);
  const clusterPanel = useRef<HTMLDetailsElement>(null);
  const focusCluster = useRef(false);
  useEffect(() => {
    if (!cluster.length || !focusCluster.current) return;
    focusCluster.current = false;
    const frame = requestAnimationFrame(() => clusterPanel.current?.querySelector("summary")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [cluster]);
  useEffect(() => {
    if (!tileUrl) return;
    let cancelled = false; let cleanup = () => {};
    import("leaflet").then(L => {
      if (cancelled || !surface.current) return;
      const map = L.map(surface.current, { attributionControl: false, zoomControl: false, scrollWheelZoom: false, minZoom: 3, maxZoom: 19, maxBounds: [[15, 110], [55, 160]] });
      const zoom = L.control.zoom({ zoomInTitle: messages[latest.current.locale].mapZoomIn, zoomOutTitle: messages[latest.current.locale].mapZoomOut }).addTo(map);
      L.tileLayer(tileUrl, { keepBuffer: 0, updateWhenIdle: true, noWrap: true, maxZoom: 19 }).on("tileerror", () => { if (!cancelled) setFailed(true); }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const clusters = createMapClusterCache<RentalIndexEntry>();
      let frame = 0;
      const draw = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          if (!surface.current?.clientWidth || !map.getZoom()) return;
          const p = latest.current; const copy = messages[p.locale];
          const zoomNode = zoom.getContainer();
          for (const [selector, label] of [['.leaflet-control-zoom-in', copy.mapZoomIn], ['.leaflet-control-zoom-out', copy.mapZoomOut]]) { const control = zoomNode?.querySelector(selector); control?.setAttribute('title', label); control?.setAttribute('aria-label', label); }
          const focusedId = document.activeElement?.id;
          layer.clearLayers();
          const bounds = map.getPixelBounds();
          const visible = filterMapClusters(clusters(p.rows, map.getZoom(), 64, row => map.project([row.lat, row.lon])), { min: bounds.min!, max: bounds.max! });
          const addPoint = (row: RentalIndexEntry, highlight = false) => {
            const a = document.createElement("a"); a.href = rentalHref(p.locale, row.id, p.search); a.id = `${p.markerPrefix || "rental-marker"}-${row.id}`; a.className = `rental-map-point${highlight ? " is-preview" : ""}`;
            a.setAttribute("aria-label", `${copy.rdView}: ${rentalName(row, p.locale)}`); a.title = rentalName(row, p.locale);
            const img = document.createElement("img"); img.src = "/icons/rental-car.svg"; img.alt = ""; img.width = 28; img.height = 28; a.append(img);
            L.marker([row.lat, row.lon], { keyboard: false, zIndexOffset: highlight ? 1000 : 0, icon: L.divIcon({ html: a, className: "rental-marker", iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(layer);
          };
          for (const bucket of visible) {
            if (bucket.members.length === 1) { if (bucket.members[0].id !== p.previewId) addPoint(bucket.members[0]); continue; }
            const button = document.createElement("button"); button.type = "button"; button.className = "rental-map-cluster"; button.textContent = bucket.members.length.toLocaleString(p.locale);
            button.setAttribute("aria-label", copy.rdCluster.replace("{count}", button.textContent));
            button.onclick = event => { focusCluster.current = event.detail === 0; setCluster([...bucket.members]); setClusterLimit(20); map.fitBounds(L.latLngBounds(bucket.members.map(row => [row.lat, row.lon])), { padding: [36, 36], maxZoom: 17, animate: false }); };
            L.marker(map.unproject([bucket.x, bucket.y]), { keyboard: false, icon: L.divIcon({ html: button, className: "rental-marker", iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(layer);
          }
          const focused = p.rows.find(row => row.id === p.previewId); if (focused) addPoint(focused, true);
          if (focusedId?.startsWith(p.markerPrefix || "rental-marker")) document.getElementById(focusedId)?.focus({ preventScroll: true });
        });
      };
      const fit = () => { const p = latest.current; if (!surface.current?.clientWidth) return; map.invalidateSize(); map.fitBounds(p.overview || !p.rows.length ? japan : L.latLngBounds(p.rows.map(row => [row.lat, row.lon])), { padding: [30, 30], maxZoom: 14, animate: false }); };
      runtime.current = { map, draw, fit }; fit(); map.on("moveend zoomend", draw); draw();
      const resize = new ResizeObserver(() => { if (surface.current?.clientWidth) { map.invalidateSize({ animate: false }); draw(); } }); resize.observe(surface.current);
      cleanup = () => { cancelAnimationFrame(frame); resize.disconnect(); runtime.current = null; map.remove(); };
      setReady(value => value + 1);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; cleanup(); };
  }, [tileUrl]);
  useEffect(() => { runtime.current?.fit(); setCluster([]); }, [fitKey, overview, ready]);
  useEffect(() => { runtime.current?.draw(); }, [rows, locale, previewId, props.search]);
  useEffect(() => {
    const row = rows.find(row => row.id === previewId);
    if (row) runtime.current?.map.setView([row.lat, row.lon], 14, { animate: false });
  }, [previewId, rows]);
  return <section className="rental-map-wrap" aria-label={t.rdMap}>
    <div ref={surface} className="rental-map" data-testid="rental-map" />
    {(!ready || failed) && <p className="rental-map-message" role="status">{failed || tileUrl === null ? t.rdMapUnavailable : t.mapLoading}</p>}
    <div className="rental-map-caption"><a href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a><p>{t.mapPrivacy}</p></div>
    {cluster.length > 0 && <details ref={clusterPanel} className="rental-cluster-members" open><summary>{t.rdCluster.replace("{count}", cluster.length.toLocaleString(locale))}</summary><ul>{cluster.slice(0, clusterLimit).map(row => <li key={row.id}><a tabIndex={0} href={rentalHref(locale, row.id, props.search)}>{rentalName(row, locale)}</a></li>)}</ul>{clusterLimit < cluster.length && <button type="button" className="button" onClick={() => setClusterLimit(n => n + 20)}>{t.rdMore}</button>}</details>}
  </section>;
}
