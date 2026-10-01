import { messages, type Locale } from "../i18n";
import { formatOpeningHours } from "../lib/opening-hours";
import type { StationReview } from "../lib/station-review";
export function StationHours({ value, locale, review }: { value: string | undefined; locale: Locale; review?: StationReview }) {
  const t = messages[locale];
  const hours = formatOpeningHours(value, locale);
  if (review?.hoursKey) return <><p>{t[review.hoursKey]}</p><details className="hours-original"><summary>{t.ffHoursOriginal}</summary><code className="hours-raw">{value}</code></details></>;
  if (hours.kind === "unknown") return <>{t.ffUnknown}</>;
  if (hours.kind === "raw") return <><p className="field-help">{t.ffHoursUntranslated}</p><code className="hours-raw">{value}</code></>;
  return <><ul className="hours-lines">{hours.lines.map((line, index) => <li key={index}>{line}</li>)}</ul><details className="hours-original"><summary>{t.ffHoursOriginal}</summary><code className="hours-raw">{value}</code></details></>;
}
