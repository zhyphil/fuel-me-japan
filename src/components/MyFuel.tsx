import { useEffect, useRef, useState } from "react";
import { japaneseLabels, messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { loadVehicleData } from "../lib/vehicle-data";
import { emptyVehicleSelection, resolveVehicleFuel, type VehicleData, type VehicleResult, type VehicleSelection } from "../lib/vehicle-fuel";
import { Icon } from "./Icon";
import { fuelTypes } from "../lib/find-fuel";
import { isFuelType } from "../lib/fuel-preference";
import type { FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";

const fuelLabels = {
  REGULAR: { japanese: japaneseLabels.regular, key: "myFuelRegular" },
  HIGH_OCTANE: { japanese: japaneseLabels.highOctane, key: "myFuelHighOctane" },
  DIESEL: { japanese: japaneseLabels.diesel, key: "myFuelDiesel" },
} as const;
const unique = (values: string[]) => [...new Set(values)].sort();

// Manual display preference is shared with the map. Vehicle verification stays session-only and independent.
export function MyFuel({ locale, fuel, onFuelChange, trigger, onClose }: { locale: Locale; fuel: FuelType | null; onFuelChange: (fuel: FuelType) => void; trigger: HTMLButtonElement; onClose: () => void }) {
  const t = messages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [data, setData] = useState<VehicleData | null>(null);
  const [selection, setSelection] = useState(emptyVehicleSelection);
  const [result, setResult] = useState<VehicleResult | null>(null);
  useEffect(() => {
    const panel = dialog.current!;
    panel.showModal(); closeButton.current?.focus();
    analytics.track("my_fuel_start", { locale });
    return () => { panel.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger, locale]);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void loadVehicleData(controller.signal).then((loaded) => {
      if (!active) return;
      setData(loaded); setStatus("ready");
      if (!loaded.mappings.records.length) analytics.track("my_fuel_unknown", { locale });
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; controller.abort(); };
  }, [attempt, locale]);
  function clear() { setSelection(emptyVehicleSelection()); setResult(null); }
  function retry() { clear(); setData(null); setStatus("loading"); setAttempt((value) => value + 1); }
  function change(field: keyof VehicleSelection, value: string) {
    setResult(null);
    setSelection((current) => {
      if (field === "rentalCompany") return { ...emptyVehicleSelection(), rentalCompany: value || null };
      if (field === "make") return { ...current, make: value, model: "", variant: "", modelYear: null };
      if (field === "model") return { ...current, model: value, variant: "", modelYear: null };
      if (field === "variant") return { ...current, variant: value, modelYear: null };
      return { ...current, modelYear: value ? Number(value) : null };
    });
  }
  const rows = data?.mappings.records ?? [];
  const scoped = rows.filter((row) => row.rentalCompany === null || row.rentalCompany === selection.rentalCompany);
  const models = scoped.filter((row) => row.make === selection.make);
  const variants = models.filter((row) => row.model === selection.model);
  const exact = variants.filter((row) => row.variant === selection.variant);
  const years = [...new Set(exact.flatMap((row) => Array.from({ length: row.modelYearTo - row.modelYearFrom + 1 }, (_, i) => row.modelYearFrom + i)))].sort((a, b) => b - a);
  const complete = !!(selection.make && selection.model && selection.variant && selection.modelYear);
  const verified = result?.status === "VERIFIED" && result.mapping.fuelType !== "UNKNOWN" ? result : null;
  return <dialog ref={dialog} className="my-fuel-dialog" aria-labelledby="my-fuel-title" aria-describedby="my-fuel-guidance" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="my-fuel-header"><h2 id="my-fuel-title"><Icon name="fuel" />{t.myFuelTitle}</h2><button ref={closeButton} type="button" className="button" aria-label={t.myFuelClose} onClick={onClose}><Icon name="close" /></button></header>
    <div className="my-fuel-body">
      <div className="my-fuel-preference">
        <label htmlFor="my-fuel-preference">{t.myFuelPreference}</label>
        <select id="my-fuel-preference" value={fuel ?? ""} aria-describedby="my-fuel-preference-help" onChange={(event) => { const value = event.currentTarget.value; if (isFuelType(value)) onFuelChange(value); }}>{fuel === null && <option value="" disabled>{t.myFuelPreferenceChoose}</option>}{fuelTypes.map((type) => <option key={type} value={type}>{fuelDisplayName(type, locale)}</option>)}</select>
        <p className="field-help" id="my-fuel-preference-help">{t.myFuelPreferenceHelp}</p>
      </div>
      <p className="my-fuel-guidance" id="my-fuel-guidance">{t.myFuelGuidance}</p>
      <p className="field-help">{t.myFuelSession}</p>
      <div role="status" aria-live="polite" aria-atomic="true">
        {status === "loading" && <p>{t.myFuelLoading}</p>}
        {status === "ready" && !rows.length && <div className="notice-box"><h3>{t.myFuelEmptyTitle}</h3><p>{t.myFuelEmpty}</p></div>}
      </div>
      {status === "error" && <div role="alert" className="notice-box"><p>{t.myFuelError}</p><button className="button" type="button" onClick={retry}>{t.myFuelRetry}</button></div>}
      {status === "ready" && rows.length > 0 && <form className="my-fuel-form" onSubmit={(event) => {
        event.preventDefault();
        if (!data) return;
        const next = resolveVehicleFuel(selection, data); setResult(next);
        analytics.track(next.status === "VERIFIED" ? "my_fuel_success" : "my_fuel_unknown", { locale });
      }}>
        <p className="field-help">{t.myFuelExactHelp}</p>
        <label>{t.myFuelCompany}<select value={selection.rentalCompany ?? ""} onChange={(event) => change("rentalCompany", event.currentTarget.value)}><option value="">{t.myFuelNoCompany}</option>{unique(rows.flatMap((row) => row.rentalCompany ? [row.rentalCompany] : [])).map((value) => <option key={value}>{value}</option>)}</select></label>
        {([
          { field: "make", label: t.myFuelMake, values: unique(scoped.map((row) => row.make)), disabled: false },
          { field: "model", label: t.myFuelModel, values: unique(models.map((row) => row.model)), disabled: !selection.make },
          { field: "variant", label: t.myFuelVariant, values: unique(variants.map((row) => row.variant)), disabled: !selection.model },
        ] as const).map(({ field, label, values, disabled }) => <label key={field}>{label}<select required value={selection[field]} disabled={disabled} onChange={(event) => change(field, event.currentTarget.value)}><option value="">{t.myFuelChoose}</option>{values.map((value) => <option key={value}>{value}</option>)}</select></label>)}
        <label>{t.myFuelYear}<select required disabled={!selection.variant} value={selection.modelYear ?? ""} onChange={(event) => change("modelYear", event.currentTarget.value)}><option value="">{t.myFuelChoose}</option>{years.map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
        <div className="my-fuel-actions"><button type="submit" className="button button-primary" disabled={!complete}>{t.myFuelCheck}</button><button type="button" className="button" onClick={clear}>{t.myFuelClear}</button><button type="button" className="button button-quiet" onClick={retry}>{t.myFuelReload}</button></div>
      </form>}
      <div role="status" aria-live="polite" aria-atomic="true">
        {result?.status === "UNKNOWN" && <section className="notice-box" data-testid="my-fuel-result"><h3>{t.myFuelUnknown}</h3><p>{t.myFuelUnknownHelp}</p></section>}
        {verified && <section className="my-fuel-result" data-testid="my-fuel-result"><h3>{t.myFuelVerified}</h3><p>{selection.rentalCompany && `${selection.rentalCompany} · `}{selection.make} · {selection.model} · {selection.variant} · {selection.modelYear}</p><p><strong lang="ja">{fuelLabels[verified.mapping.fuelType as keyof typeof fuelLabels].japanese}</strong> — {t[fuelLabels[verified.mapping.fuelType as keyof typeof fuelLabels].key]}</p><p>{t.myFuelVerifiedAt} <time dateTime={verified.mapping.verifiedAt!}>{verified.mapping.verifiedAt}</time></p><p>{t.myFuelSource} <a href={verified.evidence.url} target="_blank" rel="noopener noreferrer">{verified.source.owner}</a></p><p className="field-help">{verified.source.attribution}</p><p>{t.myFuelConfirm}</p></section>}
      </div>
      <section className="my-fuel-labels" aria-labelledby="my-fuel-labels-title"><h3 id="my-fuel-labels-title">{t.myFuelLabels}</h3><p className="field-help">{t.myFuelLabelsHelp}</p><dl>{Object.entries(fuelLabels).map(([fuel, label]) => <div key={fuel}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl></section>
    </div>
  </dialog>;
}
