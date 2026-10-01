import { messages, type Locale } from "../i18n";
import { prefectures } from "../lib/find-fuel";
import { rentalHref } from "../lib/routes";
import type { RentalCompanyId } from "../lib/rental";
import type { RentalQuery } from "../lib/rental-view";

type FilterQuery = Pick<RentalQuery, "prefecture" | "company" | "query" | "counters">;
type FiltersProps = {
  locale: Locale; query: FilterQuery; companies?: [RentalCompanyId, string | null][]; disabled?: boolean;
  onFilterChange?: (patch: Partial<RentalQuery>) => void; onDraftChange?: (value: string) => void;
  onSearch?: (value: string) => void; onReset?: () => void;
};

// Shared by the static page, the lazy-code fallback and the loaded directory.
export function RentalDirectoryIntro({ locale }: { locale: Locale }) {
  const t = messages[locale];
  return <header className="rental-intro"><p className="eyebrow">{t.rdEyebrow}</p><h1>{t.rdTitle}</h1><p>{t.rdIntro}</p><p className="field-help">{t.rdCandidateHelp}</p></header>;
}

export function RentalDirectoryFilters({ locale, query, companies = [], disabled = false, onFilterChange, onDraftChange, onSearch, onReset }: FiltersProps) {
  const t = messages[locale];
  return <form className="rental-filters" onSubmit={event => {
    event.preventDefault();
    if (!disabled) onSearch?.(String(new FormData(event.currentTarget).get("q") || "").slice(0, 160));
  }}>
    <div><label htmlFor="rental-region">{t.ffPrefectureLabel}</label><select id="rental-region" disabled={disabled} value={query.prefecture} onChange={event => onFilterChange?.({ prefecture: event.target.value })}><option value="">{t.rdAllJapan}</option>{prefectures.map(p => <option key={p.code} value={p.code} lang="ja">{p.name}</option>)}<option value="UNKNOWN">{t.ffUnknown}</option></select></div>
    <div><label htmlFor="rental-company">{t.rdCompany}</label><select id="rental-company" disabled={disabled} value={query.company} onChange={event => onFilterChange?.({ company: event.target.value as RentalCompanyId })}><option value="">{disabled ? t.rdLoadingOption : t.rdAllCompanies}</option>{companies.map(([id, name]) => <option key={id} value={id}>{name || t.ffUnknown}</option>)}</select></div>
    <div className="rental-query">
      <label htmlFor="rental-query">{t.rdSearchLabel}</label>
      <div className="rental-query-controls">
        <input id="rental-query" name="q" type="search" maxLength={160} disabled={disabled} value={query.query} onChange={event => onDraftChange?.(event.target.value)} />
        <div className="rental-query-actions">
          <button type="submit" className="button button-primary" disabled={disabled}>{t.rdSearch}</button>
          <a className="button button-quiet" href={rentalHref(locale)} aria-disabled={disabled || undefined} tabIndex={disabled ? -1 : undefined} onClick={event => { if (disabled) event.preventDefault(); else onReset?.(); }}>{t.rdReset}</a>
        </div>
      </div>
    </div>
    <label className="rental-counters"><input type="checkbox" disabled={disabled} checked={query.counters} onChange={event => onFilterChange?.({ counters: event.target.checked })} />{t.rdIncludeCounters}</label>
  </form>;
}

export function RentalDirectoryStatus({ locale, state, onRetry }: { locale: Locale; state: "loading" | "empty" | "error"; onRetry?: () => void }) {
  const t = messages[locale];
  return <div className="rental-directory-state" role={state === "error" ? "alert" : "status"} aria-busy={state === "loading" || undefined}>
    {state === "loading" && <><span className="rental-loading-spinner" aria-hidden="true" /><p className="rental-loading-label">{t.rcLoading}</p><p>{t.rdLoadingPlaceholder}</p></>}
    {state === "empty" && <p>{t.rdEmpty}</p>}
    {state === "error" && <><p>{t.rcError}</p><button className="button" type="button" onClick={onRetry}>{t.ffRetry}</button></>}
  </div>;
}

export function RentalDirectoryPending({ locale, search = "", error = false, onRetry }: { locale: Locale; search?: string; error?: boolean; onRetry?: () => void }) {
  const params = new URLSearchParams(search); const region = params.get("region") || "";
  const query: FilterQuery = {
    prefecture: region === "UNKNOWN" || prefectures.some(p => p.code === region) ? region : "",
    company: "", query: (params.get("q") || "").slice(0, 160), counters: params.get("counters") === "1",
  };
  return <div className="rental-directory">
    <RentalDirectoryFilters locale={locale} query={query} disabled />
    <p className="rental-results-count" aria-hidden="true">{"\u00a0"}</p>
    <div className="rental-directory-pending"><RentalDirectoryStatus locale={locale} state={error ? "error" : "loading"} onRetry={onRetry} /></div>
  </div>;
}
