import { useEffect, useState, type ComponentProps } from "react";
import { messages } from "../i18n";

export type HomeComponent = typeof import("./FindFuel").FindFuel;
let attempt = 0;
let pending: Promise<HomeComponent> | undefined;

export function loadHome(): Promise<HomeComponent> {
  if (pending) return pending;
  const currentAttempt = attempt++;
  pending = (async () => {
    if (currentAttempt === 0) return (await import("./FindFuel")).FindFuel;
    // Browsers can remember a rejected import by URL. Prerender supplies the exact
    // built chunk URL; only an explicit retry gets a fresh module URL, not a reload.
    const path = document.getElementById("root")?.dataset.homeModule;
    const url = new URL(path || "/src/components/FindFuel.tsx", window.location.origin);
    url.searchParams.set("home-retry", String(currentAttempt));
    const module: typeof import("./FindFuel") = await import(/* @vite-ignore */ url.href);
    return module.FindFuel;
  })().finally(() => { pending = undefined; });
  return pending;
}

async function reloadHomeCode() {
  const sourceUrl = window.location.href;
  const paths: string[] = JSON.parse(document.getElementById("root")?.dataset.homeModules ?? "[]");
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10_000);
  try {
    // WebKit can retain failed dependency responses across a normal reload.
    // Refresh this page's local code only, on the visitor's explicit action.
    await Promise.all(paths.map(async path => {
      const url = new URL(path, window.location.origin);
      if (url.origin !== window.location.origin) throw new Error("Unexpected module origin");
      const response = await fetch(url, { cache: "reload", signal: controller.signal });
      if (!response.ok) throw new Error("Module reload failed");
      await response.arrayBuffer();
    }));
    if (window.location.href === sourceUrl) window.location.reload();
  } finally {
    window.clearTimeout(timeout);
    controller.abort();
  }
}

export function LazyHome({ initialComponent, initialError = false, active, ...props }: ComponentProps<HomeComponent> & {
  initialComponent?: HomeComponent;
  initialError?: boolean;
  active: boolean;
}) {
  const [Home, setHome] = useState<HomeComponent | undefined>(() => initialComponent);
  const [failed, setFailed] = useState(initialError);
  const [retry, setRetry] = useState(0);
  const [reloading, setReloading] = useState(false);
  const [mounted, setMounted] = useState(Boolean(initialComponent));
  useEffect(() => {
    if (initialComponent || (initialError && retry === 0)) return;
    let cancelled = false;
    loadHome().then(component => { if (!cancelled) setHome(() => component); }, () => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [initialComponent, initialError, retry]);
  useEffect(() => { if (active && Home) setMounted(true); }, [active, Home]);
  // Finishing a request after the visitor has left home must not initialize an
  // invisible map. Once actually shown, keep the same instance on later routes.
  if (Home) return mounted || active ? <Home {...props} /> : null;
  const t = messages[props.locale];
  return <section className="notice-box" aria-label={t.navFindFuel} aria-busy={reloading}>
    <h1>{t.mapTitle}</h1>
    {failed ? <div role="alert"><p>{t.pageLoadError}</p><button type="button" className="button" disabled={reloading} onClick={() => { setFailed(false); setRetry(value => value + 1); }}>{t.ffRetry}</button>{" "}<button type="button" className="button button-secondary" disabled={reloading} onClick={() => {
      setReloading(true);
      void reloadHomeCode().catch(() => { setFailed(true); }).finally(() => { setReloading(false); });
    }}>{t.pageReload}</button>{reloading && <p role="status">{t.mapLoading}</p>}</div> : <p role="status">{t.mapLoading}</p>}
  </section>;
}
