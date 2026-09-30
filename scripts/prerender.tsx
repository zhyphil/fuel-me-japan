import { readFile, writeFile, mkdir } from "node:fs/promises";
import { renderToString } from "react-dom/server";
import { App } from "../src/App";
import { locales, messages, type Locale } from "../src/i18n";
import registry from "../public/data/source-registry.json";
import { validateRegistry } from "../src/lib/source-registry";
const errors = validateRegistry(registry);
if (errors.length) throw new Error(errors.join("\n"));
const siteOrigin = "https://fuel-me-japan.com";
const shell = await readFile("dist/index.html", "utf8");
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
function render(locale: Locale) {
  return shell
    .replace('<html lang="en">', `<html lang="${locale}">`)
    .replace(
      /<title>.*?<\/title>/,
      `<title>${escape(messages[locale].pageTitle)}</title>`,
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      `<meta name="description" content="${escape(messages[locale].description)}" />`,
    )
    .replace(
      "</head>",
      `<link rel="canonical" href="${siteOrigin}/${locale}/" />\n${locales.map((language) => `<link rel="alternate" hreflang="${language}" href="${siteOrigin}/${language}/" />`).join("\n")}<link rel="alternate" hreflang="x-default" href="${siteOrigin}/en/" /></head>`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToString(<App locale={locale} />)}</div>`,
    );
}
for (const locale of locales) {
  await mkdir(`dist/${locale}`, { recursive: true });
  await writeFile(`dist/${locale}/index.html`, render(locale));
}
await writeFile("dist/index.html", render("en"));
await writeFile(
  "dist/build-provenance.json",
  JSON.stringify(
    {
      schemaVersion: 1,
      milestone: "M0.0",
      builtAt: new Date().toISOString(),
      transformationVersion: "foundation-v1",
      sourceRegistry: "/data/source-registry.json",
      ingestedSources: [],
      note: "Static foundation only; no station, price or vehicle data has been fetched.",
    },
    null,
    2,
  ),
);
console.log(
  "Prerendered five locales + English root; source registry validated; provenance emitted.",
);
