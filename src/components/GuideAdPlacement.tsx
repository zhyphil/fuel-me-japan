import { messages, type Locale } from "../i18n";

// Layout review only. Vite removes this branch from production builds.
// Real ad units must remain absent until site approval and serving validation.
export function GuideAdPlacement({ locale }: { locale: Locale }) {
  if (typeof window === "undefined" || !import.meta.env?.DEV ||
      !["localhost", "127.0.0.1"].includes(window.location.hostname) ||
      new URLSearchParams(window.location.search).get("previewAd") !== "guide") return null;
  const t = messages[locale];
  return <aside className="ad-placement" aria-label={t.adLabel} data-ad-preview="true">
    <p className="ad-label">{t.adLabel}</p>
    <div className="ad-layout-preview">{t.adLayoutPreview}</div>
  </aside>;
}
