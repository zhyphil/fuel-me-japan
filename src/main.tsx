import { createRoot, hydrateRoot } from "react-dom/client";
import { App } from "./App";
import { localeFromPath, messages } from "./i18n";
import "leaflet/dist/leaflet.css";
import "./styles.css";
const locale = localeFromPath(window.location.pathname);
document.documentElement.lang = locale;
document.title = messages[locale].pageTitle;
document
  .querySelector('meta[name="description"]')
  ?.setAttribute("content", messages[locale].description);
const root = document.getElementById("root")!;
if (root.hasChildNodes()) hydrateRoot(root, <App locale={locale} />);
else createRoot(root).render(<App locale={locale} />);
