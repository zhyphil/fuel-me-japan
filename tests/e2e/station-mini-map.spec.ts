import { chooseFuels } from "./fuel-selection";
import { stationBrand } from "../../src/lib/station-brand";
import { readFileSync, mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const en = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const records: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));

async function openList(page: Page, locale = "en") {
  const copy = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
  await page.goto(`/${locale}/`);
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await page.getByRole("button", { name: copy.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
}

test("each list station has its own lazy map and returns keyboard focus after opening details", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await openList(page);
  const maps = page.locator(".station-list .station-mini-map-open");
  await expect(maps).toHaveCount(25);
  await expect(maps.first().locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(maps.last().locator(".station-mini-map-tiles img")).toHaveCount(0);
  await expect(page.locator(".leaflet-container")).toHaveCount(1);
  const firstId = (await maps.first().getAttribute("id"))!.replace("thumbnail-", "");
  const first = records.stations.find((station) => station.id === firstId)!;
  await expect(maps.first()).toHaveAccessibleName(en.smOpen.replace("{name}", first.name || en.ffUnnamed));
  await maps.first().focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#station-title")).toHaveText(first.name || en.ffUnnamed);
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
  await expect(page.locator(`[id="thumbnail-${firstId}"]`)).toBeFocused();
  await maps.last().scrollIntoViewIfNeeded();
  await expect(maps.last().locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(maps.first().locator(".station-mini-map-tiles img")).toHaveCount(0);
});

for (const width of [320, 390, 768, 1280]) {
  test(`station thumbnails fit each card at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openList(page, "zh-Hans");
    const row = page.locator(".station-row.has-mini-map").first();
    await row.scrollIntoViewIfNeeded();
    await expect(row.locator(".station-mini-map-message")).toHaveCount(0);
    const container = (await row.boundingBox())!;
    const thumb = (await row.locator(".station-mini-map-open").boundingBox())!;
    const card = (await row.locator(".station-card").boundingBox())!;
    const favorite = (await row.locator(".favorite-button").boundingBox())!;
    const attribution = (await row.locator(".station-mini-map-attribution").boundingBox())!;
    expect(thumb.width).toBeGreaterThanOrEqual(140);
    expect(thumb.height).toBeGreaterThanOrEqual(104);
    for (const box of [thumb, card, favorite, attribution]) {
      expect(box.x).toBeGreaterThanOrEqual(container.x);
      expect(box.x + box.width).toBeLessThanOrEqual(container.x + container.width);
      expect(box.y + box.height).toBeLessThanOrEqual(container.y + container.height);
    }
    for (const box of [favorite, attribution]) expect(box.height).toBeGreaterThanOrEqual(44);
    expect(thumb.x + thumb.width <= card.x || thumb.y + thumb.height <= card.y).toBe(true);
    expect(card.x + card.width).toBeLessThanOrEqual(favorite.x);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(row.locator(".station-mini-map-attribution")).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
    mkdirSync("reports/evidence/m01/station-mini-maps", { recursive: true });
    await page.screenshot({ path: `reports/evidence/m01/station-mini-maps/layout-${width}-offline.png`, fullPage: true });
  });
}

test("wheel over a thumbnail scrolls the list without zooming the overall map", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await openList(page);
  const thumbnail = page.locator(".station-mini-map-open").first();
  await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail.locator(".station-mini-map-message")).toHaveCount(0);
  await thumbnail.hover();
  // Hover now intentionally zooms the overall map. Measure wheel behavior after that completes.
  const id = (await thumbnail.getAttribute("id"))!.replace("thumbnail-", "");
  await expect(page.locator(`.map-pin-station.is-preview[data-map-key="${id}"]`)).toBeVisible();
  const before = await page.locator(".map-list-panel").evaluate((element) => element.scrollTop);
  const mapTiles = await page.locator(".map-surface .leaflet-tile").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src).sort());
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.locator(".map-list-panel").evaluate((element) => element.scrollTop)).toBeGreaterThan(before);
  expect(await page.locator(".map-surface .leaflet-tile").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src).sort())).toEqual(mapTiles);
});

test("thumbnails follow favorites, search and fuel selection without separate configuration requests", async ({ page }) => {
  const configRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("runtime-map-provider.json")) configRequests.push(request.url()); });
  await page.setViewportSize({ width: 1280, height: 844 });
  await openList(page);
  const row = page.locator(".station-row.has-mini-map").first();
  const id = (await row.locator(".station-card").getAttribute("id"))!.replace("list-", "");
  await expect(row.locator(".station-mini-map-open")).toHaveAttribute("id", `thumbnail-${id}`);
  await row.locator(".favorite-button").click();
  await page.locator("#list-mode-favorites").click();
  await expect(page.locator(".station-row.has-mini-map")).toHaveCount(1);
  await expect(page.locator(".station-mini-map-open")).toHaveAttribute("id", `thumbnail-${id}`);
  await expect(page.locator(".station-mini-map-message")).toHaveCount(0);
  const tiles = await page.locator(".station-mini-map-tiles img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src));
  await chooseFuels(page, ["DIESEL"]);
  expect(await page.locator(".station-mini-map-tiles img").evaluateAll((images) => images.map((image) => (image as HTMLImageElement).src))).toEqual(tiles);
  await page.locator("#station-search").fill("NoSuchThumbnailStation_318");
  await expect(page.locator(".station-mini-map-open")).toHaveCount(0);
  await page.locator("#station-search").fill("");
  await expect(page.locator(".station-mini-map-open")).toHaveAttribute("id", `thumbnail-${id}`);
  expect(configRequests).toHaveLength(1);
});

test("failed thumbnail tiles show a fallback and still open the correct station", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 503, body: "Offline failure fixture" }));
  await openList(page);
  const thumb = page.locator(".station-mini-map-open").first();
  await expect(thumb.locator(".station-mini-map-message")).toHaveText(en.smUnavailable);
  const id = (await thumb.getAttribute("id"))!.replace("thumbnail-", "");
  await thumb.click();
  await expect(page.locator("#station-title")).toHaveText(records.stations.find((station) => station.id === id)!.name || en.ffUnnamed);
});

test("rejected map configuration is shared with thumbnails and can be retried", async ({ page }) => {
  let allow = false;
  const urls: string[] = [];
  page.on("request", (request) => { if (request.url().includes("tile.openstreetmap.org")) urls.push(request.url()); });
  await page.route("**/runtime-map-provider.json", (route) => allow ? route.continue() : route.fulfill({ json: { tileUrl: "https://unapproved.invalid/{z}/{x}/{y}.png" } }));
  await page.setViewportSize({ width: 1280, height: 844 });
  await openList(page);
  const thumb = page.locator(".station-mini-map-open").first();
  await expect(thumb.locator(".station-mini-map-message")).toHaveText(en.smUnavailable);
  expect(urls).toHaveLength(0);
  await expect(page.locator(".station-mini-map-tiles img")).toHaveCount(0);
  allow = true;
  await page.locator(".map-message .button").click();
  await expect(thumb.locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(thumb.locator(".station-mini-map-message")).toHaveCount(0);
});

for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"]) {
  test(`thumbnail labels and brand fallback use ${locale}`, async ({ page }) => {
    const copy = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
    await openList(page, locale);
    const maps = page.locator(".station-mini-map-open");
    const firstId = (await maps.first().getAttribute("id"))!.replace("thumbnail-", "");
    const first = records.stations.find((station) => station.id === firstId)!;
    await expect(maps.first()).toHaveAccessibleName(copy.smOpen.replace("{name}", first.name || copy.ffUnnamed));
    for (const station of records.stations.slice(0, 25)) {
      const logo = page.locator(`[id="thumbnail-${station.id}"] .station-mini-map-pin img`);
      const expected = stationBrand(station).logo ?? "/brands/fuel-pump.svg";
      await expect(logo).toHaveAttribute("src", expected);
    }
  });
}
