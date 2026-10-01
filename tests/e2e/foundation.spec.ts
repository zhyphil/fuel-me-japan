import { expect, test, interceptExternal } from "./offline";
import { readFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const languageCases = [
  { locale: "en", label: "English" }, { locale: "zh-Hant", label: "繁體中文" },
  { locale: "ko", label: "한국어" }, { locale: "zh-Hans", label: "简体中文" }, { locale: "th", label: "ไทย" },
].map((language) => ({ ...language, copy: JSON.parse(readFileSync(`src/locales/${language.locale}.json`, "utf8")) }));
for (const language of languageCases) {
  test(`mobile switching and reload: ${language.locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await page.locator(".locale-trigger").click();
    await page
      .locator(".locale-switcher")
      .getByRole("link", { name: language.label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${language.locale}/$`));
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    await expect(page.locator(".locale-current")).toBeVisible();
    await expect(page.locator(".locale-current")).toHaveText(language.label);
    await expect(page).toHaveTitle(language.copy.pageTitle);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://fuel-me-japan.com/${language.locale}/`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "index, follow",
    );
    for (const alternate of languageCases) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${alternate.locale}"]`),
      ).toHaveAttribute("href", `https://fuel-me-japan.com/${alternate.locale}/`);
    }
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", "https://fuel-me-japan.com/en/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      language.copy.mapTitle,
    );
    await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
    await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
    await expect(page.locator(".hero, .task-grid")).toHaveCount(0);
    await expect(
      page.locator(".locale-switcher").locator('[aria-current="page"]'),
    ).toHaveText(language.label);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    await expect(page.locator(".locale-current")).toBeVisible();
    await expect(page.locator(".locale-current")).toHaveText(language.label);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      const locateButton = page.locator(".map-stage").getByRole("button", { name: language.copy.ffUseLocation, exact: true });
      await expect(locateButton).toBeVisible();
      await expect(locateButton).toHaveText("");
      await expect(locateButton.locator('svg[aria-hidden="true"]')).toHaveCount(1);
      const buttonBounds = await locateButton.boundingBox();
      const mapBounds = await page.locator(".map-surface").boundingBox();
      expect(buttonBounds?.width).toBeGreaterThanOrEqual(44);
      expect(buttonBounds?.height).toBeGreaterThanOrEqual(44);
      expect(Boolean(buttonBounds && mapBounds && buttonBounds.x >= mapBounds.x && buttonBounds.y >= mapBounds.y && buttonBounds.x + buttonBounds.width <= mapBounds.x + mapBounds.width && buttonBounds.y + buttonBounds.height <= mapBounds.y + mapBounds.height)).toBe(true);
      await page.locator(".locale-trigger").click();
      for (const link of await page
        .locator(".locale-switcher")
        .getByRole("link")
        .all()) {
        const size = await link.boundingBox();
        expect(size?.height).toBeGreaterThanOrEqual(44);
        expect(size?.width).toBeGreaterThanOrEqual(44);
      }
      await page.locator(".locale-trigger").click();
    }
    expect(errors).toEqual([]);
  });
}
test("localized static HTML is useful without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  await interceptExternal(context);
  const page = await context.newPage();
  await page.goto(
    `${process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173"}/ko/`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    languageCases.find((language) => language.locale === "ko")!.copy.mapTitle,
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /일본/,
  );
  await page.locator(".locale-trigger").click();
  await page.getByRole("link", { name: "ไทย", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    languageCases.find((language) => language.locale === "th")!.copy.mapTitle,
  );
  await context.close();
});
test("map home requests only data indexes and map configuration without location, storage or analytics", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: () => {
          throw new Error("Unexpected geolocation request");
        },
        watchPosition: () => {
          throw new Error("Unexpected geolocation watch");
        },
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (["fetch", "xhr", "ping"].includes(request.resourceType()))
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  await expect(page.locator(".hero, .task-grid")).toHaveCount(0);
  await page.locator(".locale-trigger").click();
  await page.getByRole("link", { name: "繁體中文", exact: true }).click();
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect([...new Set(requests.map((url) => new URL(url).pathname))].sort()).toEqual([
    "/data/manifest.json", manifest.sourceRegistry.path, "/runtime-map-provider.json",
  ]);
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
});
test("shipped registry and build provenance match the M0.1 ingestion manifest", async ({ request }) => {
  const registryResponse = await request.get("/data/source-registry.json");
  expect(registryResponse.ok()).toBe(true);
  const registry = await registryResponse.json();
  expect(registry.sources).toHaveLength(5);
  for (const source of registry.sources) {
    const approved = ["osm", "geofabrik", "meti-prices"].includes(source.id);
    expect(source.productionEnabled).toBe(approved);
    expect(source.status).toBe(approved ? "APPROVED" : "PENDING_REVIEW");
    if (approved) expect(source.fetchedAt).toBeTruthy();
    else expect(source.fetchedAt).toBeNull();
  }
  const manifestResponse = await request.get("/data/manifest.json");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const provenanceResponse = await request.get("/build-provenance.json");
  expect(provenanceResponse.ok()).toBe(true);
  const provenance = await provenanceResponse.json();
  expect(provenance.milestone).toBe("M0.1");
  expect(provenance.ingestedSources).toEqual(manifest.sources);
  expect(provenance.stationCount).toBe(manifest.stations.count);
  expect(provenance.priceRecordCount).toBe(141);
  expect(provenance.surveyDate).toBe(manifest.prices.surveyDate);
  expect(provenance.sourceRegistry).toEqual(manifest.sourceRegistry);
});
test("desktop layout and keyboard navigation remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: "test-results/foundation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/foundation-mobile.png",
    fullPage: true,
  });
});

