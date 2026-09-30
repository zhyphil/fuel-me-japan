import { useEffect, useMemo, useRef, useState } from "react";
import { japaneseLabels, messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { formatOpeningHours } from "../lib/opening-hours";
import { fuelTypes, isPriceStale, navigationUrl, prefecturalPrices, prefectureName, prefectures } from "../lib/find-fuel";
import { isJapanCoordinates, loadDataManifest, loadNearbyStations, loadOfficialPrices, loadPrefectureStations, type Coordinates, type DataManifest, type FuelType, type PrefectureCode, type PriceFile, type Station, type TriState } from "../lib/stations";
import { FuelMap, type FuelMapHandle } from "./FuelMap";
import { DEFAULT_FUEL, isFuelType, readFuelPreference, resetFuelPreference, saveFuelPreference } from "../lib/fuel-preference";
import { stationPriceViews, STATION_QUOTES, UNKNOWN_PRICE, type StationPriceView } from "../lib/station-price-view";
import { FuelPrice, fuelDisplayName } from "./FuelPrice";
import { Icon } from "./Icon";
import { FilterTrigger, StationFilters } from "./StationFilters";
import { activeFilterCount, applyStationFilters, emptyStationFilters, sameStationFilters, type StationFilterState } from "../lib/station-filters";

type Result = Station & { distanceKm?: number };
type Search = { kind: "nearby"; position: Coordinates } | { kind: "manual"; code: PrefectureCode };
type Status = "idle" | "overviewLoading" | "overviewError" | "location" | "loading" | "ready" | "denied" | "unavailable" | "timeout" | "outside" | "error";
const statusKeys = { idle: "mapOverviewHelp", overviewLoading: "mapOverviewLoading", overviewError: "mapOverviewError", location: "ffLocating", loading: "ffLoading", denied: "ffDenied", unavailable: "ffUnavailable", timeout: "ffTimeout", outside: "ffOutside", error: "ffLoadError" } as const;
const fuelKeys = { REGULAR: "ffRegular", HIGH_OCTANE: "ffHighOctane", DIESEL: "ffDiesel" } as const;
const fuelJapanese = { REGULAR: japaneseLabels.regular, HIGH_OCTANE: japaneseLabels.highOctane, DIESEL: japaneseLabels.diesel };
const fuelFields = { REGULAR: "fuelRegular", HIGH_OCTANE: "fuelHighOctane", DIESEL: "fuelDiesel" } as const;

export function FindFuel({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const [selectedFuel, setSelectedFuel] = useState<FuelType>(DEFAULT_FUEL);
  useEffect(() => { setSelectedFuel(readFuelPreference()); }, []);
  const [status, setStatus] = useState<Status>("overviewLoading");
  const [prefecture, setPrefecture] = useState<PrefectureCode | "">("");
  const [scope, setScope] = useState<"overview" | "prefecture" | "nearby">("overview");
  const [results, setResults] = useState<Result[]>([]);
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<StationFilterState>(emptyStationFilters);
  const [filterTrigger, setFilterTrigger] = useState<HTMLButtonElement | null>(null);
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Result | null>(null);
  const [members, setMembers] = useState<Station[] | null>(null);
  const [regionOptions, setRegionOptions] = useState<PrefectureCode[] | null>(null);
  const [view, setView] = useState<"map" | "list">("map");
  const [viewRevision, setViewRevision] = useState(0);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const locationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSearch = useRef<Search | null>(null);
  const map = useRef<FuelMapHandle>(null);
  const detailPanel = useRef<HTMLElement>(null);
  useEffect(() => { if (detailPanel.current) detailPanel.current.scrollTop = 0; }, [selected?.id]);
  const regionSelect = useRef<HTMLSelectElement>(null);
  const origin = useRef<{ kind: "map" | "list" | "members"; id: string } | null>(null);
  useEffect(() => {
    void loadOverview(invalidate());
    return () => {
      epoch.current += 1;
      controller.current?.abort();
      clearTimeout(locationTimer.current);
      lastSearch.current = null;
    };
  }, []);

  function invalidate() {
    epoch.current += 1;
    controller.current?.abort();
    clearTimeout(locationTimer.current);
    controller.current = new AbortController();
    return { id: epoch.current, signal: controller.current.signal };
  }
  function resetFilters() { setFilters(emptyStationFilters()); setFilterTrigger(null); }
  function applyFilters(next: StationFilterState) {
    setFilterTrigger(null);
    setSelected(null); setMembers(null); origin.current = null; setLimit(25);
    if (!sameStationFilters(filters, next)) setFilters(next);
  }
  function resetResults() {
    setResults([]); setSelected(null); setMembers(null); setRegionOptions(null); setQuery(""); setLimit(25); origin.current = null;
  }
  async function loadOverview(token: ReturnType<typeof invalidate>) {
    setStatus("overviewLoading");
    try {
      const data = await loadDataManifest(token.signal);
      if (token.id !== epoch.current || token.signal.aborted) return;
      setManifest(data); setStatus("idle");
    } catch {
      if (token.id === epoch.current && !token.signal.aborted) setStatus("overviewError");
    }
  }
  function goOverview() {
    const token = invalidate();
    resetFilters(); resetResults(); lastSearch.current = null;
    setPrefecture(""); setScope("overview"); setView("map"); setViewRevision((value) => value + 1);
    if (manifest) setStatus("idle");
    else void loadOverview(token);
  }
  function cancelRequest() {
    invalidate(); resetFilters(); resetResults(); lastSearch.current = null;
    setPrefecture(""); setScope("overview"); setView("map"); setViewRevision((value) => value + 1);
    setStatus(manifest ? "idle" : "overviewError");
  }
  async function search(request: Search, token: ReturnType<typeof invalidate>) {
    lastSearch.current = request;
    setStatus("loading");
    try {
      const data = manifest ?? await loadDataManifest(token.signal);
      const stations = request.kind === "nearby"
        ? await loadNearbyStations(data, request.position, token.signal)
        : await loadPrefectureStations(data, request.code, token.signal);
      if (token.id !== epoch.current || token.signal.aborted) return;
      setManifest(data); setResults(stations); setStatus("ready"); setViewRevision((value) => value + 1);
    } catch {
      if (token.id === epoch.current && !token.signal.aborted) setStatus("error");
    }
  }
  function choosePrefecture(value: string) {
    const code = prefectures.find((p) => p.code === value)?.code;
    if (!code) { goOverview(); return; }
    const token = invalidate();
    resetFilters(); resetResults(); lastSearch.current = null;
    setPrefecture(code); setScope("prefecture");
    analytics.track("find_fuel_click", { locale });
    void search({ kind: "manual", code }, token);
  }
  function useLocation() {
    const token = invalidate();
    resetFilters(); resetResults(); setPrefecture(""); setScope("nearby"); lastSearch.current = null;
    analytics.track("location_requested", { locale });
    if (!navigator.geolocation) { setStatus("unavailable"); return; }
    setStatus("location");
    let settled = false;
    const finish = () => {
      if (settled || token.id !== epoch.current || token.signal.aborted) return false;
      settled = true; clearTimeout(locationTimer.current); return true;
    };
    locationTimer.current = setTimeout(() => { if (finish()) setStatus("timeout"); }, 12_000);
    try {
      navigator.geolocation.getCurrentPosition((position) => {
        if (!finish()) return;
        analytics.track("location_allowed", { locale });
        const point = { lat: position.coords.latitude, lon: position.coords.longitude };
        if (!isJapanCoordinates(point)) { setStatus("outside"); return; }
        void search({ kind: "nearby", position: point }, token);
      }, (error) => {
        if (!finish()) return;
        if (error.code === 1) analytics.track("location_denied", { locale });
        setStatus(error.code === 1 ? "denied" : error.code === 3 ? "timeout" : "unavailable");
      }, { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 });
    } catch {
      if (finish()) setStatus("unavailable");
    }
  }
  function retry() {
    const request = lastSearch.current;
    const token = invalidate(); resetResults();
    if (request) void search(request, token);
    else void loadOverview(token);
  }
  function openStation(station: Station, kind: "map" | "list" | "members") {
    origin.current = { kind, id: station.id };
    setView("map");
    if (kind !== "members") setMembers(null);
    setSelected(results.find((result) => result.id === station.id) ?? station);
    analytics.track("station_view", { locale });
  }
  function closeDetail() {
    const trigger = origin.current;
    setSelected(null);
    if (trigger?.kind === "list") setView("list");
    requestAnimationFrame(() => {
      if (!trigger || trigger.kind === "map") map.current?.focusStation(trigger?.id ?? "");
      else document.getElementById(`${trigger.kind}-${trigger.id}`)?.focus();
    });
  }
  function closeMembers() {
    const id = members?.[0]?.id;
    setMembers(null);
    requestAnimationFrame(() => map.current?.focusStation(id ?? ""));
  }
  const priceViews = useMemo(() => stationPriceViews(results, STATION_QUOTES, selectedFuel, Date.now()), [results, selectedFuel]);
  const filtered = useMemo(() => applyStationFilters(results, query, filters), [results, query, filters]);
  const appliedCount = activeFilterCount(filters);
  const busy = status === "location" || status === "loading" || status === "overviewLoading";
  const drawer = Boolean(selected || members);
  const overview = scope === "overview";
  const range = overview ? t.mapOverviewScope : scope === "nearby" ? t.mapNearbyScope : prefectureName(prefecture as PrefectureCode) ?? t.ffUnknown;
  const filterButton = <FilterTrigger locale={locale} count={appliedCount} disabled={status !== "ready" || overview} onOpen={setFilterTrigger} />;
  const locationButton = <button type="button" className="button location-button" aria-label={t.ffUseLocation} title={status === "location" ? t.ffLocating : t.ffUseLocation} aria-busy={status === "location"} onClick={useLocation}><Icon name="locate" /></button>;
  return <section className="fuel-home" id="find-fuel" aria-labelledby="find-title">
    <div className="map-heading"><h1 id="find-title">{t.mapTitle}</h1><button type="button" className="button button-quiet" onClick={goOverview}>{t.mapOverview}</button></div>
    <div className="map-toolbar">
      <div className="region-field"><label htmlFor="prefecture">{t.mapRegion}</label><select id="prefecture" ref={regionSelect} value={prefecture} onChange={(event) => choosePrefecture(event.target.value)}><option value="">{t.ffChoosePrefecture}</option>{prefectures.map((p) => <option key={p.code} value={p.code} lang="ja">{p.name}</option>)}</select></div>
      <div className="fuel-field"><label htmlFor="display-fuel">{t.fpFuel}</label><select id="display-fuel" value={selectedFuel} onChange={(event) => { const fuel = event.target.value; if (isFuelType(fuel)) { setSelectedFuel(fuel); saveFuelPreference(fuel); } }}>{fuelTypes.map((fuel) => <option key={fuel} value={fuel}>{fuelDisplayName(fuel, locale)}</option>)}</select></div>
      <div className="map-view-switch" role="group" aria-label={t.mapViewLabel}>{(["map", "list"] as const).map((mode) => <button key={mode} type="button" className="button" aria-pressed={view === mode} onClick={() => { setSelected(null); setMembers(null); setRegionOptions(null); setView(mode); }}>{t[mode === "map" ? "mapView" : "mapList"]}</button>)}</div>
      {status === "ready" && <div className="map-search"><label htmlFor="station-search">{t.mapFilter}</label><input id="station-search" type="search" value={query} maxLength={120} placeholder={t.ffFilterPlaceholder} onChange={(event) => { setQuery(event.target.value); setLimit(25); setSelected(null); setMembers(null); }} /></div>}
    </div>
    <div className="map-range"><p><span>{t.mapScope}</span> <strong lang={scope === "prefecture" ? "ja" : undefined}>{range}</strong></p><button type="button" className="text-button" onClick={() => regionSelect.current?.focus()}>{t.mapChangeRegion}</button>{!overview && <span className="map-range-note">{t.mapBrowseLoaded}</span>}</div>
    <div className={`map-status${status === "error" || status === "overviewError" ? " search-error" : ""}`}>
      <p role="status" aria-live="polite" aria-atomic="true">{status === "ready" ? <>{t.mapResultCount.replace("{count}", filtered.length.toLocaleString(locale))}</> : overview && status === "idle" && manifest ? t.mapOverviewCount.replace("{count}", manifest.stations.count.toLocaleString(locale)) : t[statusKeys[status as Exclude<Status, "ready">]]}</p>
      {appliedCount > 0 && <button type="button" className="text-button" onClick={() => applyFilters(emptyStationFilters())}>{t.sfClear}</button>}
      {query && <button type="button" className="text-button" onClick={() => { setQuery(""); setLimit(25); setSelected(null); setMembers(null); origin.current = null; }}>{t.sfClearSearch}</button>}
      {busy && <button type="button" className="text-button" onClick={cancelRequest}>{t.ffCancel}</button>}
      {(status === "error" || status === "overviewError") && <button type="button" className="text-button" onClick={retry}>{t.ffRetry}</button>}
    </div>
    <div className={`map-workspace${drawer ? " has-drawer" : ""}${view === "list" && !drawer ? " show-list" : ""}`}>
      <div className="map-stage"><FuelMap ref={map} locale={locale} manifest={manifest} stations={filtered} selectedFuel={selectedFuel} priceViews={priceViews} overview={overview} viewRevision={viewRevision} selectedId={selected?.id} onPrefecture={choosePrefecture} onRegions={(codes) => { setRegionOptions(codes); setView("list"); }} onStation={(station) => openStation(station, "map")} onMembers={(stations) => { setSelected(null); setMembers(stations); }} />{locationButton}{filterButton}</div>
      {view === "list" && !drawer && <div className="map-list-panel">
        {locationButton}{filterButton}
        {overview ? <><h2>{t.mapRegionList}</h2><p className="field-help">{t.mapOverviewHelp}</p><ul className="region-list">{manifest?.stations.partitions.filter((partition) => partition.code !== "UNKNOWN" && (!regionOptions || regionOptions.includes(partition.code))).map((partition) => <li key={partition.code}><button type="button" className="station-card" onClick={() => choosePrefecture(partition.code)}><strong lang="ja">{prefectureName(partition.code)}</strong><span>{t.mapRecordCount.replace("{count}", partition.count.toLocaleString(locale))}</span></button></li>)}</ul></> : <>
          <h2>{t.ffStationList}</h2><p className="field-help">{scope === "nearby" ? t.ffStraightLineHelp : t.ffNoDistance}</p>
          {status === "ready" && !filtered.length && <div className="map-empty map-empty-list" role="status">{t.ffNoResults}</div>}
          <ul className="station-list" aria-label={t.ffStationList}>{filtered.slice(0, limit).map((station) => <li key={station.id}><StationCard station={station} locale={locale} fuel={selectedFuel} priceView={priceViews.get(station.id) ?? UNKNOWN_PRICE} id={`list-${station.id}`} onClick={() => openStation(station, "list")} /></li>)}</ul>
          {filtered.length > limit && <button type="button" className="button" onClick={() => setLimit((count) => count + 25)}>{t.ffShowMore}</button>}
        </>}
      </div>}
      {drawer && <aside ref={detailPanel} className="map-detail-panel" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); if (selected) closeDetail(); else closeMembers(); } }}>
        {selected && manifest ? <StationDetail key={selected.id} station={selected} fuel={selectedFuel} priceView={priceViews.get(selected.id) ?? UNKNOWN_PRICE} manifest={manifest} locale={locale} onBack={closeDetail} /> : members && <ClusterMembers fuel={selectedFuel} priceViews={priceViews} stations={members} locale={locale} onClose={closeMembers} onStation={(station) => openStation(station, "members")} />}
      </aside>}
      {view === "map" && status === "ready" && !filtered.length && <div className="map-empty" role="status">{t.ffNoResults}</div>}
    </div>
    {filterTrigger && <StationFilters locale={locale} stations={results} query={query} applied={filters} trigger={filterTrigger} onClose={() => setFilterTrigger(null)} onApply={applyFilters} />}
    <details className="map-notes"><summary>{t.mapAbout}</summary>
      <p>{t.fpHelp}</p><p>{t.fpStorage}</p><button type="button" className="button button-quiet" onClick={() => { resetFuelPreference(); setSelectedFuel(DEFAULT_FUEL); }}>{t.fpReset}</button><p>{t.fpComparison.replace("{count}", String([...priceViews.values()].filter((view) => view.tone !== "unknown").length))}</p>
      <p>{t.mapOverviewHelp}</p><p>{t.ffFilterHelp}</p><p>{scope === "nearby" ? t.ffStraightLineHelp : t.ffNoDistance}</p>
      <p>{t.ffLocationPrivacy}</p><p>{t.mapPrivacy}</p><p>{t.ffCoverage}</p><p>{t.sourcesBody}</p>
      <p><a href="/brands/sources.json">{t.fpBrands}</a> · <a href="/runtime-map-provider.json">{t.mapProvider}</a> · <a href="/data/source-registry.json">{t.registry}</a></p>
      <div className="find-attribution"><p><a href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">{t.ffOdbl}</a></p>
        <details><summary>{t.ffDownloads}</summary><p><a href="/data/manifest.json">{t.ffManifest}</a> · <a href="/data/OSM-NOTICE.txt">{t.ffDataLicense}</a></p>{manifest && <><p>{t.ffSnapshot} <time dateTime={manifest.stations.sourceUpdatedAt}>{manifest.stations.sourceUpdatedAt}</time></p><ul className="download-list">{manifest.stations.partitions.map((p) => <li key={p.code}><a href={p.path} download>{prefectureName(p.code) || t.ffUnknown}</a></li>)}</ul></>}</details>
      </div>
    </details>
  </section>;
}

