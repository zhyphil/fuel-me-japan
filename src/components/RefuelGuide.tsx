import { useEffect, useRef } from "react";
import { messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { fieldGuideProvenance, guideFuelLabels, guideLinks, guideMachineLabels, guideSteps } from "../lib/field-guide";
import type { FuelType } from "../lib/stations";
import { fuelDisplayName } from "./FuelPrice";
import { Icon } from "./Icon";

export function RefuelGuide({ locale, selectedFuels, trigger, onClose }: { locale: Locale; selectedFuels: readonly FuelType[]; trigger: HTMLButtonElement; onClose: () => void }) {
  const t = messages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const panel = dialog.current!;
    panel.showModal();
    closeButton.current?.focus();
    analytics.track("refuel_guide_open", { locale });
    return () => { panel.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger, locale]);
  function complete() { analytics.track("refuel_guide_complete", { locale }); onClose(); }
  const reviewDate = new Date(`${fieldGuideProvenance.reviewDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  return <dialog ref={dialog} className="my-fuel-dialog refuel-guide-dialog" aria-labelledby="refuel-guide-title" aria-describedby="refuel-guide-preference-help" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="my-fuel-header">
      <h2 id="refuel-guide-title"><Icon name="guide" />{t.rgTitle}</h2>
      <button ref={closeButton} type="button" className="button" aria-label={t.rgClose} onClick={onClose}><Icon name="close" /></button>
    </header>
    <div className="my-fuel-body refuel-guide-body">
      <aside className="refuel-guide-preference">
        <p><strong>{selectedFuels.length > 1 ? t.rgMultiple : t.rgPreference}</strong></p>
        <ul>{selectedFuels.map((fuel) => <li key={fuel}>{fuelDisplayName(fuel, locale)}</li>)}</ul>
        <p id="refuel-guide-preference-help">{t.rgPreferenceHelp}</p>
      </aside>
      <ol className="refuel-guide-steps">
        {guideSteps.map((step, index) => <li key={step.title}>
          <h3>{t[step.title]}</h3><p>{t[step.body]}</p>
          {index === 0 && <>
            <dl className="refuel-guide-labels" aria-label={t.rgLabels}>{guideFuelLabels.map((label) => <div key={label.key}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl>
            <p className="refuel-guide-caution">{t.rgLightVehicle}</p>
          </>}
          {index === 2 && <dl className="refuel-guide-labels">{guideMachineLabels.map((label) => <div key={label.key}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl>}
        </li>)}
      </ol>
      <p className="refuel-guide-staff">{t.rgStaff}</p>
      <section className="refuel-guide-misfuel" aria-labelledby="refuel-guide-misfuel-title"><h3 id="refuel-guide-misfuel-title">{t.rgMisfuelTitle}</h3><p>{t.rgMisfuelBody}</p></section>
      <footer className="refuel-guide-sources">
        <p>{t.rgReviewed.replace("{date}", reviewDate)}</p>
        <p>{t.rgAttribution}</p>
        <div className="refuel-guide-links">
          <a href={guideLinks.safety} target="_blank" rel="noopener noreferrer">{t.rgSourceSafety}</a>
          <a href={guideLinks.steps} target="_blank" rel="noopener noreferrer">{t.rgSourceSteps}</a>
          <a href={guideLinks.terms} target="_blank" rel="noopener noreferrer">{t.rgSourceTerms}</a>
          <a href={guideLinks.jaf} target="_blank" rel="noopener noreferrer">{t.rgSourceJaf}</a>
        </div>
      </footer>
      <button type="button" className="button button-primary refuel-guide-complete" onClick={complete}>{t.rgComplete}</button>
    </div>
  </dialog>;
}
