import { messages, type Locale } from "../i18n";
import { prefectureName } from "../lib/find-fuel";
import { rentalManifestUrl, type RentalManifest } from "../lib/rental";
import type { PartitionCode } from "../lib/stations";
export function RentalSources({ manifest, locale }: { manifest: RentalManifest; locale: Locale }) {
  const t = messages[locale];
  return <details className="rental-sources"><summary>{t.rdSources}</summary><p>{t.rdLicenseHelp}</p><p>{t.rdScope}</p>
    <ul>{manifest.sources.map(source => <li key={source.id}><a href={source.url} target="_blank" rel="noopener noreferrer">{source.name}</a> · <time dateTime={source.sourceDate}>{source.sourceDate}</time><p>{source.id === "times-official" ? t.rdLimitedFacts : source.attribution}</p></li>)}</ul>
    <p><a href={rentalManifestUrl} download>{t.ffManifest}</a> · <a href={manifest.notice.url}>{t.rcNotice}</a></p>
    <ul className="rental-license-links">{manifest.licenses.map(item => <li key={item.url}><a href={item.url}>{item.url.split("/").pop()}</a></li>)}</ul>
    <details><summary>{t.ffDownloads}</summary><p>{t.rdDownloadHelp}</p><ul className="download-list">{manifest.downloads.map(item => { const partition = manifest.partitions.find(p => p.url === item.url); return <li key={item.url}><a href={item.url} download>{partition ? prefectureName(partition.code as PartitionCode) || t.ffUnknown : item.url.split("/").pop()}</a></li>; })}</ul></details>
  </details>;
}
