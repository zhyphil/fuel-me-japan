import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App } from "../../src/App";
import { locales, messages } from "../../src/i18n";
import { localizedHref, parseRoute } from "../../src/lib/routes";

describe("shared navigation and independent refuelling guide", () => {
  it.each(locales)("%s has a directly addressable guide with matching language links", locale => {
    const route = parseRoute(`/${locale}/refuel-guide/`);
    expect(route.kind).toBe("guide");
    expect(parseRoute(`/${locale}/refuel-guide`).kind).toBe("guide");
    expect(localizedHref(route, "th")).toBe("/th/refuel-guide/");
    const html = renderToStaticMarkup(createElement(App, { locale, initialRoute: route }));
    expect(html).toContain('class="refuel-guide-page"');
    expect(html).toContain(messages[locale].rgStep1Body);
    expect(html).toContain(messages[locale].rgMisfuelBody);
    expect(html).not.toMatch(/<dialog\b|id="find-fuel"|class="rental-business"|my-fuel-trigger/);
    const nav = html.match(/<nav class="primary-navigation"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
    expect(nav?.match(/<a\b/g)).toHaveLength(4);
    expect(nav?.match(/aria-current="page"/g)).toHaveLength(1);
    expect(nav).toContain(`href="/${locale}/refuel-guide/" aria-current="page"`);
  });
  it.each(locales)("%s keeps My Fuel inside the station search page", locale => {
    const home = renderToStaticMarkup(createElement(App, { locale }));
    const header = home.match(/<header class="site-header[^>]*>([\s\S]*?)<\/header>/)?.[1];
    expect(header).toContain('class="primary-navigation"');
    expect(header).not.toContain("my-fuel-trigger");
    const findFuel = home.slice(home.indexOf('id="find-fuel"'));
    expect(findFuel).toContain("my-fuel-trigger");
    const rental = renderToStaticMarkup(createElement(App, { locale, initialRoute: parseRoute(`/${locale}/return-car/`), rentalShell: true }));
    expect(rental).not.toContain("my-fuel-trigger");
  });
  it.each(["/en/refuel-guide/extra/", "/de/refuel-guide/"])("does not accept invalid guide paths: %s", path => {
    expect(parseRoute(path).kind).toBe("not-found");
  });
});

it.each(locales)("%s provides a standalone About page with the configured contact address", locale => {
  const route = parseRoute(`/${locale}/about/`);
  expect(route.kind).toBe("about");
  expect(parseRoute(`/${locale}/about`).kind).toBe("about");
  expect(localizedHref(route, "en")).toBe("/en/about/");
  const html = renderToStaticMarkup(createElement(App, { locale, initialRoute: route }));
  expect(html).toContain('class="about-page"');
  expect(html).toContain(messages[locale].aboutIntro);
  expect(html).toContain(messages[locale].aboutPriceData);
  expect(html).toContain('href="mailto:contact@fuel-me-japan.com"');
  expect(html).not.toMatch(/<form\b|<dialog\b|id="find-fuel"|class="rental-business"|my-fuel-trigger/);
  expect(html).toContain(`href="/${locale}/about/" aria-current="page"`);
});
