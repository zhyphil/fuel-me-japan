import { useEffect } from "react";
import { messages, type Locale } from "./i18n";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { TaskCard } from "./components/TaskCard";
import { Icon } from "./components/Icon";
import { analytics } from "./lib/analytics";
export function App({ locale }: { locale: Locale }) {
  const t = messages[locale];
  useEffect(() => {
    analytics.track("landing_view", { locale });
  }, [locale]);
  return (
    <>
      <a className="skip-link" href="#main">
        {t.skip}
      </a>
      <header className="site-header">
        <a className="brand" href={`/${locale}/`} aria-label="Fuel Me Japan">
          <span className="brand-mark">
            <Icon name="pump" />
          </span>
          <span>
            Fuel Me <b>Japan</b>
            <i aria-hidden="true" />
          </span>
        </a>
        <LocaleSwitcher locale={locale} label={t.language} />
      </header>
      <main id="main">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">{t.eyebrow}</p>
            <h1 id="hero-title">
              {t.title}
              <br />
              <em>{t.titleAccent}</em>
            </h1>
            <p className="intro">{t.intro}</p>
            <span className="preview-badge">
              <span />
              {t.preview}
            </span>
          </div>
          <div className="road-scene" aria-hidden="true">
            <div className="sun" />
            <div className="mountain mountain-back" />
            <div className="mountain" />
            <div className="road" />
            <div className="scene-sign">
              <Icon name="pump" />
              <span>FUEL</span>
            </div>
            <div className="scene-caption">JAPAN / 日本</div>
          </div>
        </section>
        <section className="journey" aria-labelledby="journey-title">
          <div className="section-heading">
            <h2 id="journey-title">{t.section}</h2>
            <span aria-hidden="true">01 — 04</span>
          </div>
          <p className="availability" id="availability">
            {t.notice}
          </p>
          <div className="task-grid" aria-describedby="availability">
            <TaskCard
              icon="pump"
              title={t.findTitle}
              description={t.findBody}
              status={t.soon}
              primary
            />
            <TaskCard
              icon="return"
              title={t.returnTitle}
              description={t.returnBody}
              status={t.soon}
            />
            <TaskCard
              icon="fuel"
              title={t.fuelTitle}
              description={t.fuelBody}
              status={t.soon}
            />
            <TaskCard
              icon="guide"
              title={t.helpTitle}
              description={t.helpBody}
              status={t.soon}
            />
          </div>
        </section>
        <aside className="promise">
          <span className="promise-symbol" aria-hidden="true">
            ◎
          </span>
          <div>
            <h2>{t.promise}</h2>
            <p>{t.promiseBody}</p>
          </div>
        </aside>
        <details className="source-notes">
          <summary>{t.sources}</summary>
          <p>{t.sourcesBody}</p>
          <a href="/data/source-registry.json">{t.registry}</a>
        </details>
      </main>
      <footer>
        <p className="footer-brand">
          Fuel Me Japan <span>·</span> {t.footer}
        </p>
        <p>{t.privacy}</p>
      </footer>
    </>
  );
}
