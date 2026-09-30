import { useEffect, useRef, useState } from "react";
import { messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { fuelTypes, navigationUrl } from "../lib/find-fuel";
import { isFuelType } from "../lib/fuel-preference";
import { formatOpeningHours } from "../lib/opening-hours";
import { loadRentalData, loadReturnCandidates, rentalNeedsRecheck, returnFuelSupply, timesHomeUrl, type RentalData, type RentalLocation, type ReturnCandidate } from "../lib/return-car";
import type { Coordinates, FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";
import { Icon } from "./Icon";

type LoadState = "loading" | "ready" | "error";
export function ReturnCar({ locale, fuel: initialFuel, trigger, onClose, now = Date.now }: { locale: Locale; fuel: FuelType | null; trigger: HTMLButtonElement; onClose: () => void; now?: () => number }) {
  const t = messages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<RentalData | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [locationId, setLocationId] = useState("");
  const [fuel, setFuel] = useState<FuelType | null>(initialFuel);
  const location = data?.records.find(row => row.id === locationId);
  useEffect(() => {
    const panel = dialog.current!;
    panel.showModal(); closeButton.current?.focus();
    analytics.track("return_car_start", { locale });
    return () => { panel.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [locale, trigger]);
  useEffect(() => {
    const controller = new AbortController();
    loadRentalData(controller.signal, now()).then(value => {
      if (!controller.signal.aborted) { setData(value); setState("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt, now]);
  const stale = data && rentalNeedsRecheck(data.reviewDate, now());
  return <dialog ref={dialog} className="my-fuel-dialog return-car-dialog" aria-labelledby="return-car-title" aria-describedby="return-car-coverage" aria-modal="true" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="my-fuel-header"><h2 id="return-car-title"><Icon name="return" />{t.rcTitle}</h2><button ref={closeButton} type="button" className="button" aria-label={t.rcClose} onClick={onClose}><Icon name="close" /></button></header>
    <div className="my-fuel-body return-car-body">
      <p id="return-car-coverage">{t.rcCoverage}</p>
      {state === "loading" && <p role="status">{t.rcLoading}</p>}
      {state === "error" && <div role="alert"><p>{t.rcError}</p><button type="button" className="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>{t.ffRetry}</button></div>}
      {data && <>
        <div className="my-fuel-preference">
          <label htmlFor="return-location">{t.rcLocation}</label>
          <select id="return-location" value={locationId} aria-describedby="return-location-help" onChange={event => { setLocationId(event.currentTarget.value); analytics.track("return_location_selected", { locale }); }}>
            <option value="">{t.rcChooseLocation}</option>{data.records.map(row => <option key={row.id} value={row.id}>{t[row.nameKey]}</option>)}
          </select>
          <p id="return-location-help" className="field-help">{t.rcLocationHelp}</p>
          {location && <p className="return-car-address" lang="ja">{location.nameJa}<br />{location.addressJa}</p>}
          <label htmlFor="return-fuel">{t.rcFuel}</label>
          <select id="return-fuel" value={fuel ?? ""} aria-describedby="return-fuel-help" onChange={event => { const value = event.currentTarget.value; setFuel(isFuelType(value) ? value : null); }}>
            <option value="">{t.rcChooseFuel}</option>{fuelTypes.map(type => <option key={type} value={type}>{fuelDisplayName(type, locale)}</option>)}
          </select>
          <p id="return-fuel-help" className="field-help">{t.rcFuelHelp}</p>
        </div>
        <aside className="return-car-rules"><p>{t.rcRules}</p><dl className="refuel-guide-labels"><div><dt lang="ja">満タン</dt><dd>{t.rgFullTank}</dd></div><div><dt lang="ja">領収書 / レシート</dt><dd>{t.rcReceipt}</dd></div></dl>
          <p>{t.rcChecked.replace("{date}", new Date(`${data.reviewDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" }))}</p>
          {stale && <p className="return-car-stale" role="alert">{t.rcStale}</p>}
          <a href={timesHomeUrl} target="_blank" rel="noopener noreferrer">{t.rcOfficial}</a>
        </aside>
        {/* A new branch/fuel mounts a fresh search; cleanup aborts the old request and clears its navigation state. */}
        {location && fuel && <ReturnSearch key={`${location.id}:${fuel}`} location={location} fuel={fuel} locale={locale} />}
        <footer className="refuel-guide-sources"><p>{t.rcSourceScope}</p><div className="refuel-guide-links">
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t.ffAttribution}</a>
          <a href={data.osm.licenseUrl} target="_blank" rel="noopener noreferrer">{t.ffOdbl}</a>
          <a href={data.osm.downloadUrl} download>{t.rcDownload}</a><a href={data.osm.noticeUrl} target="_blank" rel="noopener noreferrer">{t.rcNotice}</a>
        </div></footer>
      </>}
      <button type="button" className="button return-car-back" onClick={onClose}>{t.rcBack}</button>
    </div>
  </dialog>;
}

function ReturnSearch({ location, fuel, locale }: { location: RentalLocation; fuel: FuelType; locale: Locale }) {
  const t = messages[locale];
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [candidates, setCandidates] = useState<ReturnCandidate[]>([]);
  const [selected, setSelected] = useState<ReturnCandidate | null>(null);
  const [refuelled, setRefuelled] = useState(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const hadSelection = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    loadReturnCandidates(location, fuel, controller.signal).then(rows => {
      if (!controller.signal.aborted) { setCandidates(rows); setState("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setState("error"); });
    return () => controller.abort();
  }, [attempt, location, fuel]);
  useEffect(() => {
    if (selected) { stepTitle.current?.focus(); hadSelection.current = true; }
    else if (hadSelection.current) listTitle.current?.focus();
  }, [selected, refuelled]);
  return <section className="return-search" aria-labelledby={selected ? "return-step-title" : "return-candidates-title"}>
    {selected ? <>
      <h3 ref={stepTitle} id="return-step-title" tabIndex={-1}>{refuelled ? t.rcStep2 : t.rcStep1}</h3>
      {refuelled ? <><p>{t[location.nameKey]}</p><p lang="ja">{location.addressJa}</p><NavigationLinks destination={location} locale={locale} returning /></> : <>
        <p className="return-car-selected">{t.rcSelected}</p><StationSummary station={selected} fuel={fuel} locale={locale} />
        <p className="return-fuel-reminder">{t.rcFuelReminder.replace("{fuel}", fuelDisplayName(fuel, locale))}</p>
        <NavigationLinks destination={selected} locale={locale} returning={false} />
        <p>{t.rcNotDone}</p><button type="button" className="button button-primary" onClick={() => setRefuelled(true)}>{t.rcDone}</button>
      </>}
      <button type="button" className="button return-reselect" onClick={() => { setSelected(null); setRefuelled(false); }}>{t.rcReselect}</button>
    </> : <>
      <h3 ref={listTitle} id="return-candidates-title" tabIndex={-1}>{t.rcCandidates}</h3><p>{t.rcDistanceHelp}</p><p className="field-help">{t.ffHoursHelp}</p>
      {state === "loading" && <p role="status">{t.rcStationsLoading}</p>}
      {state === "error" && <div role="alert"><p>{t.rcStationsError}</p><button type="button" className="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>{t.ffRetry}</button></div>}
      {state === "ready" && (candidates.length ? <ol className="return-candidates">{candidates.map(station => <li key={station.id}><StationSummary station={station} fuel={fuel} locale={locale} /><button type="button" className="button" aria-label={`${t.rcSelect}: ${station.name ?? t.ffUnnamed}`} onClick={() => { setSelected(station); analytics.track("return_station_selected", { locale }); }}>{t.rcSelect}</button></li>)}</ol> : <p role="status">{t.rcEmpty}</p>)}
    </>}
  </section>;
}
function NavigationLinks({ destination, locale, returning }: { destination: Coordinates; locale: Locale; returning: boolean }) {
  const t = messages[locale];
  return <div className="return-navigation"><p className="field-help">{t.rcNavigationHelp}</p>{(["google", "apple"] as const).map(provider => <a className="button" key={provider} href={navigationUrl(provider, destination)} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track(returning ? "return_navigation_click" : "navigate_click", { locale })}>{provider === "google" ? t.ffGoogle : t.ffApple}</a>)}</div>;
}
function StationSummary({ station, fuel, locale }: { station: ReturnCandidate; fuel: FuelType; locale: Locale }) {
  const t = messages[locale];
  const hours = formatOpeningHours(station.openingHours, locale);
  return <div className="return-station-summary"><h4>{station.name ?? t.ffUnnamed}</h4>
    <p>{t.ffStraightLine}: {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</p>
    <p>{fuelDisplayName(fuel, locale)} · {returnFuelSupply(station, fuel) === "YES" ? t.ffYes : t.rcUnknownSupply}</p>
    <dl><div><dt>{t.ffAddress}</dt><dd>{station.address ?? t.ffAddressUnknown}</dd></div>
      <div><dt>{t.ffService}</dt><dd>{station.serviceType === "SELF" ? t.ffSelf : station.serviceType === "FULL" ? t.ffFull : t.ffServiceUnknown}</dd></div>
      <div><dt>{t.ffHours}</dt><dd>{hours.kind === "raw" ? <><p className="field-help">{t.ffHoursUntranslated}</p><code className="hours-raw">{station.openingHours}</code></> : hours.lines.map((line, index) => <p key={index}>{line}</p>)}{hours.kind === "translated" && <details className="hours-original"><summary>{t.ffHoursOriginal}</summary><code className="hours-raw">{station.openingHours}</code></details>}</dd></div></dl>
  </div>;
}
