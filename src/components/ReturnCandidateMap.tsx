import { useEffect, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { messages, type Locale } from "../i18n";
import { createMapMarkers, stationMarkerHeight, type MapMarkerSpec } from "../lib/map-markers";
import { createMapClusterCache, mapMemberKey } from "../lib/map-view";
import { stationBrand } from "../lib/station-brand";
import { rentalName } from "../lib/rental-view";
import type { RentalLocation } from "../lib/rental";
import type { ReturnCandidate } from "../lib/return-car";

type Props = { stations: ReturnCandidate[]; location: RentalLocation; locale: Locale; tileUrl: string | null | undefined; previewId: string | null; onPreview: (id: string) => void };
export function ReturnCandidateMap(props: Props) {
  const { stations, location, locale, tileUrl, previewId } = props;
  const t = messages[locale];
  const surface = useRef<HTMLDivElement>(null);
  const latest = useRef(props); latest.current = props;
  const runtime = useRef<{ draw: () => void; fit: () => void; preview: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!tileUrl) return;
    let cancelled = false; let cleanup = () => {};
    setFailed(false); setReady(false);
    import("leaflet").then(L => {
      if (cancelled || !surface.current) return;
      const map = L.map(surface.current, { attributionControl: false, zoomControl: false, scrollWheelZoom: false, minZoom: 3, maxZoom: 19, maxBounds: [[15, 110], [55, 160]] });
      const zoom = L.control.zoom().addTo(map);
      L.tileLayer(tileUrl, { keepBuffer: 0, updateWhenIdle: true, noWrap: true, maxZoom: 19 }).on("tileerror", () => { if (!cancelled) setFailed(true); }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      const pins = createMapMarkers(L, layer, surface.current);
      const branchIcon = document.createElement("span"); branchIcon.className = "rental-map-point return-map-branch"; branchIcon.setAttribute("role", "img");
      const image = document.createElement("img"); image.src = "/icons/rental-car.svg"; image.alt = ""; image.width = 28; image.height = 28; branchIcon.append(image);
      const branch = L.marker([latest.current.location.lat, latest.current.location.lon], { keyboard: false, interactive: false, icon: L.divIcon({ html: branchIcon, className: "rental-marker", iconSize: [44, 44], iconAnchor: [22, 22] }) }).addTo(map);
      const clusterCache = createMapClusterCache<ReturnCandidate>();
      let frame = 0;
      const draw = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const p = latest.current; const copy = messages[p.locale];
          const zoomNode = zoom.getContainer();
          for (const [selector, label] of [[".leaflet-control-zoom-in", copy.mapZoomIn], [".leaflet-control-zoom-out", copy.mapZoomOut]]) {
            const control = zoomNode?.querySelector(selector); control?.setAttribute("title", label); control?.setAttribute("aria-label", label);
          }
          branch.setLatLng([p.location.lat, p.location.lon]);
          branchIcon.setAttribute("aria-label", `${copy.rcMapBranch}: ${rentalName(p.location, p.locale)}`);
          branchIcon.title = `${copy.rcMapBranch}: ${rentalName(p.location, p.locale)}`;
          const specs: MapMarkerSpec[] = [];
          const addStation = (station: ReturnCandidate) => specs.push({
            key: station.id, dataKey: station.id, ids: [station.id], lat: station.lat, lon: station.lon,
            label: copy.rcPreviewStation.replace("{name}", station.name || copy.ffUnnamed),
            className: `map-pin-station no-price${station.id === p.previewId ? " is-selected is-preview" : ""}`,
            selected: station.id === p.previewId, text: "",
            station: { logo: stationBrand(station).logo || "/brands/fuel-pump.svg", prices: [] },
            onClick: () => latest.current.onPreview(station.id),
          });
          const level = map.getZoom();
          for (const group of clusterCache(p.stations, level, 100, point => map.project([point.lat, point.lon], level))) {
            const members = group.members.filter(station => station.id !== p.previewId);
            if (members.length <= 1 || level >= map.getMaxZoom()) { members.forEach(addStation); continue; }
            const ids = members.map(station => station.id);
            const key = mapMemberKey("return-stations", ids);
            const bounds = L.latLngBounds(members.map(station => [station.lat, station.lon]));
            const center = bounds.getCenter();
            specs.push({ key, dataKey: key, ids, lat: center.lat, lon: center.lng, text: members.length.toLocaleString(p.locale),
              label: copy.mapClusterZoom.replace("{count}", members.length.toLocaleString(p.locale)), className: "map-pin-cluster", selected: false,
              onClick: () => {
                const nextZoom = Math.min(map.getMaxZoom(), Math.max(map.getZoom() + 1, map.getBoundsZoom(bounds, false, L.point(100, 140))));
                map.stop(); map.setView(center, nextZoom, { animate: false }); pins.focus(ids); draw();
              },
            });
          }
          const focused = p.stations.find(station => station.id === p.previewId); if (focused) addStation(focused);
          pins.update(specs);
        });
      };
      const fit = () => {
        if (!surface.current?.clientWidth) return;
        const p = latest.current; map.stop(); map.invalidateSize({ animate: false });
        const points: Leaflet.LatLngTuple[] = [p.location, ...p.stations].map(point => [point.lat, point.lon]);
        map.fitBounds(L.latLngBounds(points), { paddingTopLeft: [55, 100], paddingBottomRight: [55, 30], maxZoom: 15, animate: false });
      };
      const preview = () => {
        const p = latest.current; const station = p.stations.find(row => row.id === p.previewId);
        if (!station) return;
        const level = Math.max(16, map.getZoom());
        const center = map.unproject(map.project([station.lat, station.lon], level).subtract([0, stationMarkerHeight(0) / 2]), level);
        map.stop(); map.setView(center, level, { animate: false });
      };
      runtime.current = { draw, fit, preview }; fit(); preview(); draw(); map.on("zoomend", draw);
      const resize = new ResizeObserver(() => { if (surface.current?.clientWidth) { map.invalidateSize({ animate: false }); preview(); } }); resize.observe(surface.current);
      cleanup = () => { cancelAnimationFrame(frame); resize.disconnect(); pins.dispose(); runtime.current = null; map.remove(); };
      setReady(true);
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; cleanup(); };
  }, [tileUrl]);
  useEffect(() => { runtime.current?.fit(); runtime.current?.draw(); }, [stations, location, ready]);
  useEffect(() => { runtime.current?.preview(); runtime.current?.draw(); }, [previewId, locale, ready]);
  return <section className="return-candidate-map" aria-label={t.rcCandidateMap}>
    <div ref={surface} className="return-map-surface" data-testid="return-candidate-map" aria-label={t.rcCandidateMap} aria-describedby="return-map-help" />
    {(!ready || failed) && <p className="return-map-message" role="status">{failed || tileUrl === null ? t.rdMapUnavailable : t.mapLoading}</p>}
    <div className="rental-map-caption"><p id="return-map-help">{t.rcCandidateMapHelp}</p><a href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a><p>{t.mapPrivacy}</p></div>
  </section>;
}
