import { useEffect } from "react";
import { messages, type Locale } from "./i18n";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { Icon } from "./components/Icon";
import { analytics } from "./lib/analytics";
import { FindFuel } from "./components/FindFuel";

export function App({ locale }: { locale: Locale }) {
  const t = messages[locale];
  useEffect(() => { analytics.track("landing_view", { locale }); }, [locale]);
  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <header className="site-header map-header">
      <a className="brand" href={`/${locale}/`} aria-label="Fuel Me Japan"><span className="brand-mark"><Icon name="pump" /></span><span>Fuel Me <b>Japan</b><i aria-hidden="true" /></span></a>
      <LocaleSwitcher locale={locale} label={t.language} />
    </header>
    <main id="main" className="map-main" tabIndex={-1}>
      <FindFuel locale={locale} />
      <noscript><p className="notice-box">{t.ffNoJavaScript}</p></noscript>
    </main>
  </>;
}
