import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { fuelTypes, navigationUrl } from "../lib/find-fuel";
import { isFuelType } from "../lib/fuel-preference";
import { StationHours } from "./StationHours";
import { StationSources } from "./StationSources";
import { loadReturnCandidates, returnFuelSupply, type ReturnCandidate } from "../lib/return-car";
import { canSelectRentalDestination, type RentalLocation } from "../lib/rental";
import { rentalName, type RentalPageSize } from "../lib/rental-view";
import type { Coordinates, FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";
import { StationMiniMap } from "./StationMiniMap";
import { RentalPagination } from "./RentalPagination";
import { ReturnCandidateMap } from "./ReturnCandidateMap";

type LoadState = "loading" | "ready" | "error";
export function ReturnCar({ locale, location, fuel: initialFuel, tileUrl }: { locale: Locale; location: RentalLocation; fuel: FuelType | null; tileUrl: string | null | undefined }) {
  const t = messages[locale];
  const [fuel, setFuel] = useState<FuelType | null>(initialFuel);
  const [cancelled, setCancelled] = useState(false);
  useEffect(() => { analytics.track("return_car_start", { locale }); }, [locale]);
  if (!canSelectRentalDestination(location)) return <p className="notice-box" role="status">{t.rdCounterHelp}</p>;
  return <section className="rental-refuelling" aria-labelledby="return-car-title">
    <h2 id="return-car-title">{t.rcTitle}</h2>
    <div className="my-fuel-preference"><label htmlFor="return-fuel">{t.rcFuel}</label>
      <select id="return-fuel" value={fuel ?? ""} aria-describedby="return-fuel-help" onChange={e => { setFuel(isFuelType(e.target.value) ? e.target.value : null); setCancelled(false); }}><option value="">{t.rcChooseFuel}</option>{fuelTypes.map(type => <option key={type} value={type}>{fuelDisplayName(type, locale)}</option>)}</select><p id="return-fuel-help" className="field-help">{t.rcFuelHelp}</p>
    </div>
    {fuel && !cancelled && <><ReturnSearch key={`${location.id}:${fuel}`} location={location} fuel={fuel} locale={locale} tileUrl={tileUrl} /><button type="button" className="button button-quiet" onClick={() => setCancelled(true)}>{t.rdCancelSearch}</button></>}
    {cancelled && <button type="button" className="button" onClick={() => setCancelled(false)}>{t.ffRetry}</button>}
  </section>;
}

function ReturnSearch({ location, fuel, locale, tileUrl }: { location: RentalLocation; fuel: FuelType; locale: Locale; tileUrl: string | null | undefined }) {
  const t = messages[locale];
  const [state, setState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);
  const [candidates, setCandidates] = useState<ReturnCandidate[]>([]);
  const [selected, setSelected] = useState<ReturnCandidate | null>(null);
  const [refuelled, setRefuelled] = useState(false);
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const stepTitle = useRef<HTMLHeadingElement>(null);
  const listTitle = useRef<HTMLHeadingElement>(null);
  const hadSelection = useRef(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<RentalPageSize>(25);
  const [preview, setPreview] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const savedScroll = useRef(0);
  const pendingFocus = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageCount = Math.max(1, Math.ceil(candidates.length / pageSize));
  const rows = useMemo(() => candidates.slice((page - 1) * pageSize, page * pageSize), [candidates, page, pageSize]);
  function clearPreview() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null; setPreview(null);
  }
  function previewRow(id: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setPreview(id); timer.current = null; }, 180);
  }
  function leavePointerPreview() {
    // Focusing a card can scroll the list beneath the stationary pointer.
    // That pointer-leave must not cancel the new keyboard target.
    const focused = list.current?.querySelector("li:focus-within")?.getAttribute("data-return-station-id");
    if (focused) previewRow(focused); else clearPreview();
  }
  function paginate(patch: { page: number; pageSize?: RentalPageSize }, focusId: string) {
    clearPreview(); savedScroll.current = 0; pendingFocus.current = focusId;
    if (patch.pageSize) setPageSize(patch.pageSize);
    setPage(patch.page);
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // Restore before paint: late animation frames must not undo fresh user scrolling.
  useLayoutEffect(() => {
    if (selected || !list.current) return;
    list.current.scrollTop = savedScroll.current;
    if (pendingFocus.current) {
      document.getElementById(pendingFocus.current)?.focus({ preventScroll: true });
      pendingFocus.current = null;
    }
  }, [selected, page, pageSize, state]);
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
      {refuelled ? <><p lang="ja">{rentalName(location, locale)}</p><p lang="ja">{location.address || t.ffAddressUnknown}</p><p>{t.rdReferencePoint}</p>{!location.official && <label className="rental-confirm"><input type="checkbox" checked={addressConfirmed} onChange={e => setAddressConfirmed(e.target.checked)} />{t.rdConfirmAddress}</label>}{(location.official || addressConfirmed) && <NavigationLinks destination={location} locale={locale} returning />}</> : <>
        <p className="return-car-selected">{t.rcSelected}</p><StationSummary station={selected} fuel={fuel} locale={locale} />
        <p className="return-fuel-reminder">{t.rcFuelReminder.replace("{fuel}", fuelDisplayName(fuel, locale))}</p>
        <NavigationLinks destination={selected} locale={locale} returning={false} />
        <p>{t.rcNotDone}</p><button type="button" className="button button-primary" onClick={() => setRefuelled(true)}>{t.rcDone}</button>
      </>}
      <button type="button" className="button return-reselect" onClick={() => { setSelected(null); setRefuelled(false); setAddressConfirmed(false); }}>{t.rcReselect}</button>
    </> : <>
      <h3 ref={listTitle} id="return-candidates-title" tabIndex={-1}>{t.rcCandidates}</h3><p>{t.rcDistanceHelp}</p><p className="field-help">{t.ffHoursHelp}</p>
      {state === "loading" && <p role="status">{t.rcStationsLoading}</p>}
      {state === "error" && <div role="alert"><p>{t.rcStationsError}</p><button type="button" className="button" onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>{t.ffRetry}</button></div>}
      {state === "ready" && (candidates.length ? <div className="return-candidate-browser">
        <section className="return-candidate-results" aria-label={t.rcCandidates}>
          <div ref={list} id="return-results-scroll" className="rental-results-scroll" role="region" aria-label={t.rcCandidates} tabIndex={0}>
            <ol className="return-candidates" start={(page - 1) * pageSize + 1}>{rows.map(station => <li key={station.id} id={`return-station-${station.id}`} data-return-station-id={station.id} className={preview === station.id ? "is-preview" : undefined} tabIndex={0}
              onPointerEnter={event => { if (event.pointerType === "mouse") previewRow(station.id); }} onPointerLeave={leavePointerPreview}
              onFocus={() => previewRow(station.id)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) clearPreview(); }}>
              <StationMiniMap station={station} locale={locale} tileUrl={tileUrl} />
              <div className="return-candidate-details"><StationSummary station={station} fuel={fuel} locale={locale} action={
                <button type="button" className="button" aria-label={`${t.rcSelect}: ${station.name ?? t.ffUnnamed}`} onClick={() => { savedScroll.current = list.current?.scrollTop ?? 0; clearPreview(); setSelected(station); analytics.track("return_station_selected", { locale }); }}>{t.rcSelect}</button>
              } /></div>
            </li>)}</ol>
          </div>
          <RentalPagination idPrefix="return" locale={locale} page={page} pageCount={pageCount} pageSize={pageSize} onChange={paginate} />
        </section>
        <ReturnCandidateMap stations={rows} location={location} locale={locale} tileUrl={tileUrl} previewId={preview} onPreview={id => {
          clearPreview(); setPreview(id);
          const card = document.getElementById(`return-station-${id}`);
          if (card && list.current) {
            const relativeTop = card.getBoundingClientRect().top - list.current.getBoundingClientRect().top;
            list.current.scrollTop += relativeTop - 6;
            card.focus({ preventScroll: true });
          }
        }} />
      </div> : <p role="status">{t.rcEmpty}</p>)}
    </>}
  </section>;
}
function NavigationLinks({ destination, locale, returning }: { destination: Coordinates; locale: Locale; returning: boolean }) {
  const t = messages[locale];
  return <div className="return-navigation"><p className="field-help">{t.rcNavigationHelp}</p>{(["google", "apple"] as const).map(provider => <a className="button" key={provider} href={navigationUrl(provider, destination)} target="_blank" rel="noopener noreferrer" onClick={() => analytics.track(returning ? "return_navigation_click" : "navigate_click", { locale })}>{provider === "google" ? t.ffGoogle : t.ffApple}</a>)}</div>;
}
function StationSummary({ station, fuel, locale, action }: { station: ReturnCandidate; fuel: FuelType; locale: Locale; action?: ReactNode }) {
  const t = messages[locale];
  return <div className="return-station-summary">
    <div className="return-station-heading">
      <div><h4>{station.name ?? t.ffUnnamed}</h4><p>{t.ffStraightLine}: {station.distanceKm.toLocaleString(locale, { maximumFractionDigits: 1 })} {t.ffKm}</p></div>
      {action}
    </div>
    <p>{fuelDisplayName(fuel, locale)} · {returnFuelSupply(station, fuel) === "YES" ? t.ffYes : t.rcUnknownSupply}</p>
    <dl><div><dt>{t.ffAddress}</dt><dd>{station.address ?? t.ffAddressUnknown}</dd></div>
      <div><dt>{t.ffService}</dt><dd>{station.serviceType === "SELF" ? t.ffSelf : station.serviceType === "FULL" ? t.ffFull : t.ffServiceUnknown}</dd></div>
      <div><dt>{t.ffHours}</dt><dd><StationHours value={station.openingHours} locale={locale} review={station.reviewedFacts} /></dd></div></dl><StationSources station={station} locale={locale} />
  </div>;
}
