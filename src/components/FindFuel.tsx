import { useEffect, useRef, useState } from "react";
import { japaneseLabels, messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { filterStations, fuelTypes, isPriceStale, mapSearchUrl, navigationUrl, prefecturalPrices, prefectureName, prefectures } from "../lib/find-fuel";
import { isJapanCoordinates, loadDataManifest, loadNearbyStations, loadOfficialPrices, loadPrefectureStations, type Coordinates, type DataManifest, type FuelType, type PrefectureCode, type PriceFile, type Station, type TriState } from "../lib/stations";

type Result = Station & { distanceKm?: number };
type Search = { kind: "nearby"; position: Coordinates } | { kind: "manual"; code: PrefectureCode };
type Status = "idle" | "location" | "loading" | "ready" | "denied" | "unavailable" | "timeout" | "outside" | "error";
const statusKeys = { idle: "ffStart", location: "ffLocating", loading: "ffLoading", denied: "ffDenied", unavailable: "ffUnavailable", timeout: "ffTimeout", outside: "ffOutside", error: "ffLoadError" } as const;
const fuelKeys = { REGULAR: "ffRegular", HIGH_OCTANE: "ffHighOctane", DIESEL: "ffDiesel" } as const;
const fuelJapanese = { REGULAR: japaneseLabels.regular, HIGH_OCTANE: japaneseLabels.highOctane, DIESEL: japaneseLabels.diesel };
const fuelFields = { REGULAR: "fuelRegular", HIGH_OCTANE: "fuelHighOctane", DIESEL: "fuelDiesel" } as const;

export function FindFuel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const t = messages[locale];
  const [status, setStatus] = useState<Status>("idle");
  const [prefecture, setPrefecture] = useState<PrefectureCode | "">("");
  const [results, setResults] = useState<Result[]>([]);
  const [manifest, setManifest] = useState<DataManifest | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [selected, setSelected] = useState<Result | null>(null);
  const [nearby, setNearby] = useState(false);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const locationTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSearch = useRef<Search | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
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
  function resetResults() {
    setResults([]); setSelected(null); setQuery(""); setLimit(25); setNearby(false);
  }
  async function search(request: Search, token: ReturnType<typeof invalidate>) {
    lastSearch.current = request;
    setStatus("loading");
    try {
      const data = await loadDataManifest(token.signal);
      const stations = request.kind === "nearby"
        ? await loadNearbyStations(data, request.position, token.signal)
        : await loadPrefectureStations(data, request.code, token.signal);
      if (token.id !== epoch.current || token.signal.aborted) return;
      setManifest(data); setResults(stations); setNearby(request.kind === "nearby"); setStatus("ready");
    } catch {
      if (token.id === epoch.current && !token.signal.aborted) setStatus("error");
    }
  }
  function choosePrefecture(value: string) {
    const token = invalidate();
    resetResults(); lastSearch.current = null;
    const code = prefectures.find((p) => p.code === value)?.code ?? "";
    setPrefecture(code);
    if (code) void search({ kind: "manual", code }, token);
    else setStatus("idle");
  }
  function useLocation() {
    const token = invalidate();
    resetResults(); setPrefecture(""); lastSearch.current = null;
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
    if (request) { const token = invalidate(); resetResults(); void search(request, token); }
  }
  const filtered = filterStations(results, query);
  const manualPlace = prefecture ? `${prefectureName(prefecture)} ${query}` : "";
  const busy = status === "location" || status === "loading";
  return <section className="find-panel" id="find-fuel" aria-labelledby="find-title">
    <div className="find-heading">
      <div><p className="eyebrow">{t.ffEyebrow}</p><h2 id="find-title" tabIndex={-1} ref={heading}>{t.findTitle}</h2></div>
      <button type="button" className="button button-quiet" onClick={() => { invalidate(); lastSearch.current = null; onClose(); }}>{t.ffClose}</button>
    </div>
    <p className="find-intro">{t.ffIntro}</p>
    <div className="find-controls">
      <div><button type="button" className="button button-primary" onClick={useLocation}>{t.ffUseLocation}</button><p className="field-help">{t.ffLocationPrivacy}</p></div>
      <div><label htmlFor="prefecture">{t.ffPrefecture}</label><select id="prefecture" value={prefecture} onChange={(event) => choosePrefecture(event.target.value)}><option value="">{t.ffChoosePrefecture}</option>{prefectures.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}</select><p className="field-help">{t.ffManualHelp}</p></div>
    </div>
    <div role="status" aria-live="polite" aria-atomic="true" className={`search-status${status === "error" ? " search-error" : ""}`}>
      {status === "ready" ? <p>{nearby ? t.ffNearbyResults : t.ffManualResults} <strong>{filtered.length.toLocaleString(locale)}</strong></p> : <p>{t[statusKeys[status]]}</p>}
    </div>
    {busy && <button type="button" className="button button-quiet" onClick={() => { invalidate(); resetResults(); lastSearch.current = null; setStatus("idle"); }}>{t.ffCancel}</button>}
    {status === "error" && <button type="button" className="button" onClick={retry}>{t.ffRetry}</button>}
    {status === "ready" && !selected && <>
      <label htmlFor="station-search">{t.ffFilter}</label>
      <input id="station-search" type="search" value={query} maxLength={120} placeholder={t.ffFilterPlaceholder} aria-describedby="filter-help" onChange={(event) => { setQuery(event.target.value); setLimit(25); }} />
      <p id="filter-help" className="field-help">{t.ffFilterHelp}</p>
      <p className="field-help">{nearby ? t.ffStraightLineHelp : t.ffNoDistance}</p>
      {!filtered.length && <p className="notice-box">{t.ffNoResults}</p>}
      <ul className="station-list" aria-label={t.ffStationList}>
        {filtered.slice(0, limit).map((station) => <li key={station.id}>
          <button type="button" id={`station-${station.id}`} className="station-card" onClick={() => { analytics.track("station_view", { locale }); setSelected(station); }}>
            <span className="station-card-top"><strong lang={station.name ? "ja" : undefined}>{station.name || t.ffUnnamed}</strong><span aria-hidden="true">↗</span></span>
            <span className="station-meta">{station.originalBrand || t.ffUnknown} · {prefectureName(station.prefectureCode) || t.ffUnknown}</span>
            <span className="station-meta" lang={station.address ? "ja" : undefined}>{station.address || station.city || t.ffAddressUnknown}</span>
            {station.distanceKm !== undefined && <span className="distance">{t.ffStraightLine} · {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</span>}
            <span className="station-service">{t[station.serviceType === "SELF" ? "ffSelf" : station.serviceType === "FULL" ? "ffFull" : "ffServiceUnknown"]}</span>
          </button>
        </li>)}
      </ul>
      {filtered.length > limit && <button type="button" className="button" onClick={() => setLimit((count) => count + 25)}>{t.ffShowMore}</button>}
    </>}
    {selected && manifest && <StationDetail key={selected.id} station={selected} manifest={manifest} locale={locale} onBack={() => { const id = selected.id; setSelected(null); requestAnimationFrame(() => document.getElementById(`station-${id}`)?.focus()); }} />}
    {!selected && <aside className="map-fallback"><h3>{t.ffMapFallback}</h3><p>{t.ffMapHelp}</p><div className="link-buttons"><a className="button" href={mapSearchUrl("google", manualPlace)} target="_blank" rel="noopener noreferrer">{t.ffSearchGoogle}</a><a className="button" href={mapSearchUrl("apple", manualPlace)} target="_blank" rel="noopener noreferrer">{t.ffSearchApple}</a></div></aside>}
    <div className="find-attribution"><p><a href="https://www.openstreetmap.org/copyright">{t.ffAttribution}</a> · <a href="https://opendatacommons.org/licenses/odbl/1-0/">{t.ffOdbl}</a></p><p>{t.ffCoverage}</p>
      <details><summary>{t.ffDownloads}</summary><p><a href="/data/manifest.json">{t.ffManifest}</a> · <a href="/data/OSM-NOTICE.txt">{t.ffDataLicense}</a></p>{manifest && <><p>{t.ffSnapshot} <time dateTime={manifest.stations.sourceUpdatedAt}>{manifest.stations.sourceUpdatedAt}</time></p><ul className="download-list">{manifest.stations.partitions.map((p) => <li key={p.code}><a href={p.path} download>{prefectureName(p.code) || t.ffUnknown}</a></li>)}</ul></>}</details>
    </div>
  </section>;
}

function FuelLabel({ fuel, locale }: { fuel: FuelType; locale: Locale }) {
  return <>{messages[locale][fuelKeys[fuel]]} <span lang="ja" className="japanese-label">{fuelJapanese[fuel]}</span></>;
}
function StationDetail({ station, manifest, locale, onBack }: { station: Result; manifest: DataManifest; locale: Locale; onBack: () => void }) {
  const t = messages[locale];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const tri = (value: TriState) => t[value === "YES" ? "ffYes" : value === "NO" ? "ffNo" : "ffUnknown"];
  return <article className="station-detail" aria-labelledby="station-title">
    <button className="button button-quiet" type="button" onClick={onBack}>{t.ffBack}</button>
    <h3 id="station-title" tabIndex={-1} ref={heading} lang={station.name ? "ja" : undefined}>{station.name || t.ffUnnamed}</h3>
    <p>{station.originalBrand || t.ffUnknown}</p>
    {station.distanceKm !== undefined && <p className="distance">{t.ffStraightLine} · {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</p>}
    <dl className="station-facts">
      <div><dt>{t.ffAddress}</dt><dd>{station.address || t.ffUnknown}</dd></div>
      <div><dt>{t.ffPrefectureLabel}</dt><dd>{prefectureName(station.prefectureCode) || t.ffUnknown}</dd></div>
      <div><dt>{t.ffHours}</dt><dd>{station.openingHours || t.ffUnknown}</dd></div>
      <div><dt>{t.ffService}</dt><dd>{t[station.serviceType === "SELF" ? "ffSelf" : station.serviceType === "FULL" ? "ffFull" : "ffUnknown"]}</dd></div>
    </dl>
    <p className="field-help">{t.ffHoursHelp}</p>
    <div className="fuel-reminder"><h4>{t.ffFuelReminderTitle}</h4><p>{t.ffFuelReminder}</p></div>
    <h4>{t.ffFuelAvailability}</h4>
    <dl className="station-facts">{fuelTypes.map((fuel) => <div key={fuel}><dt><FuelLabel fuel={fuel} locale={locale} /></dt><dd>{tri(station[fuelFields[fuel]])}</dd></div>)}</dl>
    <h4>{t.ffPayment}</h4><dl className="station-facts"><div><dt>{t.ffVisa}</dt><dd>{tri(station.paymentVisa)}</dd></div><div><dt>{t.ffMastercard}</dt><dd>{tri(station.paymentMastercard)}</dd></div></dl>
    <p className="field-help">{t.ffPaymentHelp}</p>
    <OfficialPrice key={station.prefectureCode} code={station.prefectureCode} manifest={manifest} locale={locale} />
    <h4>{t.ffNavigate}</h4><p className="field-help">{t.ffNavigationHelp}</p>
    <div className="link-buttons">{(["google", "apple"] as const).map((provider) => <a key={provider} className={`button${provider === "google" ? " button-primary" : ""}`} href={navigationUrl(provider, station)} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track("navigate_click", { locale })}>{t[provider === "google" ? "ffGoogle" : "ffApple"]}</a>)}</div>
    <p className="field-help">{t.ffStationUpdated} <time dateTime={station.sourceUpdatedAt}>{station.sourceUpdatedAt}</time></p>
  </article>;
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
