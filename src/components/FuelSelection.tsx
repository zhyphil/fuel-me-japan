import { useEffect, useRef } from "react";
import { messages, type Locale } from "../i18n";
import { fuelTypes } from "../lib/find-fuel";
import type { FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";

export function FuelSelection({ fuels, locale, onChange }: { fuels: readonly FuelType[]; locale: Locale; onChange: (fuels: FuelType[]) => void }) {
  const t = messages[locale];
  const panel = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target)) panel.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  return <div className="fuel-field">
    <span className="fuel-field-label" id="fuel-selection-label">{t.fpFuel}</span>
    <details className="fuel-selection" id="display-fuel" ref={panel}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) panel.current?.removeAttribute("open"); }}
      onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); panel.current?.removeAttribute("open"); panel.current?.querySelector("summary")?.focus(); } }}>
      <summary aria-labelledby="fuel-selection-label fuel-selection-value"><span id="fuel-selection-value">{fuels.length === 3 ? t.mfAll : fuels.length === 1 ? fuelDisplayName(fuels[0], locale) : t.mfSelected.replace("{count}", String(fuels.length))}</span></summary>
      <fieldset className="fuel-options" aria-describedby="fuel-selection-help" onPointerDownCapture={(event) => {
        // Text/padding presses otherwise focus #main and synchronously close
        // details during native mouse handling, which crashes Chromium.
        // Keep native focus for controls and native click activation for labels.
        if (!(event.target instanceof Element) || !event.target.closest("input:not(:disabled), button:not(:disabled)")) event.preventDefault();
      }}><legend className="sr-only">{t.fpFuel}</legend>
        <button type="button" className="text-button" disabled={fuels.length === 3} onClick={() => onChange([...fuels, ...fuelTypes.filter((fuel) => !fuels.includes(fuel))])}>{t.mfSelectAll}</button>
        {fuelTypes.map((fuel) => <label key={fuel}><input type="checkbox" value={fuel} checked={fuels.includes(fuel)} disabled={fuels.length === 1 && fuels.includes(fuel)} onChange={(event) => onChange(event.target.checked ? [...fuels, fuel] : fuels.filter((item) => item !== fuel))} />{fuelDisplayName(fuel, locale)}</label>)}
        <p id="fuel-selection-help">{t.mfHelp}</p>
      </fieldset>
    </details>
  </div>;
}
