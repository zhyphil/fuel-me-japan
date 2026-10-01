import { useEffect, useState } from "react";
import { messages } from "../i18n";
import { loadRentalIndex, loadRentalManifest, type RentalIndex, type RentalManifest } from "../lib/rental";
import type { AppRoute } from "../lib/routes";
import type { FuelType } from "../lib/stations";
import { RentalDirectory } from "./RentalDirectory";
import { RentalDirectoryIntro, RentalDirectoryPending } from "./RentalDirectoryFrame";
import { RentalDetail, RentalNotFound } from "./RentalDetail";
import { RentalSources } from "./RentalSources";

export default function RentalBusiness({ route, fuel }: { route: AppRoute; fuel: FuelType | null }) {
  const t = messages[route.locale];
  const [data, setData] = useState<{ manifest: RentalManifest; index: RentalIndex } | null>(null);
  const [error, setError] = useState(false); const [attempt, setAttempt] = useState(0);
  const [tileUrl, setTileUrl] = useState<string | null | undefined>(undefined);
  const [visitedDirectory, setVisitedDirectory] = useState(route.kind === "directory");
  useEffect(() => { if (route.kind === "directory") setVisitedDirectory(true); }, [route.kind]);
  useEffect(() => {
    const controller = new AbortController();
    loadRentalManifest(controller.signal).then(async manifest => ({ manifest, index: await loadRentalIndex(manifest, controller.signal) })).then(value => { if (!controller.signal.aborted) setData(value); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/runtime-map-provider.json", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Missing map provider");
      const config = await response.json();
      if (config.tileUrl !== "https://tile.openstreetmap.org/{z}/{x}/{y}.png" || config.prefetch !== false || config.offlineTiles !== false) throw new Error("Unapproved map provider");
      if (!controller.signal.aborted) setTileUrl(config.tileUrl);
    }).catch(() => { if (!controller.signal.aborted) setTileUrl(null); });
    return () => controller.abort();
  }, []);
  const retry = () => { setError(false); setAttempt(value => value + 1); };
  return <div className="rental-business">
    {route.kind === "directory" && <RentalDirectoryIntro locale={route.locale} />}
    {route.kind === "not-found" ? <RentalNotFound locale={route.locale} /> : <>
      {!data && (route.kind === "directory" ? <RentalDirectoryPending locale={route.locale} search={route.search} error={error} onRetry={retry} /> : error ? <div role="alert"><p>{t.rcError}</p><button className="button" type="button" onClick={retry}>{t.ffRetry}</button></div> : <p role="status">{t.rcLoading}</p>)}
      {data && <>{(visitedDirectory || route.kind === "directory") && <RentalDirectory index={data.index} locale={route.locale} search={route.search} tileUrl={tileUrl} active={route.kind === "directory"} />}{route.kind === "detail" && <RentalDetail key={`${route.id}:${route.locale}`} manifest={data.manifest} index={data.index} route={route} tileUrl={tileUrl} fuel={fuel} />}<RentalSources manifest={data.manifest} locale={route.locale} /></>}
    </>}
  </div>;
}
