import type { FormEvent, MouseEvent } from "react";
import { messages, type Locale } from "../i18n";
import { rentalPageSizes, type RentalPageSize } from "../lib/rental-view";

type Props = {
  idPrefix: string; locale: Locale; page: number; pageCount: number; pageSize: RentalPageSize;
  resetKey?: string;
  onChange: (patch: { page: number; pageSize?: RentalPageSize }, focusId: string) => void;
  pageHref?: (page: number) => string;
};
export function RentalPagination({ idPrefix, locale, page, pageCount, pageSize, resetKey = "", onChange, pageHref }: Props) {
  const t = messages[locale];
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  function changePage(event: MouseEvent<HTMLAnchorElement>, nextPage: number) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onChange({ page: nextPage }, id("pagination"));
  }
  function jumpPage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = event.currentTarget.elements.namedItem("page") as HTMLInputElement;
    const value = input.value.trim();
    const requested = /^-?\d+$/.test(value) ? Number(value) : page;
    const nextPage = Math.min(pageCount, Math.max(1, requested));
    input.value = String(nextPage);
    if (nextPage !== page) onChange({ page: nextPage }, input.id);
    else input.focus({ preventScroll: true });
  }
  const pageText = t.rdPage.replace("{page}", String(page)).replace("{total}", String(pageCount));
  const [pagePrefix, pageSuffix] = t.rdPage.replace("{total}", String(pageCount)).split("{page}");
  function pageControl(target: number, previous: boolean) {
    const className = `button rental-page-${previous ? "previous" : "next"}`;
    const label = previous ? t.rdPrevious : t.rdNext;
    return pageHref ? <a className={className} href={pageHref(target)} onClick={event => changePage(event, target)}>{label}</a>
      : <button type="button" className={className} onClick={() => onChange({ page: target }, id("pagination"))}>{label}</button>;
  }
  return <nav id={id("pagination")} className="rental-pagination" aria-label={t.rdPagination} tabIndex={-1}>
    <label className="rental-page-size" htmlFor={id("page-size")}>{t.rdPerPage}<select id={id("page-size")} value={pageSize} onChange={event => onChange({ pageSize: Number(event.target.value) as RentalPageSize, page: 1 }, id("page-size"))}>{rentalPageSizes.map(size => <option key={size} value={size}>{size}</option>)}</select></label>
    <div className="rental-page-controls">
      {page > 1 && pageControl(page - 1, true)}
      <form className="rental-page-jump" onSubmit={jumpPage}>
        <label htmlFor={id("page-number")}>{pagePrefix}<input key={`${resetKey}:${page}`} id={id("page-number")} name="page" type="text" inputMode="numeric" enterKeyHint="go" autoComplete="off" maxLength={10} defaultValue={page} aria-label={t.rdPageNumber} disabled={pageCount === 1} />{pageSuffix}</label>
        <button type="submit" className="button" disabled={pageCount === 1}>{t.rdPageJump}</button>
        <span className="sr-only" aria-live="polite">{pageText}</span>
      </form>
      {page < pageCount && pageControl(page + 1, false)}
    </div>
  </nav>;
}
