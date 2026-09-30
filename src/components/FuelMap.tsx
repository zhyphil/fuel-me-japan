import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import { messages, type Locale } from "../i18n";
import { prefectureName } from "../lib/find-fuel";
import { createMapClusterCache, filterMapClusters, mapMemberKey, occupiedCellsAnchor } from "../lib/map-view";
import { createMapFrameScheduler, createMapZoomQueue } from "../lib/map-scheduling";
import { createMapMarkers, type MapMarkerSpec } from "../lib/map-markers";
import { stationBrand } from "../lib/station-brand";
import { UNKNOWN_PRICE, type StationPriceView } from "../lib/station-price-view";
import { fuelDisplayName, priceDisplayText } from "./FuelPrice";
import type { DataManifest, FuelType, PrefectureCode, Station } from "../lib/stations";

export interface FuelMapHandle { focusStation: (id: string) => void; focusMap: () => void }
interface Props {
  locale: Locale;
  manifest: DataManifest | null;
  stations: Station[];
  selectedFuel: FuelType;
  priceViews: ReadonlyMap<string, StationPriceView>;
  overview: boolean;
  viewRevision: number;
  selectedId?: string;
  onPrefecture: (code: PrefectureCode) => void;
  onRegions: (codes: PrefectureCode[]) => void;
  onStation: (station: Station) => void;
  onMembers: (stations: Station[]) => void;
}
interface Runtime {
  L: typeof Leaflet;
  map: Leaflet.Map;
  tiles: Leaflet.TileLayer;
  draw: () => void;
  focusStation: (id: string) => void;
  replaceView: (view: () => void) => void;
}
const japanBounds: Leaflet.LatLngBoundsLiteral = [[24, 122], [46, 146]];
const tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export const FuelMap = forwardRef<FuelMapHandle, Props>(function FuelMap(props, ref) {
  const t = messages[props.locale];
  const surface = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useImperativeHandle(ref, () => ({
    focusStation: (id) => { if (runtime.current) runtime.current.focusStation(id); else surface.current?.focus({ preventScroll: true }); },
    focusMap: () => surface.current?.focus({ preventScroll: true }),
  }), []);

  useEffect(() => {
    let cancelled = false;
    let ownedMap: Leaflet.Map | undefined;
    let observer: ResizeObserver | undefined;
    let disposeRuntime: (() => void) | undefined;
    const controller = new AbortController();
    async function initialize() {
      try {
        // Leaflet touches window at import time: keep it out of prerender/SSR.
        const [L, response] = await Promise.all([import("leaflet"), fetch("/runtime-map-provider.json", { signal: controller.signal })]);
        if (!response.ok) throw new Error("Map configuration unavailable");
        const config: unknown = await response.json();
        if (!config || typeof config !== "object" || !("tileUrl" in config) || config.tileUrl !== tileUrl) throw new Error("Unapproved tile endpoint");
        if (cancelled || !surface.current) return;
        const map = L.map(surface.current, { attributionControl: false, zoomControl: false, scrollWheelZoom: false, minZoom: 2, zoomSnap: 0.25, maxZoom: 19, worldCopyJump: false, maxBounds: [[15, 110], [55, 160]], maxBoundsViscosity: 0.8 });
        ownedMap = map;
        if (surface.current.clientWidth && surface.current.clientHeight) map.fitBounds(japanBounds, { padding: [24, 24], animate: false });
        const copy = messages[latest.current.locale];
        const zoomControl = L.control.zoom({ position: "topleft", zoomInTitle: copy.mapZoomIn, zoomOutTitle: copy.mapZoomOut }).addTo(map);
        // Only visible tiles; no buffer prefetch, no service worker or offline store.
        const tiles = L.tileLayer(config.tileUrl, { maxZoom: 19, minZoom: 2, keepBuffer: 0, updateWhenIdle: true, noWrap: true, bounds: [[-85.0511, -180], [85.0511, 180]] });
        tiles.on("tileerror", () => { if (!cancelled) setTileFailed(true); });
        tiles.addTo(map);
        const layer = L.layerGroup().addTo(map);
        const pins = createMapMarkers(L, layer, surface.current);
        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
        type Anchor = { point: Leaflet.Point } | { center: Leaflet.LatLng };
        let resizePending = false;
        const scheduler = createMapFrameScheduler(() => {
          if (cancelled) return;
          if (!surface.current?.clientWidth || !surface.current.clientHeight) {
            // Empty results also clear the hidden map; this needs no map geometry.
            if (!latest.current.overview && !latest.current.stations.length) pins.update([]);
            return;
          }
          // A resize during zoom is retained until the final animation commit.
          if (zoomQueue.busy) return;
          if (resizePending) { resizePending = false; map.invalidateSize({ pan: true, animate: false }); }
          zoomQueue.flush();
          if (!zoomQueue.busy) draw();
        });
        const zoomQueue = createMapZoomQueue<Anchor>({
          getZoom: () => map.getZoom(), getMinZoom: () => map.getMinZoom(), getMaxZoom: () => map.getMaxZoom(),
          schedule: () => { scheduler.request(); updateZoomControls(); },
          apply: (zoom, anchor) => {
            const options = { animate: !reducedMotion.matches };
            if (anchor && "point" in anchor) map.setZoomAround(anchor.point, zoom, options);
            else map.setView(anchor && "center" in anchor ? anchor.center : map.getCenter(), zoom, options);
          },
        }, L.Browser.any3d ? map.options.zoomSnap : 1, map.options.wheelPxPerZoomLevel, map.options.wheelDebounceTime);
        const state: Runtime = {
          L, map, tiles, draw: () => scheduler.request(),
          focusStation: (id) => { pins.focus([id]); scheduler.request(); },
          replaceView: (view) => { resizePending = true; zoomQueue.replaceView(view); },
        };
        runtime.current = state;
        type Region = { code: PrefectureCode; count: number; lat: number; lon: number };
        let anchorManifest: DataManifest | null | undefined;
        let regions: Region[] = [];
        const regionCache = createMapClusterCache<Region>();
        const stationCache = createMapClusterCache<Station>();
        function zoomGroup(point: Leaflet.LatLng, ids: string[]) {
          pins.focus(ids);
          zoomQueue.zoomTo(Math.min(map.getMaxZoom(), map.getZoom() + 2), { center: point });
        }
        function draw() {
          const current = latest.current;
          const copy = messages[current.locale];
          const actualZoom = map.getZoom();
          const bounds = map.getPixelBounds();
          const viewport = { min: bounds.min!, max: bounds.max! };
          const specs: MapMarkerSpec[] = [];
          if (current.overview) {
            if (current.manifest !== anchorManifest) {
              anchorManifest = current.manifest;
              regions = (current.manifest?.stations.partitions ?? []).flatMap((partition) => {
                if (partition.code === "UNKNOWN" || !partition.count) return [];
                const anchor = occupiedCellsAnchor(partition.cells);
                return anchor ? [{ ...anchor, code: partition.code, count: partition.count }] : [];
              });
            }
            const groups = filterMapClusters(regionCache(regions, actualZoom, 84, (region) => map.project([region.lat, region.lon], actualZoom)), viewport, 84);
            for (const group of groups) {
              const point = map.unproject([group.x, group.y], actualZoom);
              const ids = group.members.map((region) => region.code);
              const count = group.members.reduce((sum, region) => sum + region.count, 0).toLocaleString(current.locale);
              if (group.members.length === 1) {
                const region = group.members[0];
                const name = prefectureName(region.code) ?? copy.ffUnknown;
                specs.push({ key: `region:${region.code}`, dataKey: region.code, ids, lat: region.lat, lon: region.lon, text: count,
                  label: copy.mapRegionMarker.replace("{region}", name).replace("{count}", count), className: "map-pin-region", selected: false,
                  place: actualZoom >= 7 ? name.split(" / ")[0] : undefined, onClick: () => latest.current.onPrefecture(region.code) });
              } else {
                const coincident = group.members.every((region) => region.lat === group.members[0].lat && region.lon === group.members[0].lon);
                const chooseRegions = coincident || actualZoom >= map.getMaxZoom();
                const key = mapMemberKey("regions", ids);
                specs.push({ key, dataKey: key, ids, lat: point.lat, lon: point.lng, text: count,
                  label: (chooseRegions ? copy.mapRegionChoices : copy.mapRegionGroup).replace("{regions}", group.members.length.toLocaleString(current.locale)).replace("{count}", count),
                  className: "map-pin-region-group", selected: false, regionCodes: ids.join(","),
                  onClick: () => { if (chooseRegions) latest.current.onRegions(ids); else zoomGroup(point, ids); } });
              }
            }
          } else {
            const clusters = filterMapClusters(stationCache(current.stations, actualZoom, 116, (station) => map.project([station.lat, station.lon], actualZoom)), viewport, 116);
            for (const cluster of clusters) {
              const point = map.unproject([cluster.x, cluster.y], actualZoom);
              const ids = cluster.members.map((station) => station.id);
              const selected = ids.includes(current.selectedId ?? "");
              if (cluster.members.length === 1) {
                const station = cluster.members[0];
                const brand = stationBrand(station);
                const price = current.priceViews.get(station.id) ?? UNKNOWN_PRICE;
                const priceText = priceDisplayText(price, current.locale);
                const label = `${copy.mapStationMarker.replace("{name}", station.name || copy.ffUnnamed)}${brand.text ? ` · ${brand.text}` : ""} · ${fuelDisplayName(current.selectedFuel, current.locale)}${priceText ? `: ${priceText}` : ""}`;
                specs.push({ key: `station:${station.id}`, dataKey: station.id, ids, lat: point.lat, lon: point.lng, text: "", label,
                  className: `map-pin-station${priceText ? "" : " no-price"}${selected ? " is-selected" : ""}`, selected,
                  station: { logo: brand.logo ?? "/brands/fuel-pump.svg", price: priceText, tone: price.tone },
                  onClick: () => latest.current.onStation(station) });
              } else {
                const count = cluster.members.length.toLocaleString(current.locale);
                const maxZoom = actualZoom >= map.getMaxZoom();
                const key = mapMemberKey("stations", ids);
                specs.push({ key, dataKey: key, ids, lat: point.lat, lon: point.lng, text: count,
                  label: (maxZoom ? copy.mapClusterMembers : copy.mapClusterZoom).replace("{count}", count),
                  className: `map-pin-cluster${selected ? " is-selected" : ""}`, selected,
                  onClick: () => { if (maxZoom) latest.current.onMembers(cluster.members); else zoomGroup(point, ids); } });
              }
            }
          }
          for (const spec of specs) {
            const activate = spec.onClick;
            spec.onClick = () => {
              const next = latest.current;
              // Draw waits for animation; stale visible markers must not select an old range.
              if (zoomQueue.pendingView || next.viewRevision !== current.viewRevision || next.overview !== current.overview || next.stations !== current.stations || next.manifest !== current.manifest) return;
              activate();
            };
          }
          pins.update(specs);
        }
        const zoomStart = () => zoomQueue.zoomStart();
        const zoomEnd = () => zoomQueue.zoomEnd();
        const schedule = () => scheduler.request();
        map.on("zoomstart", zoomStart);
        map.on("zoomend", zoomEnd);
        map.on("moveend", schedule);
        const container = surface.current;
        const wheel = (event: WheelEvent) => {
          // Leaflet's public normalization also handles ctrl-wheel trackpad gestures.
          L.DomEvent.stop(event);
          zoomQueue.wheel(L.DomEvent.getWheelDelta(event), { point: map.mouseEventToContainerPoint(event) });
        };
        container.addEventListener("wheel", wheel, { passive: false });
        const controls = zoomControl.getContainer()!;
        function updateZoomControls() {
          // Leaflet's native state follows completed zooms; our controls follow queued intent.
          const zoom = zoomQueue.targetZoom;
          for (const button of controls.querySelectorAll<HTMLAnchorElement>(".leaflet-control-zoom-in, .leaflet-control-zoom-out")) {
            const disabled = button.classList.contains("leaflet-control-zoom-in") ? zoom >= map.getMaxZoom() : zoom <= map.getMinZoom();
            button.classList.toggle("leaflet-disabled", disabled);
            button.setAttribute("aria-disabled", String(disabled));
          }
        }
        const controlClick = (event: MouseEvent) => {
          const button = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".leaflet-control-zoom-in, .leaflet-control-zoom-out") : null;
          if (!button) return;
          event.preventDefault(); event.stopImmediatePropagation();
          // The queue clamps against its effective target, including immediate reversals at a limit.
          zoomQueue.increment((button.classList.contains("leaflet-control-zoom-in") ? 1 : -1) * (map.options.zoomDelta ?? 1) * (event.shiftKey ? 3 : 1));
          // Retain keyboard focus on the native zoom link, like Leaflet's control.
          if (event.detail > 0) container.focus({ preventScroll: true });
        };
        controls.addEventListener("click", controlClick, true);
        observer = new ResizeObserver(() => { resizePending = true; scheduler.request(); });
        observer.observe(container);
        disposeRuntime = () => {
          scheduler.dispose(); zoomQueue.dispose(); pins.dispose();
          container.removeEventListener("wheel", wheel);
          controls.removeEventListener("click", controlClick, true);
          map.off("zoomstart", zoomStart); map.off("zoomend", zoomEnd); map.off("moveend", schedule);
        };
        scheduler.request();
        setReady(true);
      } catch {
        if (!cancelled) { setFailed(true); disposeRuntime?.(); observer?.disconnect(); ownedMap?.remove(); ownedMap = undefined; runtime.current = null; }
      }
    }
    void initialize();
    return () => {
      cancelled = true;
      controller.abort();
      disposeRuntime?.();
      observer?.disconnect();
      ownedMap?.remove();
      runtime.current = null;
    };
  }, [attempt]);

  useEffect(() => { runtime.current?.draw(); }, [ready, props.stations, props.manifest, props.overview, props.selectedId, props.locale, props.selectedFuel, props.priceViews]);
  useEffect(() => {
    const state = runtime.current;
    if (!ready || !state) return;
    state.replaceView(() => {
      if (props.overview) state.map.fitBounds(japanBounds, { padding: [24, 24], animate: false });
      else if (props.stations.length) state.map.fitBounds(state.L.latLngBounds(props.stations.map((station) => [station.lat, station.lon])), { paddingTopLeft: [60, 102], paddingBottomRight: [60, 24], maxZoom: 15, animate: false });
    });
  }, [ready, props.viewRevision, props.overview, props.stations]);
  useEffect(() => {
    const state = runtime.current;
    const station = props.stations.find((item) => item.id === props.selectedId);
    if (ready && state && station) {
      // A list-to-detail transition makes the previously hidden map visible.
      // Center the droplet body while its bottom tip stays on the real coordinate.
      state.replaceView(() => {
        const zoom = Math.max(16, state.map.getZoom());
        const center = state.map.project([station.lat, station.lon], zoom).subtract([0, 47]);
        state.map.setView(state.map.unproject(center, zoom), zoom, { animate: false });
      });
    }
  }, [ready, props.selectedId, props.stations]);

  return <div className="fuel-map">
    <div ref={surface} className="map-surface" role="region" aria-label={t.mapCanvas} aria-describedby="map-keyboard-help" tabIndex={0} />
    <span className="sr-only" id="map-keyboard-help">{t.mapKeyboardHelp}</span>
    {!ready && !failed && <div className="map-message" role="status">{t.mapLoading}</div>}
    {(failed || tileFailed) && <div className="map-message map-error" role="status"><p>{failed ? t.mapUnavailable : t.mapTileError}</p><button type="button" className="button" onClick={() => {
      if (failed) { setFailed(false); setReady(false); setAttempt((value) => value + 1); }
      else {
        setTileFailed(false);
        const state = runtime.current;
        // Re-adding rounds the tile zoom; Leaflet redraw() uses fractional map zooms in XYZ URLs.
        if (state) { state.tiles.remove(); state.tiles.addTo(state.map); }
      }
    }}>{t.mapRetry}</button></div>}
    <div className="map-attribution"><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t.ffAttribution}</a></div>
  </div>;
});
