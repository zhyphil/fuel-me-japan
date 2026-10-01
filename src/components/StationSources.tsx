import { messages, type Locale } from "../i18n";
import type { Station } from "../lib/stations";
export function StationSources({ station, locale }: { station: Station; locale: Locale }) {
  const review = station.reviewedFacts;
  if (!review) return null;
  const t = messages[locale];
  const old = review.osm;
  const stale = Date.now() - Date.parse(review.checkedAt) > 90 * 86400000;
  return <aside className="station-reviewed field-help" data-testid="station-reviewed">
    <p><a href={review.url} target="_blank" rel="noopener noreferrer">{t.stationOfficialSource}</a> · <time dateTime={review.checkedAt}>{review.checkedAt}</time></p>
    <p>{t.stationReviewScope}</p>{stale && <p role="alert">{t.stationReviewStale}</p>}
    <details><summary>{t.stationOsmOriginal}</summary><dl>
      <div><dt>{t.ffStationName}</dt><dd lang="ja">{old.name ?? t.ffUnnamed}</dd></div>
      <div><dt>{t.ffAddress}</dt><dd lang="ja">{old.address ?? t.ffUnknown}</dd></div>
      <div><dt>{t.ffHours}</dt><dd><code className="hours-raw">{old.openingHours ?? t.ffUnknown}</code></dd></div>
      <div><dt>{t.ffService}</dt><dd>{t[old.serviceType === "SELF" ? "ffSelf" : old.serviceType === "FULL" ? "ffFull" : "ffUnknown"]}</dd></div>
      <div><dt>{t.ffStationUpdated}</dt><dd><time dateTime={old.sourceUpdatedAt}>{old.sourceUpdatedAt}</time></dd></div>
    </dl><a href={`https://www.openstreetmap.org/${old.osmType}/${old.osmId}`} target="_blank" rel="noopener noreferrer">© OpenStreetMap</a></details>
  </aside>;
}