function StationCard({ station, locale, fuel, priceView, id, onClick }: { fuel: FuelType; priceView: StationPriceView; station: Result; locale: Locale; id: string; onClick: () => void }) {
  const t = messages[locale];
  return <button type="button" id={id} className="station-card" onClick={onClick}>
    <span className="station-card-top"><strong lang={station.name ? "ja" : undefined}>{station.name || t.ffUnnamed}</strong><span aria-hidden="true">↗</span></span>
    <span className="station-meta">{station.originalBrand || t.ffUnknown} · {prefectureName(station.prefectureCode) || t.ffUnknown}</span>
    <span className="station-meta" lang={station.address || station.city ? "ja" : undefined}>{station.address || station.city || t.ffAddressUnknown}</span>
    {station.distanceKm !== undefined && <span className="distance">{t.ffStraightLine} · {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</span>}
    <FuelPrice view={priceView} fuel={fuel} locale={locale} />
    <span className="station-service">{t[station.serviceType === "SELF" ? "ffSelf" : station.serviceType === "FULL" ? "ffFull" : "ffServiceUnknown"]}</span>
  </button>;
}
function ClusterMembers({ stations, locale, fuel, priceViews, onClose, onStation }: { fuel: FuelType; priceViews: ReadonlyMap<string, StationPriceView>; stations: Station[]; locale: Locale; onClose: () => void; onStation: (station: Station) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const t = messages[locale];
  return <section className="cluster-members" aria-labelledby="members-title"><button type="button" className="button button-quiet" onClick={onClose}>{t.mapCloseMembers}</button><h2 id="members-title" ref={heading} tabIndex={-1}>{t.mapMembersTitle.replace("{count}", stations.length.toLocaleString(locale))}</h2><ul className="station-list">{stations.map((station) => <li key={station.id}><StationCard station={station} locale={locale} fuel={fuel} priceView={priceViews.get(station.id) ?? UNKNOWN_PRICE} id={`members-${station.id}`} onClick={() => onStation(station)} /></li>)}</ul></section>;
}

function FuelLabel({ fuel, locale }: { fuel: FuelType; locale: Locale }) {
  return <>{messages[locale][fuelKeys[fuel]]} <span lang="ja" className="japanese-label">{fuelJapanese[fuel]}</span></>;
}
function StationDetail({ station, manifest, locale, fuel, priceView, onBack }: { fuel: FuelType; priceView: StationPriceView; station: Result; manifest: DataManifest; locale: Locale; onBack: () => void }) {
  const t = messages[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const tri = (value: TriState) => t[value === "YES" ? "ffYes" : value === "NO" ? "ffNo" : "ffUnknown"];
  return <article className="station-detail" aria-labelledby="station-title">
    <button className="button button-quiet detail-close" type="button" onClick={onBack}>{t.mapCloseDetail}</button>
    <h3 id="station-title" tabIndex={-1} ref={heading} lang={station.name ? "ja" : undefined}>{station.name || t.ffUnnamed}</h3>
    <p>{station.originalBrand || t.ffUnknown}</p>
    {station.distanceKm !== undefined && <p className="distance">{t.ffStraightLine} · {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</p>}
    <dl className="station-facts">
      <div><dt>{t.ffAddress}</dt><dd lang={station.address ? "ja" : undefined}>{station.address || t.ffUnknown}</dd></div>
      <div><dt>{t.ffPrefectureLabel}</dt><dd lang={station.prefectureCode !== "UNKNOWN" ? "ja" : undefined}>{prefectureName(station.prefectureCode) || t.ffUnknown}</dd></div>
      <div className="hours-fact"><dt>{t.ffHours}</dt><dd><OpeningHours value={station.openingHours} locale={locale} /></dd></div>
      <div><dt>{t.ffService}</dt><dd>{t[station.serviceType === "SELF" ? "ffSelf" : station.serviceType === "FULL" ? "ffFull" : "ffUnknown"]}</dd></div>
    </dl>
    <p className="field-help">{t.ffHoursHelp}</p>
    <div className="fuel-reminder"><h4>{t.ffFuelReminderTitle}</h4><p>{t.ffFuelReminder}</p></div>
    <h4>{t.ffFuelAvailability}</h4>
    <dl className="station-facts">{fuelTypes.map((fuel) => <div key={fuel}><dt><FuelLabel fuel={fuel} locale={locale} /></dt><dd>{tri(station[fuelFields[fuel]])}</dd></div>)}</dl>
    <h4>{t.ffPayment}</h4><dl className="station-facts"><div><dt>{t.ffVisa}</dt><dd>{tri(station.paymentVisa)}</dd></div><div><dt>{t.ffMastercard}</dt><dd>{tri(station.paymentMastercard)}</dd></div></dl>
    <p className="field-help">{t.ffPaymentHelp}</p>
    {priceView.status === "valid" && priceView.quote && <section className="selected-fuel-price"><h4>{t.fpTitle}</h4><p><FuelLabel fuel={fuel} locale={locale} /></p><FuelPrice view={priceView} fuel={fuel} locale={locale} /><p><a href={priceView.quote.sourceUrl} target="_blank" rel="noopener noreferrer">{t.fpSource}</a></p><p>{t.fpObserved} <time dateTime={priceView.quote.observedAt}>{priceView.quote.observedAt}</time><br />{t.fpValidUntil} <time dateTime={priceView.quote.validUntil}>{priceView.quote.validUntil}</time></p><p>{t.fpComparison.replace("{count}", String(priceView.comparableCount))}</p></section>}
    <OfficialPrice key={station.prefectureCode} code={station.prefectureCode} manifest={manifest} locale={locale} />
    <h4>{t.ffNavigate}</h4><p className="field-help">{t.ffNavigationHelp}</p>
    <div className="link-buttons">{(["google", "apple"] as const).map((provider) => <a key={provider} className={`button${provider === "google" ? " button-primary" : ""}`} href={navigationUrl(provider, station)} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track("navigate_click", { locale })}>{t[provider === "google" ? "ffGoogle" : "ffApple"]}</a>)}</div>
    <p className="field-help">{t.ffStationUpdated} <time dateTime={station.sourceUpdatedAt}>{station.sourceUpdatedAt}</time></p>
  </article>;
}

function OpeningHours({ value, locale }: { value: string | undefined; locale: Locale }) {
  const t = messages[locale];
  const hours = formatOpeningHours(value, locale);
  if (hours.kind === "unknown") return <>{t.ffUnknown}</>;
  if (hours.kind === "raw") return <><p className="field-help">{t.ffHoursUntranslated}</p><code className="hours-raw">{value}</code></>;
  return <><ul className="hours-lines">{hours.lines.map((line, index) => <li key={index}>{line}</li>)}</ul><details className="hours-original"><summary>{t.ffHoursOriginal}</summary><code className="hours-raw">{value}</code></details></>;
}

function OfficialPrice({ code, manifest, locale }: { code: Station["prefectureCode"]; manifest: DataManifest; locale: Locale }) {
  const t = messages[locale];
  const [data, setData] = useState<PriceFile | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (code === "UNKNOWN") return;
    const controller = new AbortController();
    let active = true;
    void loadOfficialPrices(manifest, controller.signal).then((result) => { if (active) { setData(result); setStatus("ready"); } }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; controller.abort(); };
  }, [code, manifest, attempt]);
  const rows = prefecturalPrices(data, code);
  const available = code !== "UNKNOWN" && status === "ready" && rows.every((row) => row.record);
  return <section className="official-price" aria-labelledby="price-title">
    <p className="eyebrow">{t.ffOfficial}</p><h4 id="price-title">{t.ffPriceTitle}</h4><p>{prefectureName(code) || t.ffUnknown}</p><p>{t.ffPriceScope}</p>
    <p className="field-help">{t.ffPriceUnit}</p>
    <dl className="station-facts">{rows.map(({ fuelType, record }) => <div key={fuelType}><dt><FuelLabel fuel={fuelType} locale={locale} /></dt><dd>{available && record ? `${record.priceJpy.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} ${t.ffJpyL}` : t.ffPriceUnavailable}</dd></div>)}</dl>
    {status === "loading" && code !== "UNKNOWN" && <p role="status">{t.ffPriceLoading}</p>}
    {status === "error" && <><p role="status">{t.ffPriceError}</p><button type="button" className="button" onClick={() => { setStatus("loading"); setData(null); setAttempt((value) => value + 1); }}>{t.ffRetry}</button></>}
    {available && data && <><p>{t.ffSurveyDate} <time dateTime={data.surveyDate}>{data.surveyDate}</time><br />{t.ffPublishedDate} <time dateTime={data.publishedAt}>{data.publishedAt}</time></p>{isPriceStale(data.surveyDate) && <p className="notice-box">{t.ffStalePrice}</p>}<p><a href={data.sourceUrl} target="_blank" rel="noopener noreferrer">{t.ffOfficialSource}</a></p><p className="field-help">{t.ffProcessed}</p></>}
  </section>;
}
