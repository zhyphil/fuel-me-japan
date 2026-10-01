import { useEffect } from "react";
import { messages, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { fieldGuideProvenance, guideFuelLabels, guideLinks, guideMachineLabels, guideSteps } from "../lib/field-guide";
import { GuideAdPlacement } from "./GuideAdPlacement";
import { Icon } from "./Icon";

export function RefuelGuide({ locale }: { locale: Locale }) {
  const t = messages[locale];
  useEffect(() => { analytics.track("refuel_guide_open", { locale }); }, [locale]);
  const reviewDate = new Date(`${fieldGuideProvenance.reviewDate}T00:00:00Z`).toLocaleDateString(locale, { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
  return <article className="refuel-guide-page" aria-labelledby="refuel-guide-title">
    <header className="refuel-guide-intro">
      <h1 id="refuel-guide-title"><Icon name="guide" />{t.rgTitle}</h1>
      <p>{t.rgIntro}</p>
    </header>
    <div className="refuel-guide-body">
      <ol className="refuel-guide-steps">
        {guideSteps.map((step, index) => <li key={step.title}>
          <h2>{t[step.title]}</h2><p>{t[step.body]}</p>
          {index === 0 && <>
            <dl className="refuel-guide-labels" aria-label={t.rgLabels}>{guideFuelLabels.map((label) => <div key={label.key}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl>
            <p className="refuel-guide-caution">{t.rgLightVehicle}</p>
          </>}
          {index === 2 && <dl className="refuel-guide-labels">{guideMachineLabels.map((label) => <div key={label.key}><dt lang="ja">{label.japanese}</dt><dd>{t[label.key]}</dd></div>)}</dl>}
        </li>)}
      </ol>
      <p className="refuel-guide-staff">{t.rgStaff}</p>
      <section className="refuel-guide-misfuel" aria-labelledby="refuel-guide-misfuel-title"><h2 id="refuel-guide-misfuel-title">{t.rgMisfuelTitle}</h2><p>{t.rgMisfuelBody}</p></section>
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
      <a className="button button-primary refuel-guide-complete" href={`/${locale}/`} onClick={() => analytics.track("refuel_guide_complete", { locale })}>{t.rgComplete}</a>
      <GuideAdPlacement locale={locale} />
    </div>
  </article>;
}
