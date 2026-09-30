import { useEffect, useRef } from "react";
import { japaneseLabels, messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
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

// Manual display preference is shared with the map; it is not a vehicle fuel recommendation.
export function MyFuel({ locale, fuel, onFuelChange, trigger, onClose }: { locale: Locale; fuel: FuelType | null; onFuelChange: (fuel: FuelType) => void; trigger: HTMLButtonElement; onClose: () => void }) {
  const t = messages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const panel = dialog.current!;
    panel.showModal(); closeButton.current?.focus();
    analytics.track("my_fuel_start", { locale });
    return () => { panel.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger, locale]);
  return <dialog ref={dialog} className="my-fuel-dialog" aria-labelledby="my-fuel-title" aria-describedby="my-fuel-guidance" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="my-fuel-header"><h2 id="my-fuel-title"><Icon name="fuel" />{t.myFuelTitle}</h2><button ref={closeButton} type="button" className="button" aria-label={t.myFuelClose} onClick={onClose}><Icon name="close" /></button></header>
    <div className="my-fuel-body">
      <div className="my-fuel-preference">
        <label htmlFor="my-fuel-preference">{t.myFuelPreference}</label>
        <select id="my-fuel-preference" value={fuel ?? ""} aria-describedby="my-fuel-preference-help" onChange={(event) => { const value = event.currentTarget.value; if (isFuelType(value)) onFuelChange(value); }}>{fuel === null && <option value="" disabled>{t.myFuelPreferenceChoose}</option>}{fuelTypes.map((type) => <option key={type} value={type}>{fuelDisplayName(type, locale)}</option>)}</select>
        <p className="field-help" id="my-fuel-preference-help">{t.myFuelPreferenceHelp}</p>
      </div>
      <p className="my-fuel-guidance" id="my-fuel-guidance">{t.myFuelGuidance}</p>
      <section className="my-fuel-labels" aria-labelledby="my-fuel-labels-title"><h3 id="my-fuel-labels-title">{t.myFuelLabels}</h3><p className="field-help">{t.myFuelLabelsHelp}</p><dl>{Object.entries(fuelLabels).map(([fuel, label]) => <div key={fuel}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl></section>
    </div>
  </dialog>;
}
