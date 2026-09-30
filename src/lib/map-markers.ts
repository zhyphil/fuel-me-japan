import type * as Leaflet from "leaflet";

export interface MapMarkerSpec {
  key: string;
  dataKey: string;
  ids: string[];
  lat: number;
  lon: number;
  label: string;
  className: string;
  text: string;
  selected: boolean;
  station?: { logo: string; price: string; tone: string };
  place?: string;
  regionCodes?: string;
  onClick: () => void;
}
interface Entry {
  spec: MapMarkerSpec;
  marker: Leaflet.Marker;
  button: HTMLButtonElement;
  symbol: HTMLSpanElement;
  image?: HTMLImageElement;
  price?: HTMLSpanElement;
  place?: HTMLSpanElement;
}
const fallbackLogo = "/brands/fuel-pump.svg";

/** Diff by complete membership, retaining Leaflet and native DOM identities. */
export function createMapMarkers(L: typeof Leaflet, layer: Leaflet.LayerGroup, surface: HTMLElement) {
  const entries = new Map<string, Entry>();
  const focusTargets = new Map<string, HTMLButtonElement>();
  let pendingFocus: { ids: string[]; source: Element | null } | undefined;
  function focusAllowed(source: Element | null) {
    return document.activeElement === source || (!source?.isConnected && document.activeElement === document.body);
  }
  return {
    focus(ids: string[]) {
      pendingFocus = { ids, source: document.activeElement };
    },
    update(specs: MapMarkerSpec[]) {
      const active = [...entries.values()].find((entry) => entry.button === document.activeElement);
      const retained = new Set<string>();
      focusTargets.clear();
      for (const spec of specs) {
        retained.add(spec.key);
        let entry = entries.get(spec.key);
        const previous = entry?.spec;
        if (!entry) {
          const button = document.createElement("button");
          button.type = "button"; button.dataset.mapKey = spec.dataKey;
          const symbol = document.createElement("span"); symbol.setAttribute("aria-hidden", "true"); button.append(symbol);
          const station = Boolean(spec.station);
          const marker = L.marker([spec.lat, spec.lon], { keyboard: false, interactive: false, icon: L.divIcon({ className: "fuel-marker", html: button, iconSize: station ? [96, 94] : [48, 48], iconAnchor: station ? [48, 94] : [24, 24] }) });
          entry = { spec, marker, button, symbol };
          const live = entry;
          button.addEventListener("click", (event) => { event.stopPropagation(); live.spec.onClick(); });
          L.DomEvent.disableClickPropagation(button);
          if (station) {
            symbol.className = "map-brand";
            const image = document.createElement("img"); image.alt = ""; image.width = 38; image.height = 38;
            image.addEventListener("error", () => { if (image.getAttribute("src") !== fallbackLogo) image.src = fallbackLogo; });
            symbol.append(image); entry.image = image;
            const shape = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            shape.setAttribute("viewBox", "0 0 76 94"); shape.setAttribute("class", "map-pin-shape"); shape.setAttribute("aria-hidden", "true"); shape.setAttribute("focusable", "false");
            const outline = document.createElementNS("http://www.w3.org/2000/svg", "path");
            outline.setAttribute("d", "M38 92C32 84 3 61 3 38C3 18.7 18.7 3 38 3S73 18.7 73 38C73 61 44 84 38 92Z");
            const ring = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            ring.setAttribute("cx", "38"); ring.setAttribute("cy", "38"); ring.setAttribute("r", "28");
            shape.append(outline, ring); button.append(shape);
          }
          entries.set(spec.key, entry);
          marker.addTo(layer);
        }
        const { button, symbol, marker } = entry;
        entry.spec = spec;
        if (previous?.className !== spec.className) button.className = `map-pin ${spec.className}`;
        if (previous?.label !== spec.label) { button.setAttribute("aria-label", spec.label); button.title = spec.label; }
        if (previous?.selected !== spec.selected) {
          if (spec.selected) button.setAttribute("aria-pressed", "true"); else button.removeAttribute("aria-pressed");
          marker.setZIndexOffset(spec.selected ? 1000 : 0);
        }
        if (previous && (previous.lat !== spec.lat || previous.lon !== spec.lon)) marker.setLatLng([spec.lat, spec.lon]);
        if (!spec.station && previous?.text !== spec.text) symbol.textContent = spec.text;
        if (entry.image && previous?.station?.logo !== spec.station?.logo) entry.image.src = spec.station!.logo;
        if (spec.station?.price) {
          if (!entry.price) { entry.price = document.createElement("span"); entry.price.setAttribute("aria-hidden", "true"); button.append(entry.price); }
          if (previous?.station?.price !== spec.station.price) entry.price.textContent = spec.station.price;
          if (previous?.station?.tone !== spec.station.tone || !previous?.station?.price) entry.price.className = `station-price price-${spec.station.tone}`;
        } else if (entry.price) { entry.price.remove(); entry.price = undefined; }
        if (spec.place) {
          if (!entry.place) { entry.place = document.createElement("span"); entry.place.className = "map-pin-place"; entry.place.lang = "ja"; entry.place.setAttribute("aria-hidden", "true"); button.append(entry.place); }
          if (previous?.place !== spec.place) entry.place.textContent = spec.place;
        } else if (entry.place) { entry.place.remove(); entry.place = undefined; }
        if (previous?.regionCodes !== spec.regionCodes) {
          if (spec.regionCodes) button.dataset.regionCodes = spec.regionCodes; else delete button.dataset.regionCodes;
        }
        for (const id of spec.ids) focusTargets.set(id, button);
      }
      for (const [key, entry] of entries) if (!retained.has(key)) { layer.removeLayer(entry.marker); entries.delete(key); }
      const request = pendingFocus ?? (active && !retained.has(active.spec.key) ? { ids: active.spec.ids, source: active.button } : undefined);
      pendingFocus = undefined;
      if (request && focusAllowed(request.source)) {
        const target = request.ids.map((id) => focusTargets.get(id)).find(Boolean) ?? surface;
        if (document.activeElement !== target) target.focus({ preventScroll: true });
      }
    },
    dispose() { pendingFocus = undefined; entries.clear(); focusTargets.clear(); },
  };
}
