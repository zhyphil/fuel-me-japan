import { useEffect, useRef } from "react";
import { messages, type Locale } from "../i18n";
import { fuelTypes } from "../lib/find-fuel";
import type { FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";

export function FuelSelection({ fuels, locale, onChange }: { fuels: readonly FuelType[]; locale: Locale; onChange: (fuels: FuelType[]) => void }) {
  const t = messages[locale];
  const panel = useRef<HTMLDetailsElement>(null);
  const pointerInside = useRef(false);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      pointerInside.current = event.target instanceof Node && !!panel.current?.contains(event.target);
      if (!pointerInside.current) panel.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeOutside, true);
    return () => document.removeEventListener("pointerdown", closeOutside, true);
  }, []);
  return <div className="fuel-field">
    <span className="fuel-field-label" id="fuel-selection-label">{t.fpFuel}</span>
    <details className="fuel-selection" id="display-fuel" ref={panel}
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (!pointerInside.current) panel.current?.removeAttribute("open");
        else queueMicrotask(() => {
          const current = panel.current;
          if (pointerInside.current && current?.open && !current.contains(document.activeElement)) current.querySelector("summary")?.focus({ preventScroll: true });
        });
      }}
      onKeyDown={(event) => { pointerInside.current = false; if (event.key === "Escape") { event.preventDefault(); panel.current?.removeAttribute("open"); panel.current?.querySelector("summary")?.focus(); } }}>
      <summary aria-labelledby="fuel-selection-label fuel-selection-value"><span id="fuel-selection-value">{fuels.length === 3 ? t.mfAll : fuels.length === 1 ? fuelDisplayName(fuels[0], locale) : t.mfSelected.replace("{count}", String(fuels.length))}</span></summary>
      {/* Native label/input activation may focus the background on Safari. An
          internal pointer press keeps the panel open; keyboard/outside focus
          still closes it, without cancelling touch-generated native clicks. */}
      <fieldset className="fuel-options" aria-describedby="fuel-selection-help"><legend className="sr-only">{t.fpFuel}</legend>
        <button type="button" className="text-button" disabled={fuels.length === 3} onClick={() => onChange([...fuels, ...fuelTypes.filter((fuel) => !fuels.includes(fuel))])}>{t.mfSelectAll}</button>
        {fuelTypes.map((fuel) => <label key={fuel}><input type="checkbox" value={fuel} checked={fuels.includes(fuel)} disabled={fuels.length === 1 && fuels.includes(fuel)} onChange={(event) => onChange(event.target.checked ? [...fuels, fuel] : fuels.filter((item) => item !== fuel))} />{fuelDisplayName(fuel, locale)}</label>)}
        <p id="fuel-selection-help">{t.mfHelp}</p>
      </fieldset>
    </details>
  </div>;
}
