import { locales, localeNames, type Locale } from "../i18n";
import { analytics } from "../lib/analytics";
export function LocaleSwitcher({
  locale,
  label,
}: {
  locale: Locale;
  label: string;
}) {
  return (
    <nav className="locale-switcher" aria-label={label}>
      {locales.map((option) => (
        <a
          key={option}
          href={`/${option}/`}
          lang={option}
          hrefLang={option}
          aria-current={option === locale ? "page" : undefined}
          onClick={() => analytics.track("locale_selected", { locale: option })}
        >
          {localeNames[option]}
        </a>
      ))}
    </nav>
  );
}
