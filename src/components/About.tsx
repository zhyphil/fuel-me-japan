import { messages, type Locale } from "../i18n";
import brandSources from "../../public/brands/sources.json";
import { aboutHref, guideHref, rentalHref } from "../lib/routes";
import { Icon, type IconName } from "./Icon";

const contactEmail = "contact@fuel-me-japan.com";

export function About({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const features = [
    { href: `/${locale}/`, title: t.navFindFuel, body: t.aboutFindFuel, icon: "pump" },
    { href: rentalHref(locale), title: t.rcTitle, body: t.aboutReturnCar, icon: "return" },
    { href: guideHref(locale), title: t.rgTitle, body: t.aboutGuide, icon: "guide" },
  ] satisfies { href: string; title: string; body: string; icon: IconName }[];
  return <article className="about-page" aria-labelledby="about-title">
    <header className="about-intro">
      <div><h1 id="about-title">{t.aboutTitle}</h1><p className="about-lead">{t.aboutIntro}</p><p>{t.aboutMission}</p></div>
      <section className="about-contact" id="about-contact" aria-labelledby="about-contact-title">
        <h2 id="about-contact-title">{t.aboutContactTitle}</h2><p>{t.aboutContactBody}</p>
        <a className="about-email" href={`mailto:${contactEmail}`}>{contactEmail}</a>
        <p className="field-help">{t.aboutContactHelp}</p>
      </section>
    </header>
    <section aria-labelledby="about-services-title">
      <h2 id="about-services-title">{t.aboutServices}</h2>
      <div className="about-features">{features.map(feature => <a className="about-feature" key={feature.href} href={feature.href}>
        <Icon name={feature.icon} /><h3>{feature.title}<span aria-hidden="true"> →</span></h3><p>{feature.body}</p>
      </a>)}</div>
    </section>
    <div className="about-columns">
      <section className="about-panel" aria-labelledby="about-data-title">
        <h2 id="about-data-title">{t.aboutDataTitle}</h2><p>{t.aboutStationData}</p><p>{t.aboutRentalData}</p><p>{t.aboutPriceData}</p>
        <ul className="about-source-links">
          <li><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{t.aboutOsmSource}</a></li>
          <li><a href="https://docs.overturemaps.org/attribution/" target="_blank" rel="noopener noreferrer">{t.aboutOvertureSource}</a></li>
          <li><a href="https://www.enecho.meti.go.jp/statistics/petroleum_and_lpgas/pl007/results.html" target="_blank" rel="noopener noreferrer">{t.aboutPriceSource}</a></li>
        </ul>
      </section>
      <section className="about-panel" aria-labelledby="about-privacy-title">
        <h2 id="about-privacy-title">{t.aboutPrivacyTitle}</h2><p>{t.aboutPrivacy}</p><p>{t.aboutMapsPrivacy}</p>
        <a className="about-source-link" href="https://osmfoundation.org/wiki/Privacy_Policy" target="_blank" rel="noopener noreferrer">{t.aboutMapPrivacyLink}</a>
        <p>{t.aboutAdsPrivacy}</p>
        <a className="about-source-link" href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">{t.aboutAdsPrivacyLink}</a>
      </section>
    </div>
    <details className="about-panel brand-credits" id="brand-credits">
      <summary>{t.brandCreditsTitle}</summary>
      <p>{t.brandCreditsBody}</p>
      <ul className="brand-credits-list">{brandSources.assets.map(asset => <li key={asset.assetPath}>
        <strong>{asset.brand}</strong><span>{asset.attribution}</span>
        <a href={asset.licenseReference} target="_blank" rel="noopener noreferrer">{t.brandCreditsSource} · {asset.licenseAsDeclared}</a>
      </li>)}</ul>
      <a href="/brands/sources.json">{t.brandCreditsRegister}</a>
    </details>
    <section className="about-limits" aria-labelledby="about-limits-title">
      <h2 id="about-limits-title">{t.aboutLimitsTitle}</h2><p>{t.aboutLimits}</p><p>{t.aboutFuelSafety}</p><p>{t.aboutIndependent}</p>
      <a className="text-button" href={`${aboutHref(locale)}#about-contact`}>{t.aboutContactTitle}</a>
    </section>
  </article>;
}
