import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { messages, type Locale } from "./i18n";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { Icon } from "./components/Icon";
import { analytics } from "./lib/analytics";
import { FindFuel } from "./components/FindFuel";
import { MyFuel } from "./components/MyFuel";
import { About } from "./components/About";
import { RefuelGuide } from "./components/RefuelGuide";
import { DEFAULT_FUEL, readFuelPreference, resetFuelPreference, saveFuelPreference } from "./lib/fuel-preference";
import type { FuelType } from "./lib/stations";

import { aboutHref, guideHref, localizedHref, navigate, parseRoute, rentalHref, routeEvent, updateRouteMetadata, type AppRoute } from "./lib/routes";
const RentalBusiness = lazy(() => import("./components/RentalBusiness"));

export function App({ locale: initialLocale, initialRoute, rentalShell = false }: { locale: Locale; initialRoute?: AppRoute; rentalShell?: boolean }) {
  const [route, setRoute] = useState(() => initialRoute ?? parseRoute(`/${initialLocale}/`));
  const locale = route.locale;
  const home = route.kind === "home";
  const informationPage = route.kind === "guide" || route.kind === "about";
  const [homeVisited, setHomeVisited] = useState(home);
  const [myFuelTrigger, setMyFuelTrigger] = useState<HTMLButtonElement | null>(null);
  useEffect(() => {
    const sync = () => { const next = parseRoute(window.location.pathname, window.location.search); setRoute(next); setMyFuelTrigger(null); if (next.kind === "home") setHomeVisited(true); };
    const click = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || target.hasAttribute("download") || (target.target && target.target !== "_self")) return;
      const url = new URL(target.href, window.location.href);
      if (url.origin !== window.location.origin || !/^\/(en|zh-Hant|ko|zh-Hans|th)\/(?:return-car(?:\/.*)?|(?:refuel-guide|about)\/?)?$/.test(url.pathname)) return;
      // Let same-page anchors perform their native scrolling and keyboard focus transfer.
      if (url.hash && url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      const saved = history.state?.returnTo;
      if (target.hasAttribute("data-return-directory") && saved?.href === url.pathname + url.search && typeof saved.scrollY === "number" && typeof saved.focusId === "string") navigate(saved.href, false, saved);
      else {
        // Pointer activation does not focus links in WebKit; preserve the clicked card explicitly.
        const originFocusId = target.closest(".rental-card")?.querySelector<HTMLAnchorElement>("h2 a")?.id || target.id;
        navigate(url.href, false, undefined, originFocusId || undefined);
      }
    };
    const prior = history.scrollRestoration; history.scrollRestoration = "manual";
    window.addEventListener("popstate", sync); window.addEventListener(routeEvent, sync); document.addEventListener("click", click);
    return () => { history.scrollRestoration = prior; window.removeEventListener("popstate", sync); window.removeEventListener(routeEvent, sync); document.removeEventListener("click", click); };
  }, []);
  const previousPath = useRef(route.pathname);
  useEffect(() => {
    const pathChanged = previousPath.current !== route.pathname; previousPath.current = route.pathname;
    updateRouteMetadata(route);
    const frame = requestAnimationFrame(() => {
      if (window.location.hash) return;
      window.scrollTo(0, typeof history.state?.scrollY === "number" ? history.state.scrollY : 0);
      if (history.state?.focusId) document.getElementById(history.state.focusId)?.focus({ preventScroll: true });
      else if (pathChanged) document.getElementById("main")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [route]);
  const t = messages[locale];
  const [selectedFuels, setSelectedFuels] = useState<FuelType[]>([DEFAULT_FUEL]);
  const [mapTileUrl, setMapTileUrl] = useState<string | null | undefined>(undefined);
  useEffect(() => { setSelectedFuels(readFuelPreference()); }, []);
  function changeFuels(fuels: FuelType[]) { setSelectedFuels(fuels); saveFuelPreference(fuels); }
  function resetFuels() { resetFuelPreference(); setSelectedFuels([DEFAULT_FUEL]); }
  useEffect(() => { analytics.track("landing_view", { locale }); }, [locale]);
  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <header className="site-header map-header">
      <a className="brand" href={`/${locale}/`} aria-label="Fuel Me Japan"><span className="brand-mark"><Icon name="pump" /></span><span>Fuel Me <b>Japan</b><i aria-hidden="true" /></span></a>
      <nav className="primary-navigation" aria-label={t.navPrimary}>
        <a id="find-fuel-link" href={`/${locale}/`} aria-current={home ? "page" : undefined}>{t.navFindFuel}</a>
        <a id="return-car-link" href={rentalHref(locale)} aria-current={route.kind === "directory" || route.kind === "detail" ? "page" : undefined}>{t.rcTitle}</a>
        <a id="refuel-guide-link" href={guideHref(locale)} aria-current={route.kind === "guide" ? "page" : undefined}>{t.rgTitle}</a>
        <a id="about-link" href={aboutHref(locale)} aria-current={route.kind === "about" ? "page" : undefined}>{t.navAbout}</a>
      </nav>
      <LocaleSwitcher locale={locale} label={t.language} hrefForLocale={option => localizedHref(route, option)} />
    </header>
    <main id="main" className={home ? "map-main" : informationPage ? "information-main" : "rental-main"} tabIndex={-1}>
      {(homeVisited || home) && <div className="fuel-home-host" hidden={!home}>
      <FindFuel onOpenMyFuel={setMyFuelTrigger} locale={locale} mapTileUrl={mapTileUrl} onTileProvider={setMapTileUrl} selectedFuels={selectedFuels} onChangeFuels={changeFuels} onResetFuels={resetFuels} />
      <noscript><p className="notice-box">{t.ffNoJavaScript}</p></noscript>
      </div>}
      {route.kind === "guide" && <RefuelGuide locale={locale} />}
      {route.kind === "about" && <About locale={locale} />}
      {!home && !informationPage && <Suspense fallback={<RentalShell locale={locale} />}>
        {rentalShell ? <RentalShell locale={locale} /> : <RentalBusiness route={route} fuel={selectedFuels.length === 1 ? selectedFuels[0] : null} />}
      </Suspense>}
    </main>
    {home && myFuelTrigger && <MyFuel locale={locale} fuel={selectedFuels.length === 1 ? selectedFuels[0] : null} onFuelChange={(fuel) => changeFuels([fuel])} trigger={myFuelTrigger} onClose={() => setMyFuelTrigger(null)} />}
  </>;
}

function RentalShell({ locale }: { locale: Locale }) { const t = messages[locale]; return <div className="rental-business"><header className="rental-intro"><h1>{t.rdTitle}</h1><p>{t.rdIntro}</p></header><p role="status">{t.rcLoading}</p></div>; }
