import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { messages, type Locale } from "../i18n";
import { prefectures, prefectureName } from "../lib/find-fuel";
import { searchRentals, type RentalIndex } from "../lib/rental";
import { readRentalQuery, rentalQueryString, rentalName, rentalStatus, type RentalQuery } from "../lib/rental-view";
import { navigate, rentalHref } from "../lib/routes";
import type { PartitionCode } from "../lib/stations";
import { MapThumbnail } from "./MapThumbnail";
import { RentalMap } from "./RentalMap";
import { RentalPagination } from "./RentalPagination";

export function RentalDirectory({ index, locale, search, tileUrl, active }: { index: RentalIndex; locale: Locale; search: string; tileUrl: string | null | undefined; active: boolean }) {
  const t = messages[locale];
  const query = useMemo(() => readRentalQuery(search, index), [search, index]);
  const matches = useMemo(() => searchRentals(index, { prefectureCode: query.prefecture || undefined, companyId: query.company || undefined, query: query.query, includeCounters: query.counters, limit: 10000 }), [index, query.prefecture, query.company, query.query, query.counters]);
  const pageCount = Math.max(1, Math.ceil(matches.length / query.pageSize)); const page = Math.min(query.page, pageCount);
  const rows = matches.slice((page - 1) * query.pageSize, page * query.pageSize);
  const companies = useMemo(() => [...new Map(index.records.map(row => [row.companyId, row.companyName])).entries()].sort((a, b) => (a[1] || "").localeCompare(b[1] || "")), [index]);
  const [draft, setDraft] = useState(query.query);
  useEffect(() => { setDraft(query.query); }, [query.query]);
  const [preview, setPreview] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearPreview = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setPreview(null); };
  function previewRow(id: string) { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => { setPreview(id); timer.current = null; }, 180); }
  useEffect(() => { clearPreview(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [search, active]);
  // Restore before paint so a delayed frame cannot overwrite fresh list scrolling.
  useLayoutEffect(() => {
    if (!active || !list.current) return;
    const saved = history.state?.rentalListScrollTop;
    list.current.scrollTop = typeof saved === "number" ? saved : 0;
  }, [active, search, index]);
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => {
      const saved = history.state; const hash = window.location.hash.slice(1);
      const focusId = hash || saved?.focusId;
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
      if (hash) document.getElementById(hash)?.scrollIntoView({ block: "center" });
      else if (typeof saved?.scrollY === "number") window.scrollTo(0, saved.scrollY);
    });
    return () => cancelAnimationFrame(frame);
  }, [active, search, index]);
  function update(patch: Partial<RentalQuery>) { clearPreview(); navigate(rentalHref(locale, undefined, rentalQueryString({ ...query, query: draft, page: 1, ...patch }))); }
  function paginate(patch: Partial<Pick<RentalQuery, "page" | "pageSize">>, focusId: string) {
    clearPreview();
    navigate(rentalHref(locale, undefined, rentalQueryString({ ...query, ...patch })), false, { scrollY: window.scrollY, focusId, rentalListScrollTop: 0 });
  }
  const filterKey = `${query.prefecture}:${query.company}:${query.query}:${query.counters}`;
  return <div className="rental-directory" hidden={!active} data-testid="rental-directory">
    <form className="rental-filters" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); update({ query: String(form.get("q") || "").slice(0, 160) }); }}>
      <div><label htmlFor="rental-region">{t.ffPrefectureLabel}</label><select id="rental-region" value={query.prefecture} onChange={e => update({ prefecture: e.target.value })}><option value="">{t.rdAllJapan}</option>{prefectures.map(p => <option key={p.code} value={p.code} lang="ja">{p.name}</option>)}<option value="UNKNOWN">{t.ffUnknown}</option></select></div>
      <div><label htmlFor="rental-company">{t.rdCompany}</label><select id="rental-company" value={query.company} onChange={e => update({ company: e.target.value as RentalQuery["company"] })}><option value="">{t.rdAllCompanies}</option>{companies.map(([id, name]) => <option key={id} value={id}>{name || t.ffUnknown}</option>)}</select></div>
      <div className="rental-query">
        <label htmlFor="rental-query">{t.rdSearchLabel}</label>
        <div className="rental-query-controls">
          <input id="rental-query" name="q" type="search" maxLength={160} value={draft} onChange={e => setDraft(e.target.value)} />
          <div className="rental-query-actions">
            <button type="submit" className="button button-primary">{t.rdSearch}</button>
            <a className="button button-quiet" href={rentalHref(locale)} onClick={() => setDraft("")}>{t.rdReset}</a>
          </div>
        </div>
      </div>
      <label className="rental-counters"><input type="checkbox" checked={query.counters} onChange={e => update({ counters: e.target.checked })} />{t.rdIncludeCounters}</label>
    </form>
    <p className="rental-results-count" role="status">{t.rdResults.replace("{count}", matches.length.toLocaleString(locale))}</p>
    <div className="rental-directory-layout">
      <RentalMap rows={matches} locale={locale} tileUrl={tileUrl} search={search} fitKey={filterKey} overview={!query.prefecture && !query.company && !query.query} previewId={preview} />
      <section className="rental-results">
        <div ref={list} id="rental-results-scroll" className="rental-results-scroll" role="region" aria-label={t.rdResultsLabel} tabIndex={0}>
        {!rows.length && <p className="notice-box">{t.rdEmpty}</p>}
        <ol className="rental-cards" start={(page - 1) * query.pageSize + 1}>{rows.map(row => { const name = rentalName(row, locale); const href = rentalHref(locale, row.id, rentalQueryString({ ...query, page })); return <li className={`rental-card${preview === row.id ? " is-preview" : ""}`} key={row.id} data-rental-id={row.id} onClick={event => {
          if (!(event.target instanceof Element) || event.target.closest("a, button, input") || window.getSelection()?.type === "Range") return;
          navigate(href, false, undefined, `rental-card-${row.id}`);
        }} onPointerEnter={e => { if (e.pointerType === "mouse") previewRow(row.id); }} onPointerLeave={clearPreview} onFocus={() => previewRow(row.id)} onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) clearPreview(); }}>
          <MapThumbnail point={row} id={row.id} name={name} icon="/icons/rental-car.svg" locale={locale} tileUrl={tileUrl} href={href} openLabel={t.rdOpenMap} previewLabel={t.rdPreviewMap} unavailableLabel={t.rdMapUnavailable} />
          <div className="rental-card-body">
            <p className="rental-company">{row.companyName || t.ffUnknown}</p>
            <h2><a id={`rental-card-${row.id}`} href={href} lang="ja">{name}</a></h2>
            <p className="rental-card-address"><span lang="ja">{prefectureName(row.prefectureCode as PartitionCode) || t.ffUnknown}</span><span aria-hidden="true"> · </span><span lang={row.address ? "ja" : undefined}>{row.address || t.ffAddressUnknown}</span></p>
            <div className="rental-card-footer"><span className={`rental-status status-${row.candidateStatus.toLowerCase()}`}>{rentalStatus(row, locale)}</span><a className="rental-view-link" href={href} aria-label={`${t.rdView}: ${name}`}>{t.rdView}<span aria-hidden="true"> →</span></a></div>
          </div>
        </li>; })}</ol>
        </div>
        <RentalPagination idPrefix="rental" locale={locale} page={page} pageCount={pageCount} pageSize={query.pageSize} resetKey={search} onChange={paginate} pageHref={target => rentalHref(locale, undefined, rentalQueryString({ ...query, page: target }))} />
      </section>
    </div>
  </div>;
}
