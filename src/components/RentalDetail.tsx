import { useEffect, useMemo, useState } from "react";
import { messages, type Locale } from "../i18n";
import { prefectureName } from "../lib/find-fuel";
import { findRentalById, loadRentalLocation, rentalNeedsRecheck, rentalRuleFor, rentalOfficialWebsite, type RentalIndex, type RentalManifest, type RentalLocation } from "../lib/rental";
import { rentalName, rentalStatus } from "../lib/rental-view";
import { navigate, rentalHref, safeWebsite, updateRouteMetadata, type AppRoute } from "../lib/routes";
import type { FuelType, PartitionCode } from "../lib/stations";
import { RentalMap } from "./RentalMap";
import { ReturnCar } from "./ReturnCar";

export function RentalNotFound({ locale }: { locale: Locale }) { const t = messages[locale]; return <section className="rental-not-found" role="status"><h1>{t.rdNotFound}</h1><p>{t.rdNotFoundHelp}</p><a className="button" href={rentalHref(locale)}>{t.rdBackDirectory}</a></section>; }
export function RentalDetail({ manifest, index, route, tileUrl, fuel }: { manifest: RentalManifest; index: RentalIndex; route: AppRoute; tileUrl: string | null | undefined; fuel: FuelType | null }) {
  const { locale } = route; const t = messages[locale];
  const row = findRentalById(index, route.id || "");
  const [location, setLocation] = useState<RentalLocation | null>(null);
  const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  const points = useMemo(() => row ? [row] : [], [row]);
  useEffect(() => {
    const frame = requestAnimationFrame(() => updateRouteMetadata(row ? route : { ...route, kind: "not-found" }, row ? rentalName(row, locale) : undefined));
    return () => cancelAnimationFrame(frame);
  }, [row, route, locale]);
  useEffect(() => {
    if (!row) return;
    if (route.id !== row.id) { navigate(rentalHref(locale, row.id, route.search), true); return; }
    updateRouteMetadata(route, rentalName(row, locale));
    const controller = new AbortController();
    loadRentalLocation(manifest, index, row.id, controller.signal).then(value => { if (!controller.signal.aborted) { setLocation(value); updateRouteMetadata(route, rentalName(row, locale)); } }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [manifest, index, row, route, locale, attempt]);
  if (!row) return <RentalNotFound locale={locale} />;
  const official = location?.official; const rule = official && location ? rentalRuleFor(location) : null;
  const officialWebsite = location ? rentalOfficialWebsite(location) : null;
  return <article className="rental-detail" data-testid="rental-detail" data-rental-id={row.id}>
    <a data-return-directory className="rental-back" href={`${rentalHref(locale, undefined, route.search)}#rental-card-${row.id}`}>{t.rdBackDirectory}</a>
    <header className="rental-detail-heading"><p className="rental-company">{row.companyName || t.ffUnknown}</p><h1 lang="ja">{rentalName(row, locale)}</h1><span className={`rental-status status-${row.candidateStatus.toLowerCase()}`}>{rentalStatus(row, locale)}</span><p>{t.rdReferencePoint}</p></header>
    <div className="rental-detail-layout"><RentalMap markerPrefix="rental-detail-marker" rows={points} locale={locale} tileUrl={tileUrl} search={route.search} fitKey={row.id} /><section className="rental-detail-info" aria-label={t.rdDetails}>
      <dl><div><dt>{t.rdOriginalName}</dt><dd lang="ja">{row.names.languages.ja || row.names.primary || t.ffUnknown}</dd></div><div><dt>{t.ffPrefectureLabel}</dt><dd lang="ja">{prefectureName(row.prefectureCode as PartitionCode) || t.ffUnknown}</dd></div><div><dt>{t.ffAddress}</dt><dd lang={row.address ? "ja" : undefined}>{row.address || t.ffAddressUnknown}</dd></div><div><dt>{t.rdPhone}</dt><dd>{location ? location.phones.length ? location.phones.filter((phone, i, all) => all.findIndex(value => value.replace(/\D/g, "") === phone.replace(/\D/g, "")) === i).map(phone => <p key={phone}>{phone}</p>) : t.ffUnknown : t.rcLoading}</dd></div><div><dt>{t.ffHours}</dt><dd>{t.ffUnknown}</dd></div></dl>
      {row.candidateStatus === "COUNTER_ONLY" ? <p className="notice-box">{t.rdCounterHelp}</p> : row.verification !== "OFFICIAL_FACILITY_CHECKED" && <p className="notice-box">{t.rdCandidateHelp}</p>}
      {!location && !error && <p role="status">{t.rcLoading}</p>}
      {error && <div role="alert"><p>{t.rcError}</p><button className="button" type="button" onClick={() => { setError(false); setAttempt(value => value + 1); }}>{t.ffRetry}</button></div>}
      {location && <><div className="rental-websites">{!official && !location.websites.some(url => safeWebsite(url)) && <p>{t.rdRecordedWebsite}: {t.ffUnknown}</p>}{officialWebsite && <a href={officialWebsite} target="_blank" rel="noopener noreferrer">{t.rdOfficialWebsite}</a>}{location.websites.filter(url => safeWebsite(url) && !official).map((url, i) => <a key={url} href={safeWebsite(url)!} target="_blank" rel="noopener noreferrer">{t.rdRecordedWebsite} {i + 1}<span className="field-help">{new URL(url).hostname}</span></a>)}</div>
        {official && <aside className="rental-official-notes"><h2>{t.rdReturnNotes}</h2><p>{t[official.summaryKey]}</p><p>{t.rdScope}</p><p>{t.rcChecked.replace("{date}", official.checkedAt)}</p>{rentalNeedsRecheck(official.checkedAt) && <p role="alert">{t.rdStale}</p>}{official.supplementaryUrls.map(url => <p key={url}><a href={url} target="_blank" rel="noopener noreferrer">{t.rdAirportDirections}</a></p>)}</aside>}
        <aside className="return-car-rules">{rule ? <><p>{t.rcRules}</p><dl className="refuel-guide-labels"><div><dt lang="ja">満タン</dt><dd>{t.rgFullTank}</dd></div><div><dt lang="ja">領収書 / レシート</dt><dd>{t.rcReceipt}</dd></div></dl><a href={rule.url} target="_blank" rel="noopener noreferrer">{t.rdRuleSource}</a>{rentalNeedsRecheck(rule.checkedAt) && <p role="alert">{t.rdStale}</p>}</> : <p>{t.rdContractRules}</p>}</aside>
        <details className="rental-record-sources"><summary>{t.rdRecordSources}</summary><ul>{location.sources.map(source => <li key={source.key}><a href={safeWebsite(source.url) || undefined} target="_blank" rel="noopener noreferrer">{source.sourceId}: {source.recordId}</a><p><time dateTime={source.sourceDate}>{source.sourceDate}</time> · {source.licenses.join(", ")}</p></li>)}</ul></details>
      </>}
    </section></div>
    {location && <ReturnCar key={location.id} locale={locale} location={location} tileUrl={tileUrl} fuel={fuel} />}
  </article>;
}
