import { useEffect, useMemo, useRef, useState } from "react";
import { FAVORITES_LIMIT, isFavorite, readFavorites, saveFavorites, type Favorite, type FavoriteNotice } from "../lib/favorites";
import { loadDataManifest, loadStationPartitions, type DataManifest, type PartitionCode, type Station } from "../lib/stations";

export function useFavorites(active: boolean, manifest: DataManifest | null) {
  const [entries, setEntries] = useState<Favorite[]>([]);
  const [notice, setNotice] = useState<FavoriteNotice>(null);
  const [limited, setLimited] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<{ status: "loading" | "ready" | "error"; stations: Station[]; manifest: DataManifest | null; key: string }>({ status: "loading", stations: [], manifest: null, key: "" });
  const generation = useRef(0);
  const entriesRef = useRef(entries);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;
  useEffect(() => {
    const initial = readFavorites();
    entriesRef.current = initial.entries;
    setEntries(initial.entries); setNotice(initial.notice);
  }, []);
  const partitions = JSON.stringify([...new Set(entries.map((entry) => entry.partition))].sort());
  useEffect(() => {
    const id = ++generation.current;
    const controller = new AbortController();
    if (active) {
      setData({ status: "loading", stations: [], manifest: null, key: partitions });
      void (async () => {
        try {
          const codes: PartitionCode[] = JSON.parse(partitions);
          // Empty favorites do not fetch even the index. Paths always come from
          // the verified manifest, never from localStorage.
          const index = codes.length ? manifestRef.current ?? await loadDataManifest(controller.signal) : manifestRef.current;
          const available = index ? codes.filter((code) => index.stations.partitions.some((entry) => entry.code === code)) : [];
          const stations = index && available.length ? await loadStationPartitions(index, available, controller.signal) : [];
          if (id === generation.current && !controller.signal.aborted) setData({ status: "ready", stations, manifest: index, key: partitions });
        } catch {
          if (id === generation.current && !controller.signal.aborted) setData({ status: "error", stations: [], manifest: null, key: partitions });
        }
      })();
    }
    return () => { generation.current++; controller.abort(); };
  }, [active, partitions, attempt]);
  const status = data.key === partitions ? data.status : "loading";
  const stations = useMemo(() => {
    if (data.key !== partitions) return [];
    const byId = new Map(data.stations.map((station) => [station.id, station]));
    return entries.flatMap((entry) => {
      const station = byId.get(entry.id);
      return station && station.prefectureCode === entry.partition ? [station] : [];
    });
  }, [data, entries, partitions]);
  const missing = useMemo(() => status === "ready" ? entries.filter((entry) => !stations.some((station) => station.id === entry.id)) : [], [status, entries, stations]);
  const ids = useMemo(() => new Set(entries.map((entry) => entry.id)), [entries]);
  function toggle(entry: Favorite) {
    if (!isFavorite(entry)) return;
    const current = entriesRef.current;
    const removing = current.some((item) => item.id === entry.id);
    if (!removing && current.length >= FAVORITES_LIMIT) { setLimited(true); return; }
    setLimited(false);
    const next = removing ? current.filter((item) => item.id !== entry.id) : [...current, entry];
    entriesRef.current = next; setEntries(next);
    setNotice(saveFavorites(next) ? null : "storage");
  }
  return { entries, ids, stations, missing, status, notice, limited, manifest: data.manifest, toggle, retry: () => setAttempt((value) => value + 1) };
}
