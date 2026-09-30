import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { localeFromPath } from "./i18n";
import { parseRoute, updateRouteMetadata } from "./lib/routes";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const locale = localeFromPath(window.location.pathname);
const route = parseRoute(window.location.pathname, window.location.search);
updateRouteMetadata(route);
const root = document.getElementById("root")!;
// Home and information URLs have matching complete static HTML. Detail fallbacks use a different shell.
if ((route.kind === "home" || route.kind === "guide" || route.kind === "about") && root.hasChildNodes()) hydrateRoot(root, <App locale={locale} initialRoute={route} />);
else createRoot(root).render(<App locale={locale} initialRoute={route} />);
