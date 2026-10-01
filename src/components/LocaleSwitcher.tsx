import { useEffect, useRef } from "react";
import { locales, localeNames, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
import { Icon } from "./Icon";

export function LocaleSwitcher({
  locale,
  label,
  hrefForLocale,
}: {
  locale: Locale;
  label: string;
  hrefForLocale?: (locale: Locale) => string;
}) {
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false;
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.open) return;
      event.preventDefault();
      menu.open = false;
      menu.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, []);
  return (
    <nav className="locale-switcher" aria-label={label}>
      <details ref={menuRef} onBlur={event => {
        if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
      }}>
        <summary className="locale-trigger" aria-label={`${label}: ${localeNames[locale]}`} title={label}>
          <Icon name="globe" />
          <span className="locale-current" lang={locale}>{localeNames[locale]}</span>
          <span className="locale-chevron" aria-hidden="true" />
        </summary>
        <div className="locale-menu">
          {locales.map((option) => (
            <a
              key={option}
              href={hrefForLocale?.(option) ?? `/${option}/`}
              lang={option}
              hrefLang={option}
              tabIndex={0}
              aria-current={option === locale ? "page" : undefined}
              onClick={() => {
                if (menuRef.current) menuRef.current.open = false;
                analytics.track("locale_selected", { locale: option });
              }}
            >
              <span>{localeNames[option]}</span>
              {option === locale && <Icon name="check" />}
            </a>
          ))}
        </div>
      </details>
    </nav>
  );
}
