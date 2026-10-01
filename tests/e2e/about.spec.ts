import { test, expect, interceptExternal } from "./offline";
import { messages, locales } from "./rental-fixtures";

for (const locale of locales) for (const width of [320, 1280]) {
  test(`${locale} ${width}px: About renders accurate project information, contact email and localized navigation`, async ({ page, browserName }) => {
    const t = messages[locale];
    const errors: string[] = []; const unwantedRequests: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", event => { if (event.type() === "error") errors.push(event.text()); });
    page.on("request", request => { if (/\/data\/|\/runtime-map-provider\.json|tile\.openstreetmap\.org/.test(request.url())) unwantedRequests.push(request.url()); });
    await page.addInitScript(() => {
      Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { throw Error("About requested location"); } });
    });
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/${locale}/about/`);
    const article = page.getByRole("article", { name: t.aboutTitle, exact: true });
    await expect(article).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.aboutTitle);
    for (const key of ["aboutIntro", "aboutMission", "aboutStationData", "aboutRentalData", "aboutPriceData", "aboutLimits", "aboutFuelSafety", "aboutPrivacy", "aboutMapsPrivacy", "aboutIndependent"] as const) {
      await expect(article.getByText(t[key], { exact: true })).toBeVisible();
    }
    await expect(article.getByRole("link", { name: "contact@fuel-me-japan.com", exact: true })).toHaveAttribute("href", "mailto:contact@fuel-me-japan.com");
    await expect(article.locator('a[target="_blank"][rel="noopener noreferrer"]:visible')).toHaveCount(4);
    await expect(page.locator(".my-fuel-trigger, .rental-business, .leaflet-container, form")).toHaveCount(0);
    const nav = page.getByRole("navigation", { name: t.navPrimary, exact: true });
    await expect(nav.getByRole("link")).toHaveText([t.navFindFuel, t.rcTitle, t.rgTitle, t.navAbout]);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(t.navAbout);
    for (const control of [...await nav.getByRole("link").all(), article.locator(".about-email")]) {
      const rect = await control.boundingBox();
      expect(rect!.height).toBeGreaterThanOrEqual(44); expect(rect!.width).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page).toHaveTitle(`${t.aboutTitle} | Fuel Me Japan`);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", t.aboutIntro);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "index, follow");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fuel-me-japan.com/${locale}/about/`);
    for (const language of locales) {
      await expect(page.locator(`.locale-switcher a[lang="${language}"]`)).toHaveAttribute("href", `/${language}/about/`);
      await expect(page.locator(`link[rel="alternate"][hreflang="${language}"]`)).toHaveAttribute("href", `https://fuel-me-japan.com/${language}/about/`);
    }
    await page.reload();
    await expect(article).toBeVisible();
    if (locale === "zh-Hans") await page.screenshot({ path: `reports/evidence/about/${browserName}-${width}.png`, fullPage: true });
    const next = locales[(locales.indexOf(locale) + 1) % locales.length];
    await page.locator(".locale-trigger").click();
    await page.locator(`.locale-switcher a[lang="${next}"]`).click();
    await expect(page).toHaveURL(`/${next}/about/`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages[next].aboutTitle);
    await page.goBack(); await expect(article).toBeVisible();
    expect(unwantedRequests).toEqual([]); expect(errors).toEqual([]);
  });
}

test("About is reachable from the header and preserves the user's map settings on return", async ({ page }) => {
  await page.goto("/zh-Hans/");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await page.locator("#station-search").fill("ENEOS");
  const map = await page.locator(".map-surface.leaflet-container").elementHandle();
  await page.locator("#about-link").click();
  await expect(page).toHaveURL("/zh-Hans/about/");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page.locator(".about-page")).toBeVisible();
  await page.locator(".about-feature").filter({ has: page.getByRole("heading", { name: messages["zh-Hans"].navFindFuel }) }).click();
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect(page.locator("#station-search")).toHaveValue("ENEOS");
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
});

test("About remains useful without JavaScript and links to the guide", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await interceptExternal(context);
  const page = await context.newPage();
  try {
    for (const locale of locales) {
      const t = messages[locale];
      await page.goto(`/${locale}/about/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(t.aboutTitle);
      await expect(page.getByText(t.aboutPriceData, { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "contact@fuel-me-japan.com", exact: true })).toHaveAttribute("href", "mailto:contact@fuel-me-japan.com");
      await expect(page).toHaveTitle(`${t.aboutTitle} | Fuel Me Japan`);
    }
    await page.locator("#refuel-guide-link").click();
    await expect(page).toHaveURL("/th/refuel-guide/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.th.rgTitle);
  } finally { await context.close(); }
});
