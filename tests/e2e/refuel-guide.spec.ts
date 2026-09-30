import { test, expect, interceptExternal } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";
import { fixtures, detailPath, naha, messages, locales } from "./rental-fixtures";

for (const locale of locales) {
  for (const width of [320, 1280]) {
    test(`${locale} ${width}px: header navigation opens the standalone guide and preserves the fuel map`, async ({ page }) => {
      const t = messages[locale];
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { throw Error("Guide requested location"); } });
      });
      const errors: string[] = [];
      const unwantedRequests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", request => { if (/\/field-guides\/|\/data\/vehicles\/|\/data\/rental\/|fdma\.go\.jp|jaf\.or\.jp/.test(request.url())) unwantedRequests.push(request.url()); });
      await page.goto(`/${locale}/`);
      const nav = page.getByRole("navigation", { name: t.navPrimary, exact: true });
      await expect(nav.getByRole("link")).toHaveText([t.navFindFuel, t.rcTitle, t.rgTitle, t.navAbout]);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(t.navFindFuel);
      await expect(page.locator(".site-header .my-fuel-trigger")).toHaveCount(0);
      const myFuel = page.locator("#find-fuel").getByRole("button", { name: t.myFuelTitle, exact: true });
      await expect(myFuel).toBeVisible();
      await myFuel.click();
      await page.getByRole("dialog").getByRole("combobox").selectOption("DIESEL");
      await page.keyboard.press("Escape");
      await expect(myFuel).toBeFocused();
      const map = await page.locator(".map-surface.leaflet-container").elementHandle();
      await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
      const link = nav.getByRole("link", { name: t.rgTitle, exact: true });
      await link.focus(); await link.press("Enter");
      await expect(page).toHaveURL(`/${locale}/refuel-guide/`);
      await expect(page.locator("#main")).toBeFocused();
      const article = page.getByRole("article", { name: t.rgTitle, exact: true });
      await expect(article).toBeVisible();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(myFuel).toBeHidden();
      await expect(article.locator("ol > li")).toHaveCount(5);
      await expect(article.getByRole("heading")).toHaveText([t.rgTitle, t.rgStep1Title, t.rgStep2Title, t.rgStep3Title, t.rgStep4Title, t.rgStep5Title, t.rgMisfuelTitle]);
      for (const key of ["rgIntro", "rgStep1Body", "rgStep2Body", "rgStep3Body", "rgStep4Body", "rgStep5Body", "rgLightVehicle", "rgMisfuelBody", "rgAttribution"] as const) {
        await expect(article.getByText(t[key], { exact: true })).toBeVisible();
      }
      for (const label of ["レギュラー", "ハイオク", "軽油", "セルフ", "現金", "会員", "満タン"]) await expect(article.locator('dt[lang="ja"]').filter({ hasText: label })).toBeVisible();
      await expect(article.getByRole("link", { name: t.rgSourceJaf })).toHaveAttribute("href", "https://jaf.or.jp/");
      await expect(article.locator('.refuel-guide-links a[target="_blank"][rel="noopener noreferrer"]')).toHaveCount(4);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(t.rgTitle);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const control of await nav.getByRole("link").all()) {
        const box = await control.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }
      if (locale === "zh-Hans") await page.screenshot({ path: `reports/evidence/site-navigation/guide-${width}.png`, fullPage: true });
      await article.getByRole("link", { name: t.rgComplete }).click();
      await expect(page).toHaveURL(`/${locale}/`);
      await expect(myFuel).toBeVisible();
      expect(await map!.evaluate(node => node.isConnected)).toBe(true);
      await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
      if (locale === "zh-Hans") await page.screenshot({ path: `reports/evidence/site-navigation/home-${width}.png`, fullPage: true });
      expect(unwantedRequests).toEqual([]); expect(errors).toEqual([]);
    });
  }

  test(`${locale}: direct guide load, reload and language switching retain the page without fetching map or rental data`, async ({ page }) => {
    const t = messages[locale];
    const errors: string[] = []; const dataRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", event => { if (event.type() === "error") errors.push(event.text()); });
    page.on("request", request => { if (/\/data\/|\/runtime-map-provider\.json|tile\.openstreetmap\.org/.test(request.url())) dataRequests.push(request.url()); });
    await page.goto(`/${locale}/refuel-guide/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.rgTitle);
    await expect(page.locator(".my-fuel-trigger, .leaflet-container, .rental-business")).toHaveCount(0);
    await expect(page).toHaveTitle(`${t.rgTitle} | Fuel Me Japan`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", t.rgIntro);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex,\s*nofollow/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fuel-me-japan.com/${locale}/refuel-guide/`);
    for (const option of locales) {
      await expect(page.locator(`.locale-switcher a[lang="${option}"]`)).toHaveAttribute("href", `/${option}/refuel-guide/`);
      await expect(page.locator(`link[rel="alternate"][hreflang="${option}"]`)).toHaveAttribute("href", `https://fuel-me-japan.com/${option}/refuel-guide/`);
    }
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.rgTitle);
    const next = locales[(locales.indexOf(locale) + 1) % locales.length];
    await page.locator(".locale-trigger").click();
    await page.locator(`.locale-switcher a[lang="${next}"]`).click();
    await expect(page).toHaveURL(`/${next}/refuel-guide/`);
    await expect(page).toHaveTitle(`${messages[next].rgTitle} | Fuel Me Japan`);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.rgTitle);
    expect(dataRequests).toEqual([]); expect(errors).toEqual([]);
  });
}

