import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import { locales } from "./rental-fixtures";

async function expectFilledViewport(page: Page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  // Read related bounds in one browser frame: header measurement can reflow the
  // page just after rotation, so separate boundingBox calls can mix two layouts.
  await expect.poll(async () => page.evaluate(() => {
    const map = document.querySelector(".map-workspace")!.getBoundingClientRect();
    const notes = document.querySelector(".map-notes")!.getBoundingClientRect();
    const attribution = document.querySelector(".map-attribution")!.getBoundingClientRect();
    const available = innerHeight - map.top - notes.height;
    const errors: string[] = [];
    // Small screens may scroll, but the map must consume any spare viewport space.
    const gap = Math.abs(map.height - Math.max(260, available));
    if (gap >= 2) errors.push(`Unused height: ${gap}px`);
    if (document.documentElement.scrollWidth > innerWidth) errors.push("Horizontal overflow");
    const attributionGap = Math.abs(attribution.bottom - map.bottom);
    if (attributionGap >= 2) errors.push(`Attribution gap: ${attributionGap}px`);
    for (const selector of [".station-filter-trigger", ".location-button", ".leaflet-control-zoom-in", ".leaflet-control-zoom-out"]) {
      const box = document.querySelector(selector)!.getBoundingClientRect();
      if (box.top < map.top || box.bottom > attribution.top) errors.push(`Control outside map: ${selector}`);
    }
    return errors;
  })).toEqual([]);
}

for (const locale of locales) test(`${locale}: phone map fills spare height after resizing and loading a prefecture`, async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 760 });
  await page.goto(`/${locale}/`);
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  for (const size of [{ width: 430, height: 760 }, { width: 430, height: 932 }, { width: 390, height: 1050 }]) {
    await page.setViewportSize(size);
    await expectFilledViewport(page);
  }
  await page.locator("#prefecture").selectOption("JP-13");
  await expect(page.locator("#station-search")).toBeVisible();
  await expectFilledViewport(page);
  await page.screenshot({ path: info.outputPath(`prefecture-${locale}-390.png`) });
});

test("collapsed mobile browser chrome does not leave the small-viewport gap", async ({ page, browserName }, info) => {
  test.skip(browserName !== "chromium", "Chromium-only emulation of the small/large viewport difference; WebKit resize cases run separately.");
  await page.setViewportSize({ width: 430, height: 932 });
  const session = await page.context().newCDPSession(page);
  try {
    await page.goto("/zh-Hans/");
    await session.send("Emulation.setSmallViewportHeightDifferenceOverride", { difference: 120 });
    await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
    await page.screenshot({ path: info.outputPath("collapsed-toolbar.png") });
    await expectFilledViewport(page);
    await session.send("Emulation.setSmallViewportHeightDifferenceOverride", { difference: 0 });
    await page.setViewportSize({ width: 430, height: 812 });
    await expectFilledViewport(page);
  } finally { await session.detach(); }
});

test("short screens and rotation preserve usable map, controls and expandable data notes", async ({ page }) => {
  await page.goto("/zh-Hans/");
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  for (const size of [{ width: 320, height: 568 }, { width: 932, height: 430 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(size);
    await expectFilledViewport(page);
  }
  await page.locator(".map-notes > summary").click();
  await expect(page.locator(".map-notes")).toHaveAttribute("open", "");
  expect((await page.locator(".map-workspace").boundingBox())!.height).toBeGreaterThanOrEqual(260);
  const lastLink = page.locator('.map-notes a[href="/data/OSM-NOTICE.txt"]');
  await page.locator(".find-attribution details > summary").click();
  await lastLink.scrollIntoViewIfNeeded();
  await expect(lastLink).toBeInViewport();
  await page.locator(".map-notes > summary").click();
  await expectFilledViewport(page);
});
