import en from "./locales/en.json";
import traditional from "./locales/zh-Hant.json";
import ko from "./locales/ko.json";
import simplified from "./locales/zh-Hans.json";
import th from "./locales/th.json";
export const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
export type Locale = (typeof locales)[number];
export type MessageKey = keyof typeof en;
export const messages: Record<Locale, Record<MessageKey, string>> = {
  en,
  "zh-Hant": traditional,
  ko,
  "zh-Hans": simplified,
  th,
};
export const localeNames: Record<Locale, string> = {
  en: "English",
  "zh-Hant": "繁體中文",
  ko: "한국어",
  "zh-Hans": "简体中文",
  th: "ไทย",
};
export function isLocale(value: unknown): value is Locale {
  return locales.some((locale) => locale === value);
}
export function localeFromPath(path: string): Locale {
  const candidate = path.split("/")[1];
  return isLocale(candidate) ? candidate : "en";
}
export function translate(
  locale: string,
  key: string,
  japaneseReference?: string,
): string {
  const dictionary: Partial<Record<string, string>> = isLocale(locale)
    ? messages[locale]
    : {};
  const fallback: Partial<Record<string, string>> = en;
  return dictionary[key] || fallback[key] || japaneseReference || key;
}
// Recognition labels retained for later safety screens; no vehicle advice in M0.0.
export const japaneseLabels = {
  regular: "レギュラー",
  highOctane: "ハイオク",
  diesel: "軽油",
  selfService: "セルフ",
  cash: "現金",
  member: "会員",
  fullTank: "満タン",
} as const;
