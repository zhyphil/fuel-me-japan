import { messages, type Locale } from "../i18n";
import { rentalPrefectureCodes, type RentalIndex, type RentalIndexEntry, type RentalCompanyId } from "./rental";
export const rentalPageSizes = [10, 25, 50, 100] as const;
export type RentalPageSize = (typeof rentalPageSizes)[number];
const defaultPageSize: RentalPageSize = 25;
export interface RentalQuery { prefecture: string; company: RentalCompanyId | ""; query: string; page: number; pageSize: RentalPageSize; counters: boolean }
export function readRentalQuery(search: string, index: RentalIndex): RentalQuery {
  const p = new URLSearchParams(search); const company = p.get("company") || ""; const region = p.get("region") || "";
  const requestedSize = Number(p.get("perPage"));
  const pageSize = rentalPageSizes.find(size => size === requestedSize) ?? defaultPageSize;
  return { prefecture: rentalPrefectureCodes.includes(region) ? region : "", company: index.records.some(r => r.companyId === company) ? company as RentalCompanyId : "", query: (p.get("q") || "").slice(0, 160), pageSize, page: Math.min(Number.MAX_SAFE_INTEGER, Math.max(1, Number.parseInt(p.get("page") || "1", 10) || 1)), counters: p.get("counters") === "1" };
}
export function rentalQueryString(query: RentalQuery): string {
  const p = new URLSearchParams();
  if (query.prefecture) p.set("region", query.prefecture);
  if (query.company) p.set("company", query.company);
  if (query.query) p.set("q", query.query);
  if (query.page > 1) p.set("page", String(query.page));
  if (query.pageSize !== defaultPageSize) p.set("perPage", String(query.pageSize));
  if (query.counters) p.set("counters", "1");
  return p.size ? `?${p}` : "";
}
export function rentalName(row: RentalIndexEntry, locale: Locale) { return row.names.primary || row.names.languages[locale] || messages[locale].rdUnnamed; }
export function rentalStatus(row: RentalIndexEntry, locale: Locale) { const t = messages[locale]; return row.candidateStatus === "COUNTER_ONLY" ? t.rdCounter : row.verification === "OFFICIAL_FACILITY_CHECKED" ? t.rdVerified : t.rdCandidate; }
