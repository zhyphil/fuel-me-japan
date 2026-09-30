import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { japaneseLabels, messages, type Locale, type MessageKey } from "../i18n";
import { activeFilterCount, applyStationFilters, copyStationFilters, emptyStationFilters, stationFilterOptions, UNKNOWN_BRAND, type StationFilterState } from "../lib/station-filters";
import type { Station } from "../lib/stations";
import { brandIdentities, normalizeBrandAlias } from "../lib/station-brand";
import { Icon, type IconName } from "./Icon";

const tabs = ["brands", "payments", "services"] as const;
type Tab = (typeof tabs)[number];
const tabKeys = { brands: "sfBrands", payments: "sfPayments", services: "sfServices" } as const;
const tabIcons = { brands: "brand", payments: "card", services: "service" } as const;
const unavailable: Record<Tab, { key: MessageKey; icon: IconName }[]> = {
  brands: [],
  payments: [{ key: "sfCash", icon: "cash" }, { key: "sfContactless", icon: "contactless" }, { key: "sfCheque", icon: "guide" }, { key: "sfFleetCard", icon: "card" }, { key: "sfAccount", icon: "account" }],
  services: [{ key: "sfCharging", icon: "charge" }, { key: "sfCounter", icon: "counter" }, { key: "sfTerminal", icon: "terminal" }, { key: "sfAir", icon: "air" }, { key: "sfFreeAir", icon: "air" }, { key: "sfToilet", icon: "toilet" }, { key: "sfShower", icon: "shower" }, { key: "sfBaby", icon: "baby" }, { key: "sfLaundry", icon: "laundry" }, { key: "sfTruckLane", icon: "truck" }, { key: "sfTruckParking", icon: "parking" }, { key: "sfAdBluePump", icon: "pump" }, { key: "sfAdBluePack", icon: "bottle" }, { key: "sfWash", icon: "wash" }, { key: "sfAutoWash", icon: "wash" }, { key: "sfPressureWash", icon: "wash" }],
};

export function FilterTrigger({ locale, count, disabled, onOpen }: { locale: Locale; count: number; disabled: boolean; onOpen: (trigger: HTMLButtonElement) => void }) {
  const t = messages[locale];
  return <div className="station-filter-entry"><button type="button" className="button station-filter-trigger" disabled={disabled} aria-haspopup="dialog" aria-label={count ? t.sfApplied.replace("{count}", count.toLocaleString(locale)) : t.sfTitle} onClick={(event) => onOpen(event.currentTarget)}><Icon name="filter" /><span>{t.sfTitle}</span>{count > 0 && <span className="filter-count" aria-hidden="true">{count.toLocaleString(locale)}</span>}</button>{disabled && <span className="filter-entry-help">{t.sfChooseRegion}</span>}</div>;
}

function Option({ label, icon, logo, checked = false, count, disabled = false, onClick, children }: { label: string; icon: IconName; logo?: string; checked?: boolean; count?: number; disabled?: boolean; onClick?: () => void; children?: ReactNode }) {
  return <button type="button" className="filter-option" aria-pressed={checked} disabled={disabled} onClick={onClick}>
    <span className="filter-option-circle">{logo ? <img src={logo} alt="" onError={(event) => { event.currentTarget.hidden = true; }} /> : <Icon name={icon} />}{logo && <span className="filter-logo-fallback"><Icon name={icon} /></span>}{checked && <span className="filter-check"><Icon name="check" /></span>}</span>
    <span className="filter-option-label">{label}{children}</span>{count !== undefined && <span className="filter-option-count">{count}</span>}
  </button>;
}

