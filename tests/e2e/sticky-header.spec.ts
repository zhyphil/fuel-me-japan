import type { Page } from "@playwright/test";
import { test, expect, interceptExternal } from "./offline";
import { locales, messages, rentalFixtures } from "./rental-fixtures";

async function settleNavigation(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

async function expectPinned(page: Page) {
  const header = page.locator(".site-header");
  await expect.poll(async () => Math.abs((await header.boundingBox())!.y)).toBeLessThan(1);
  const box = (await header.boundingBox())!;
  for (const selector of [".brand", ".locale-trigger", ".primary-navigation a"]) {
    for (const control of await header.locator(selector).all()) {
      await expect(control).toBeInViewport({ ratio: 1 });
      const bounds = (await control.boundingBox())!;
      expect(bounds.y).toBeGreaterThanOrEqual(box.y);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(box.y + box.height);
      expect(await control.evaluate(el => {
        const rect = el.getBoundingClientRect();
        const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
        return !!target && el.contains(target);
      })).toBe(true);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  return box;
}

for (const locale of locales) test(`${locale}: language and navigation remain usable after scrolling to the bottom`, async ({ page }, info) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/${locale}/about/`);
  await settleNavigation(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(400);
  await expectPinned(page);
  const scroll = await page.evaluate(() => scrollY);
  await page.locator(".locale-trigger").click();
  expect(await page.evaluate(() => scrollY)).toBe(scroll);
  const menu = page.locator(".locale-menu");
  await expect(menu).toBeInViewport({ ratio: 1 });
  const next = locales[(locales.indexOf(locale) + 1) % locales.length];
  await menu.locator(`a[lang="${next}"]`).click();
  await expect(page).toHaveURL(`/${next}/about/`);
  await expect(page.locator("h1")).toHaveText(messages[next].aboutTitle);
  await settleNavigation(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectPinned(page);
  await page.locator("#refuel-guide-link").click();
  await expect(page).toHaveURL(`/${next}/refuel-guide/`);
  await expect(page.locator("h1")).toHaveText(messages[next].rgTitle);
  await settleNavigation(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectPinned(page);
  await page.screenshot({ path: info.outputPath(`header-${locale}-320.png`) });
});

for (const width of [320, 430, 1280]) test(`${width}px: header stays pinned across long pages and the map home`, async ({ page }, info) => {
  await rentalFixtures(page); await page.setViewportSize({ width, height: 740 });
  for (const path of ["about/", "refuel-guide/", "return-car/", "return-car/times-naha-airport/", ""]) {
    await page.goto(`/zh-Hans/${path}`);
    await settleNavigation(page);
    if (path === "return-car/") await expect(page.locator(".rental-card")).toHaveCount(25);
    else if (path.includes("times-naha")) await expect(page.locator("#return-fuel")).toBeVisible();
    else if (!path) await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
    await expectPinned(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectPinned(page);
    const scroll = await page.evaluate(() => scrollY);
    await page.locator(".locale-trigger").click();
    await expect(page.locator(".locale-menu")).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => scrollY)).toBe(scroll);
    await page.keyboard.press("Escape");
    if (path === "return-car/") await page.screenshot({ path: info.outputPath(`header-directory-${width}.png`) });
    if (!path && width === 1280) {
      // Keep the desktop map within the original viewport layout.
      expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(742);
      expect((await page.locator(".map-surface").boundingBox())!.height).toBeGreaterThan(300);
    }
  }
});

test("sticky map, anchors and responsive header height leave room for the header", async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/return-car/times-naha-airport/");
  await expect(page.locator("#return-fuel")).toBeVisible();
  const map = page.locator(".rental-detail-layout > .rental-map-wrap");
  await page.evaluate(() => window.scrollTo(0, 300));
  const header = await expectPinned(page);
  expect((await map.boundingBox())!.y).toBeGreaterThanOrEqual(header.height + 12);
  for (const size of [{ width: 320, height: 740 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size);
    await page.goto("/en/about/");
    await settleNavigation(page);
    await page.locator(".about-limits").evaluate(el => el.scrollIntoView({ block: "start" }));
    const top = await expectPinned(page);
    expect((await page.locator(".about-limits").boundingBox())!.y).toBeGreaterThanOrEqual(top.height);
    await page.locator(".locale-trigger").click();
    await expect(page.locator(".locale-menu")).toBeInViewport({ ratio: 1 });
    await page.keyboard.press("Escape");
  }
});

test("prerendered header remains pinned without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 430, height: 740 }, isMobile: true });
  await interceptExternal(context);
  const page = await context.newPage();
  try {
    await page.goto("/zh-Hans/about/");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectPinned(page);
    await page.locator(".locale-trigger").click();
    await expect(page.locator(".locale-menu")).toBeInViewport({ ratio: 1 });
  } finally { await context.close(); }
});
