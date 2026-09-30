import { useEffect, useState } from "react";
import { messages, type Locale } from "./i18n";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { Icon } from "./components/Icon";
import { analytics } from "./lib/analytics";
import { FindFuel } from "./components/FindFuel";
import { MyFuel } from "./components/MyFuel";
import { ReturnCar } from "./components/ReturnCar";
import { RefuelGuide } from "./components/RefuelGuide";
import { DEFAULT_FUEL, readFuelPreference, resetFuelPreference, saveFuelPreference } from "./lib/fuel-preference";
import type { FuelType } from "./lib/stations";

export function App({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const [selectedFuels, setSelectedFuels] = useState<FuelType[]>([DEFAULT_FUEL]);
  useEffect(() => { setSelectedFuels(readFuelPreference()); }, []);
  function changeFuels(fuels: FuelType[]) { setSelectedFuels(fuels); saveFuelPreference(fuels); }
  function resetFuels() { resetFuelPreference(); setSelectedFuels([DEFAULT_FUEL]); }
  const [myFuelTrigger, setMyFuelTrigger] = useState<HTMLButtonElement | null>(null);
  const [returnTrigger, setReturnTrigger] = useState<HTMLButtonElement | null>(null);
  const [guideTrigger, setGuideTrigger] = useState<HTMLButtonElement | null>(null);
  useEffect(() => { analytics.track("landing_view", { locale }); }, [locale]);
  return <>
    <a className="skip-link" href="#main">{t.skip}</a>
    <header className="site-header map-header">
      <a className="brand" href={`/${locale}/`} aria-label="Fuel Me Japan"><span className="brand-mark"><Icon name="pump" /></span><span>Fuel Me <b>Japan</b><i aria-hidden="true" /></span></a>
      <button type="button" className="button my-fuel-trigger" aria-haspopup="dialog" onClick={(event) => setMyFuelTrigger(event.currentTarget)}><Icon name="fuel" /><span>{t.myFuelTitle}</span></button>
      <LocaleSwitcher locale={locale} label={t.language} />
    </header>
    <main id="main" className="map-main" tabIndex={-1}>
      <div className="field-tools"><button type="button" className="button button-quiet" aria-haspopup="dialog" onClick={(event) => setGuideTrigger(event.currentTarget)}><Icon name="guide" /><span>{t.rgTitle}</span></button><button type="button" className="button button-quiet" aria-haspopup="dialog" onClick={(event) => setReturnTrigger(event.currentTarget)}><Icon name="return" /><span>{t.rcTitle}</span></button></div>
      <FindFuel locale={locale} selectedFuels={selectedFuels} onChangeFuels={changeFuels} onResetFuels={resetFuels} />
      <noscript><p className="notice-box">{t.ffNoJavaScript}</p></noscript>
    </main>
    {myFuelTrigger && <MyFuel locale={locale} fuel={selectedFuels.length === 1 ? selectedFuels[0] : null} onFuelChange={(fuel) => changeFuels([fuel])} trigger={myFuelTrigger} onClose={() => setMyFuelTrigger(null)} />}
    {returnTrigger && <ReturnCar locale={locale} fuel={selectedFuels.length === 1 ? selectedFuels[0] : null} trigger={returnTrigger} onClose={() => setReturnTrigger(null)} />}
    {guideTrigger && <RefuelGuide locale={locale} selectedFuels={selectedFuels} trigger={guideTrigger} onClose={() => setGuideTrigger(null)} />}
  </>;
}