test("guide static HTML includes complete content and working navigation without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await interceptExternal(context);
  const page = await context.newPage();
  try {
    for (const locale of locales) {
      const t = messages[locale];
      await page.goto(`/${locale}/refuel-guide/`);
      const article = page.getByRole("article", { name: t.rgTitle, exact: true });
      await expect(article.locator("ol > li")).toHaveCount(5);
      await expect(article.getByText(t.rgMisfuelBody, { exact: true })).toBeVisible();
      await expect(page).toHaveTitle(`${t.rgTitle} | Fuel Me Japan`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fuel-me-japan.com/${locale}/refuel-guide/`);
      await expect(page.locator(".primary-navigation a")).toHaveCount(4);
    }
    await page.locator("#find-fuel-link").click();
    await expect(page).toHaveURL("/th/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.th.mapTitle);
  } finally { await context.close(); }
});

test("guide navigation and browser history preserve the station list and all fuel preferences", async ({ page }) => {
  const t = messages.en;
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await page.getByRole("button", { name: t.mapList, exact: true }).click();
  await page.locator("#station-search").fill("ENEOS");
  await chooseFuels(page, ["REGULAR", "DIESEL", "HIGH_OCTANE"]);
  const before = await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY);
  await page.locator("#refuel-guide-link").click();
  await expect(page.locator(".refuel-guide-page")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect(page.locator("#station-search")).toHaveValue("ENEOS");
  await expect(page.getByRole("button", { name: t.mapList, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(3);
  expect(await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe(before);
  await page.goForward();
  await expect(page).toHaveURL("/en/refuel-guide/");
  await expect(page.locator(".primary-navigation [aria-current=page]")).toHaveText(t.rgTitle);
});

test("rental directory and detail share the three header links with the independent guide", async ({ page }) => {
  await fixtures(page);
  await page.goto(detailPath(naha, "zh-Hans"));
  const t = messages["zh-Hans"];
  await expect(page.getByTestId("rental-detail")).toBeVisible();
  await expect(page.locator(".primary-navigation [aria-current=page]")).toHaveText(t.rcTitle);
  await expect(page.getByRole("button", { name: t.myFuelTitle, exact: true })).toHaveCount(0);
  await page.locator("#refuel-guide-link").click();
  await expect(page).toHaveURL("/zh-Hans/refuel-guide/");
  await expect(page.locator(".rental-business")).toHaveCount(0);
  await page.locator("#return-car-link").click();
  await expect(page.getByTestId("rental-directory")).toBeVisible();
  await expect(page.locator(".primary-navigation [aria-current=page]")).toHaveText(t.rcTitle);
  await page.locator("#find-fuel-link").click();
  await expect(page.locator("#find-fuel .my-fuel-trigger")).toBeVisible();
  await expect(page.locator(".primary-navigation [aria-current=page]")).toHaveText(t.navFindFuel);
});
