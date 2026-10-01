import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const zh: Record<string, string> = JSON.parse(readFileSync("src/locales/zh-Hans.json", "utf8"));
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find(part => part.code === "JP-13")!;
const file: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const station = file.stations.find(row => row.name && file.stations.filter(other => other.name?.includes(row.name!)).length === 1)!;

async function openDetail(page: Page, navigate = true) {
  if (navigate) await page.goto("/zh-Hans/");
  await page.locator("#prefecture").selectOption("JP-13");
  await page.locator("#station-search").fill(station.name!);
  const marker = page.locator(`[data-map-key="${station.id}"]`);
  await expect(marker).toBeVisible();
  await marker.scrollIntoViewIfNeeded();
  const scrollY = await page.evaluate(() => window.scrollY);
  await marker.click();
  await expect(page.locator("#station-title")).toHaveText(station.name!);
  return { marker, scrollY };
}

for (const size of [{ width: 430, height: 740 }, { width: 390, height: 664 }, { width: 320, height: 568 }]) {
  test(`mobile detail gives readable full-height content at ${size.width}px and restores the map`, async ({ page }, info) => {
    await page.setViewportSize(size);
    const { marker, scrollY } = await openDetail(page);
    const panel = page.locator(".map-detail-panel");
    await page.screenshot({ path: info.outputPath("detail-open.png") });
    const box = (await panel.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(size.height + 1);
    expect(box.height).toBeGreaterThanOrEqual(size.height * .95);
    await expect(page.locator("#station-title")).toBeFocused();
    const scroll = page.locator(".map-detail-scroll");
    const area = (await scroll.boundingBox())!;
    expect(area.height).toBeGreaterThan(size.height * .7);
    const header = await page.locator(".map-detail-header").boundingBox();
    await page.locator("#station-title").press("PageDown");
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
    expect(await page.locator(".map-detail-header").boundingBox()).toEqual(header);
    await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(page.getByRole("link", { name: zh.ffGoogle, exact: true })).toBeInViewport();
    await expect(page.locator(".detail-close")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("detail-bottom.png") });
    await page.locator(".detail-close").click();
    await expect(panel).toHaveCount(0);
    await expect(marker).toBeFocused();
    expect(await page.evaluate(() => document.body.style.position)).toBe("");
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollY)).toBeLessThan(3);
    await expect(page.locator("#prefecture")).toBeEnabled();
  });
}

test("mobile detail scroll gestures over text and both edges stay inside the panel", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Native touch injection requires CDP; WebKit layout and keyboard scrolling are covered separately.");
  await page.setViewportSize({ width: 430, height: 740 });
  await openDetail(page);
  const scroll = page.locator(".map-detail-scroll");
  const box = (await scroll.boundingBox())!;
  const pagePosition = await page.evaluate(() => ({ y: scrollY, headerY: document.querySelector(".site-header")!.getBoundingClientRect().y }));
  const cdp = await page.context().newCDPSession(page);
  // Real browser input events, not synthetic DOM touch handlers or an iPhone device.
  for (const fraction of [.08, .5, .92]) {
    await scroll.evaluate(el => { el.scrollTop = 0; });
    const x = box.x + box.width * fraction;
    const y = box.y + Math.min(box.height - 50, 360);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
    for (let delta = 20; delta <= 200; delta += 20) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - delta, id: 1 }] });
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => scroll.evaluate(el => el.scrollTop)).toBeGreaterThan(60);
    expect(await page.evaluate(() => ({ y: scrollY, headerY: document.querySelector(".site-header")!.getBoundingClientRect().y }))).toEqual(pagePosition);
  }
  await scroll.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => ({ y: scrollY, headerY: document.querySelector(".site-header")!.getBoundingClientRect().y }))).toEqual(pagePosition);
  await cdp.detach();
});

test("detail adapts to browser height, landscape and desktop without a stale page lock", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 740 });
  await openDetail(page);
  const panel = page.locator(".map-detail-panel");
  for (const size of [{ width: 430, height: 600 }, { width: 932, height: 430 }]) {
    await page.setViewportSize(size);
    await expect.poll(() => panel.evaluate(el => Math.round(el.getBoundingClientRect().height))).toBe(size.height);
    await expect(page.locator(".detail-close")).toBeInViewport();
    await expect(page.locator("#station-title")).toBeInViewport();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(() => panel.evaluate(el => el.matches(":modal"))).toBe(false);
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
  const mapBox = (await page.locator(".map-stage").boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(mapBox.x + mapBox.width - 1);
  await page.locator("#station-title").press("Escape");
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: zh.mapList, exact: true }).click();
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
});

test("leaving home via browser history releases the detail overlay and page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 740 });
  await page.goto("/zh-Hans/about/");
  await page.locator("#find-fuel-link").click();
  await openDetail(page, false);
  await page.goBack();
  await expect(page).toHaveURL("/zh-Hans/about/");
  await expect(page.locator(".map-detail-panel")).toHaveCount(0);
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
  await expect(page.locator(".about-page")).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL("/zh-Hans/");
  await expect(page.locator(".map-detail-panel")).toHaveCount(0);
  await expect(page.locator("#prefecture")).toHaveValue("JP-13");
  await expect(page.locator("#station-search")).toHaveValue(station.name!);
});