// Mount a fresh draft on each opening. The applied state lives in FindFuel only.
export function StationFilters({ locale, stations, query, applied, trigger, onClose, onApply, showUnavailable = false }: { locale: Locale; stations: Station[]; query: string; applied: StationFilterState; trigger: HTMLButtonElement; onClose: () => void; onApply: (filters: StationFilterState) => void; showUnavailable?: boolean }) {
  const t = messages[locale];
  const dialog = useRef<HTMLDialogElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [tab, setTab] = useState<Tab>("brands");
  const [draft, setDraft] = useState(() => copyStationFilters(applied));
  const [brandQuery, setBrandQuery] = useState("");
  const options = useMemo(() => stationFilterOptions(stations), [stations]);
  const preview = useMemo(() => applyStationFilters(stations, query, draft).length, [stations, query, draft]);
  useEffect(() => {
    const panel = dialog.current!;
    panel.showModal();
    tabRefs.current[0]?.focus();
    return () => { panel.close(); if (trigger.isConnected) trigger.focus({ preventScroll: true }); };
  }, [trigger]);
  function toggle<K extends keyof StationFilterState>(category: K, value: StationFilterState[K][number]) {
    setDraft((current) => {
      const values: string[] = current[category];
      return { ...current, [category]: values.includes(value) ? values.filter((item) => item !== value) : [...values, value] };
    });
  }
  function selectTab(index: number) { setTab(tabs[index]); tabRefs.current[index]?.focus(); }
  const search = normalizeBrandAlias(brandQuery);
  const visibleBrands = options.brands.filter((brand) => {
    const names = brand.key === UNKNOWN_BRAND ? [t.sfUnknownBrand] : [brand.label, ...(brandIdentities.find(identity => `brand:${identity.key}` === brand.key)?.aliases ?? [])];
    return names.some(name => normalizeBrandAlias(name).includes(search));
  });
  return <dialog ref={dialog} className="station-filters-dialog" aria-labelledby="station-filters-title" aria-modal="true" onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="filter-header"><h2 id="station-filters-title"><Icon name="filter" />{t.sfTitle}</h2><button type="button" className="button filter-close" aria-label={t.sfClose} onClick={onClose}><Icon name="close" /></button></header>
    <div className="filter-tabs" role="tablist" aria-label={t.sfCategories}>{tabs.map((item, index) => <button key={item} ref={(node) => { tabRefs.current[index] = node; }} id={`filter-tab-${item}`} type="button" role="tab" aria-selected={tab === item} aria-controls={`filter-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => selectTab(index)} onKeyDown={(event) => { const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1; if (next >= 0) { event.preventDefault(); selectTab(next); } }}><Icon name={tabIcons[item]} /><span>{t[tabKeys[item]]}</span></button>)}</div>
    <div className="filter-scroll">
      <p className="field-help">{t.sfCountHelp}</p>
      {tabs.map((item) => <section key={item} id={`filter-panel-${item}`} role="tabpanel" aria-labelledby={`filter-tab-${item}`} hidden={tab !== item} tabIndex={0}>
        {item === "brands" && <><label className="filter-brand-search">{t.sfBrandSearch}<input type="search" value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} /></label><div className="filter-options">{visibleBrands.map((brand) => <Option key={brand.key} label={brand.key === UNKNOWN_BRAND ? t.sfUnknownBrand : brand.label} icon="pump" logo={brand.logo} checked={draft.brands.includes(brand.key)} count={brand.count} onClick={() => toggle("brands", brand.key)} />)}</div>{!visibleBrands.length && <p>{t.sfNoBrands}</p>}</>}
        {item === "payments" && <><p className="filter-data-note">{t.sfPaymentHelp}</p><div className="filter-options">{(["visa", "mastercard"] as const).map((payment) => <Option key={payment} label={payment === "visa" ? "Visa" : "Mastercard"} icon="card" checked={draft.payments.includes(payment)} count={options.payments[payment]} onClick={() => toggle("payments", payment)} />)}</div></>}
        {item === "services" && <div className="filter-options">{(["SELF", "FULL"] as const).map((service) => <Option key={service} label={service === "SELF" ? t.ffSelf.split(" · ")[0] : t.ffFull} icon={service === "SELF" ? "pump" : "service"} checked={draft.services.includes(service)} count={options.services[service]} onClick={() => toggle("services", service)}>{service === "SELF" && <span lang="ja" className="japanese-label">{japaneseLabels.selfService}</span>}</Option>)}</div>}
        {showUnavailable && unavailable[item].length > 0 && <details className="filter-unavailable"><summary>{t.sfUnavailable}</summary><p className="field-help">{t.sfUnavailableHelp}</p><div className="filter-options">{unavailable[item].map((option) => <Option key={option.key} label={t[option.key]} icon={option.icon} disabled />)}</div></details>}
      </section>)}
    </div>
    <footer className="filter-footer"><button type="button" className="button button-quiet" onClick={() => setDraft(emptyStationFilters())} disabled={!activeFilterCount(draft)}>{t.sfReset}</button><button type="button" className="button button-primary filter-apply" onClick={() => onApply(draft)}>{t.sfApply.replace("{count}", preview.toLocaleString(locale))}</button></footer>
  </dialog>;
}
