import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { loadHome, type HomeComponent } from "./components/LazyHome";
import { localeFromPath } from "./i18n";
import { parseRoute, updateRouteMetadata } from "./lib/routes";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const locale = localeFromPath(window.location.pathname);
const route = parseRoute(window.location.pathname, window.location.search);
updateRouteMetadata(route);
const root = document.getElementById("root")!;
async function start() {
  let initialHome: HomeComponent | undefined;
  let initialHomeError = false;
  if (route.kind === "home") {
    try { initialHome = await loadHome(); }
    catch { initialHomeError = true; }
  }
  const app = <App locale={locale} initialRoute={route} initialHome={initialHome} initialHomeError={initialHomeError} />;
  // Load the real home component before hydration to match the complete static
  // HTML. A failed chunk gets the navigable retry UI instead of a hydration error.
  if (!initialHomeError && (route.kind === "home" || route.kind === "guide" || route.kind === "about") && root.hasChildNodes()) hydrateRoot(root, app);
  else createRoot(root).render(app);
}
void start();
