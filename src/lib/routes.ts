import { isLocale, localeFromPath, locales, messages, type Locale } from "../i18n";

export type AppRoute = { locale: Locale; kind: "home" | "guide" | "about" | "directory" | "detail" | "not-found"; id?: string; search: string; pathname: string };
export function parseRoute(pathname: string, search = ""): AppRoute {
  const locale = localeFromPath(pathname);
  const base = { locale, search, pathname };
  if (pathname === "/" || new RegExp(`^/${locale}/?$`).test(pathname)) return { ...base, kind: "home" };
  if (!isLocale(pathname.split("/")[1])) return { ...base, kind: "not-found" };
  if (pathname === aboutHref(locale) || pathname === `/${locale}/about`) return { ...base, kind: "about" };
  if (pathname === guideHref(locale) || pathname === `/${locale}/refuel-guide`) return { ...base, kind: "guide" };
  if (pathname === `/${locale}/return-car/` || pathname === `/${locale}/return-car`) return { ...base, kind: "directory" };
  const match = pathname.match(/^\/[^/]+\/return-car\/([^/]+)\/?$/);
  if (match && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(match[1]) && match[1].length <= 160) return { ...base, kind: "detail", id: match[1] };
  return { ...base, kind: "not-found" };
}
export function aboutHref(locale: Locale) { return `/${locale}/about/`; }
export function guideHref(locale: Locale) { return `/${locale}/refuel-guide/`; }
export function rentalHref(locale: Locale, id?: string, search = "") { return `/${locale}/return-car/${id ? `${encodeURIComponent(id)}/` : ""}${search}`; }
export function localizedHref(route: AppRoute, locale: Locale) {
  return route.pathname.replace(/^\/(en|zh-Hant|ko|zh-Hans|th)(?=\/|$)/, `/${locale}`).replace(/^\/$/, `/${locale}/`) + route.search;
}
export function safeWebsite(value: string): string | null {
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password && !/[\s\\]/.test(value) ? u.href : null; } catch { return null; }
}
export const routeEvent = "fmj-route";
export function navigate(href: string, replace = false, restore?: { scrollY: number; focusId: string; rentalListScrollTop?: number }, originFocusId?: string) {
  const next = new URL(href, window.location.href);
  if (next.origin !== window.location.origin) return;
  const list = document.getElementById("rental-results-scroll");
  const rentalListScrollTop = list?.closest<HTMLElement>(".rental-directory")?.hidden === false ? list.scrollTop : undefined;
  const returnTo = { rentalListScrollTop, href: window.location.pathname + window.location.search, scrollY: window.scrollY, focusId: originFocusId ?? document.activeElement?.id ?? "" };
  if (!replace) history.replaceState({ ...history.state, scrollY: returnTo.scrollY, focusId: returnTo.focusId, rentalListScrollTop }, "");
  history[replace ? "replaceState" : "pushState"](replace ? history.state : { returnTo, ...restore }, "", next.pathname + next.search + next.hash);
  window.dispatchEvent(new Event(routeEvent));
}
export function updateRouteMetadata(route: AppRoute, detailName?: string) {
  const t = messages[route.locale];
  document.documentElement.lang = route.locale;
  document.title = route.kind === "home" ? t.pageTitle : `${route.kind === "guide" ? t.rgTitle : route.kind === "about" ? t.aboutTitle : detailName || (route.kind === "not-found" ? t.rdNotFound : t.rdTitle)} | Fuel Me Japan`;
  document.querySelector('meta[name="description"]')?.setAttribute("content", route.kind === "home" ? t.description : route.kind === "guide" ? t.rgIntro : route.kind === "about" ? t.aboutIntro : `${detailName ? `${detailName}. ` : ""}${route.kind === "not-found" ? t.rdNotFoundHelp : t.rdIntro}`);
  // Only the four approved public page types are indexable. Queries and
  // client-only detail/error pages retain the preview restriction.
  const publicPage = ["home", "guide", "about", "directory"].includes(route.kind);
  document.querySelector('meta[name="robots"]')?.setAttribute("content", publicPage && !route.search ? "index, follow" : "noindex, nofollow");
  const pathname = route.kind === "home" ? `/${route.locale}/`
    : route.kind === "guide" ? guideHref(route.locale)
    : route.kind === "about" ? aboutHref(route.locale)
    : route.kind === "directory" ? rentalHref(route.locale)
    : route.kind === "detail" ? rentalHref(route.locale, route.id)
    : route.pathname;
  const canonicalRoute = { ...route, pathname, search: "" };
  const origin = "https://fuel-me-japan.com";
  document.querySelectorAll('link[rel="canonical"], link[rel="alternate"][hreflang]').forEach(node => node.remove());
  const add = (rel: string, href: string, language?: string) => { const link = document.createElement("link"); link.rel = rel; link.href = href; if (language) link.hreflang = language; document.head.append(link); };
  add("canonical", origin + pathname);
  for (const locale of locales) add("alternate", origin + localizedHref(canonicalRoute, locale), locale);
  add("alternate", origin + localizedHref(canonicalRoute, "en"), "x-default");
}