for (const width of [320, 1280]) test(`language dropdown ${width}px: current language, keyboard and dismissal`, async ({ page, browserName }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/zh-Hans/");
  const menu = page.locator(".locale-switcher details");
  const trigger = menu.locator("summary");
  await expect(trigger).toHaveAccessibleName("语言: 简体中文");
  await expect(trigger).toHaveText("简体中文");
  await expect(trigger.locator('svg[aria-hidden="true"]')).toHaveCount(1);
  await expect(menu.locator(".locale-menu")).not.toBeVisible();
  const bounds = await trigger.boundingBox();
  expect(bounds!.width).toBeGreaterThanOrEqual(44); expect(bounds!.height).toBeGreaterThanOrEqual(44);
  const brandBounds = await page.locator(".brand").boundingBox();
  expect(bounds!.x).toBeGreaterThan(brandBounds!.x + brandBounds!.width);
  expect(Math.abs(bounds!.y - brandBounds!.y)).toBeLessThan(5);
  await trigger.focus(); await page.keyboard.press("Enter");
  await expect(menu.getByRole("link")).toHaveText(["English", "繁體中文", "한국어", "简体中文", "ไทย"]);
  await page.keyboard.press("Tab");
  await expect(menu.getByRole("link", { name: "English", exact: true })).toBeFocused();
  const dropdown = await menu.locator(".locale-menu").boundingBox();
  expect(dropdown!.x).toBeGreaterThanOrEqual(0); expect(dropdown!.x + dropdown!.width).toBeLessThanOrEqual(width);
  expect(await menu.locator('a[lang="en"]').evaluate(node => {
    const rect = node.getBoundingClientRect();
    return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(menu).not.toHaveAttribute("open"); await expect(trigger).toBeFocused();
  await trigger.click(); await page.getByRole("heading", { level: 1 }).click();
  await expect(menu).not.toHaveAttribute("open");
  await trigger.focus(); await page.keyboard.press("Enter");
  await menu.getByRole("link", { name: "ไทย", exact: true }).focus(); await page.keyboard.press("Tab");
  await expect(menu).not.toHaveAttribute("open");
  await trigger.click();
  await page.screenshot({ path: `reports/evidence/language-dropdown/${browserName}-${width}.png` });
  await menu.getByRole("link", { name: "English", exact: true }).click();
  await expect(page).toHaveURL("/en/"); await expect(menu).not.toHaveAttribute("open");
  await expect(trigger).toHaveAccessibleName("Language: English");
  await expect(trigger).toHaveText("English");
});
