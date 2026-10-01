import type { Page } from "@playwright/test";
import { test, expect, interceptExternal } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { fixtures, detailPath, naha, locales, messages, watchPageErrors } from "./rental-fixtures";

const homeChunk = /\/assets\/FindFuel-[^/?]+\.js(?:\?.*)?$/;
function gate() {
  let release!: () => void;
  const promise = new Promise<void>(resolve => { release = resolve; });
  return { promise, release };
}
async function switchLanguage(page: Page, locale: string) {
  await page.locator(".locale-trigger").click();
  await page.locator(`.locale-switcher a[lang="${locale}"]`).click();
}

for (const path of ["/en/about/", "/en/refuel-guide/", "/en/return-car/", detailPath(naha)]) {
  test(`${path}: first visit defers the home chunk until home navigation`, async ({ page }) => {
    await fixtures(page);
    const errors = watchPageErrors(page);
    const homeRequests: string[] = [];
    let documents = 0;
    page.on("request", request => {
      if (homeChunk.test(request.url())) homeRequests.push(request.url());
      if (request.isNavigationRequest()) documents++;
    });
    await page.goto(path);
    if (path === detailPath(naha)) await expect(page.locator("#return-fuel")).toBeVisible();
    else if (path.includes("return-car")) await expect(page.locator(".rental-card").first()).toBeVisible();
    else await expect(page.locator("article")).toBeVisible();
    // A language change proves the application has hydrated, not just its static shell.
    await switchLanguage(page, "zh-Hans");
    await expect(page).toHaveURL(path.replace("/en/", "/zh-Hans/"));
    expect(homeRequests).toEqual([]);
    await expect(page.locator(".fuel-home-host")).toHaveCount(0);
    await page.locator("#find-fuel-link").click();
    await expect(page.locator("#prefecture")).toBeVisible();
    await expect(page.locator(".fuel-home-host .leaflet-container")).toHaveCount(1);
    expect(homeRequests).toHaveLength(1);
    expect(documents).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("hydrated home preserves its map, markers, prefecture and fuels across rental navigation", async ({ page }) => {
  await fixtures(page);
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      const home = document.getElementById("find-fuel");
      const map = home?.querySelector(".map-surface");
      if (home && map) {
        Object.assign(window, { __staticHome: { home, map } });
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  const errors = watchPageErrors(page);
  const homeRequests: string[] = [];
  page.on("request", request => { if (homeChunk.test(request.url())) homeRequests.push(request.url()); });
  await page.goto("/en/");
  await expect(page.locator(".fuel-home-host .leaflet-container")).toBeVisible();
  await page.locator("#prefecture").selectOption("JP-47");
  await chooseFuels(page, ["REGULAR", "DIESEL"]);
  const home = page.locator(".fuel-home-host");
  await expect(home.locator(".fuel-marker").first()).toBeVisible();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  expect(await page.evaluate(() => {
    const original = (window as unknown as { __staticHome: { home: Element; map: Element } }).__staticHome;
    return original.home === document.getElementById("find-fuel") && original.map === document.querySelector(".fuel-home-host .leaflet-container");
  })).toBe(true);
  const map = await home.locator(".map-surface.leaflet-container").elementHandle();
  const markers = await home.locator(".fuel-marker").elementHandles();
  expect(markers.length).toBeGreaterThan(0);
  await page.locator("#return-car-link").click();
  await expect(page.locator(".rental-card").first()).toBeVisible();
  await expect(home).toBeHidden();
  await page.goBack();
  await expect(page.locator("#prefecture")).toHaveValue("JP-47");
  await expect(page.locator('#display-fuel input[value="REGULAR"]')).toBeChecked();
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
  await expect(page.locator('#display-fuel input[value="HIGH_OCTANE"]')).not.toBeChecked();
  await expect(home.locator(".map-surface.leaflet-container")).toBeVisible();
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
  for (const marker of markers) expect(await marker.evaluate(node => node.isConnected)).toBe(true);
  await page.goForward();
  await expect(home).toBeHidden();
  await page.locator("#find-fuel-link").click();
  await expect(page.locator("#prefecture")).toHaveValue("JP-47");
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
  await expect(home.locator(".leaflet-container")).toHaveCount(1);
  expect(homeRequests).toHaveLength(1);
  expect(errors).toEqual([]);
});

test("slow home chunk allows back, language changes and navigation without mounting a hidden map", async ({ page }) => {
  await fixtures(page);
  const errors = watchPageErrors(page);
  const pending = gate();
  const seen = gate();
  let requests = 0;
  await page.route(homeChunk, async route => { requests++; seen.release(); await pending.promise; await route.continue(); });
  try {
    await page.goto("/en/about/");
    await page.locator("#find-fuel-link").click();
    await seen.promise;
    await expect(page.locator('.fuel-home-host [role="status"]')).toHaveText(messages.en.mapLoading);
    await switchLanguage(page, "ko");
    await expect(page.locator('.fuel-home-host [role="status"]')).toHaveText(messages.ko.mapLoading);
    await page.goBack();
    await expect(page.locator('.fuel-home-host [role="status"]')).toHaveText(messages.en.mapLoading);
    await page.goBack();
    await expect(page.locator(".about-page")).toBeVisible();
    const response = page.waitForResponse(response => homeChunk.test(response.url()));
    pending.release();
    await (await response).finished();
    await page.locator("#refuel-guide-link").click();
    await expect(page.locator(".refuel-guide-page")).toBeVisible();
    await expect(page.locator("#find-fuel, .fuel-home-host .leaflet-container")).toHaveCount(0);
    await page.locator("#find-fuel-link").click();
    await expect(page.locator(".fuel-home-host .leaflet-container")).toBeVisible();
    expect(requests).toBe(1);
    expect(errors).toEqual([]);
  } finally { pending.release(); await page.unrouteAll({ behavior: "wait" }); }
});

for (const locale of locales) {
  test(`${locale}: a failed home chunk retries in place and navigation remains usable`, async ({ page }) => {
    await fixtures(page);
    const errors = watchPageErrors(page);
    let fail = true;
    const requests: string[] = [];
    let documents = 0;
    page.on("request", request => { if (request.isNavigationRequest()) documents++; });
    await page.route(homeChunk, async route => {
      requests.push(route.request().url());
      if (fail) await route.abort("failed"); else await route.continue();
    });
    await page.goto(`/${locale}/about/`);
    await page.locator("#find-fuel-link").click();
    await expect(page.locator('.fuel-home-host [role="alert"]')).toContainText(messages[locale].pageLoadError);
    await page.goBack();
    await expect(page.locator(".about-page")).toBeVisible();
    await page.goForward();
    await expect(page.locator('.fuel-home-host [role="alert"]')).toBeVisible();
    const next = locales[(locales.indexOf(locale) + 1) % locales.length];
    await switchLanguage(page, next);
    await expect(page.locator('.fuel-home-host [role="alert"]')).toContainText(messages[next].pageLoadError);
    // A failed retry is still recoverable; the third attempt must escape cached import failures too.
    await page.getByRole("button", { name: messages[next].ffRetry, exact: true }).click();
    await expect(page.locator('.fuel-home-host [role="alert"]')).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: messages[next].ffRetry, exact: true }).click();
    await expect(page.locator("#prefecture")).toBeVisible();
    await expect(page.locator(".fuel-home-host .leaflet-container")).toHaveCount(1);
    expect(requests).toHaveLength(3);
    expect(new Set(requests).size).toBe(3);
    expect(documents).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("direct home chunk failure exposes recovery without an unhandled bootstrap error", async ({ page }) => {
  await fixtures(page);
  const errors = watchPageErrors(page);
  let fail = true;
  await page.route(homeChunk, route => fail ? route.abort("failed") : route.continue());
  await page.goto("/en/");
  await expect(page.locator('.fuel-home-host [role="alert"]')).toBeVisible();
  await page.locator("#about-link").click();
  await expect(page.locator(".about-page")).toBeVisible();
  await page.goBack();
  fail = false;
  await page.getByRole("button", { name: messages.en.ffRetry, exact: true }).click();
  await expect(page.locator(".fuel-home-host .leaflet-container")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("all five static home, guide and About pages retain their content without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await interceptExternal(context);
  const page = await context.newPage();
  try {
    for (const locale of locales) {
      const t = messages[locale];
      await page.goto(`/${locale}/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.mapTitle);
      await expect(page.locator("#prefecture")).toBeVisible();
      await expect(page.getByText(t.ffNoJavaScript, { exact: true })).toBeVisible();
      await page.locator("#refuel-guide-link").click();
      await expect(page.locator("article ol > li")).toHaveCount(5);
      await expect(page.getByText(t.rgMisfuelBody, { exact: true })).toBeVisible();
      await page.locator("#about-link").click();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.aboutTitle);
      await expect(page.getByText(t.aboutPriceData, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "contact@fuel-me-japan.com", exact: true })).toHaveAttribute("href", "mailto:contact@fuel-me-japan.com");
    }
  } finally { await context.close(); }
});


test("shared module network failure can recover with an explicit page reload", async ({ page }) => {
  await fixtures(page);
  const errors = watchPageErrors(page);
  let fail = true;
  await page.route(/\/assets\/StationMiniMap-[^/?]+\.js(?:\?.*)?$/, route => fail ? route.abort("failed") : route.continue());
  await page.goto("/en/about/");
  await page.locator("#find-fuel-link").click();
  await expect(page.locator('.fuel-home-host [role="alert"]')).toContainText(messages.en.pageLoadError);
  // A still-broken connection must keep a usable error, not reload in a loop.
  let documents = 0;
  page.on("request", request => { if (request.isNavigationRequest()) documents++; });
  const reload = page.getByRole("button", { name: messages.en.pageReload, exact: true });
  await reload.click();
  await expect(reload).toBeEnabled();
  await expect(page.locator('.fuel-home-host [role="alert"]')).toBeVisible();
  expect(documents).toBe(0);
  fail = false;
  // A failed static dependency can remain in the browser's module cache.
  await page.getByRole("button", { name: messages.en.pageReload, exact: true }).click();
  await expect(page.locator(".fuel-home-host .leaflet-container")).toHaveCount(1);
  await expect(page.locator('.fuel-home-host [role="alert"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});
