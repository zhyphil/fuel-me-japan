import { chooseFuels } from "./fuel-selection";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"];
const messages = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<string, Record<string, string>>;
const en = messages.en;
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const real: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const trigger = (page: Page) => page.locator(".station-filter-trigger:visible");
const panel = (page: Page) => page.locator(".station-filters-dialog");
// Use exact label text while allowing the separate count and Japanese safety label.
const selectOption = (page: Page, label: string) => panel(page).locator(".filter-option").filter({ has: page.locator(".filter-option-label", { hasText: new RegExp(`^${label}$`) }) });
async function open(page: Page) { await trigger(page).click(); await expect(panel(page)).toBeVisible(); }
async function apply(page: Page, count: number, locale = "en") { await panel(page).getByRole("button", { name: messages[locale].sfApply.replace("{count}", count.toLocaleString(locale)), exact: true }).click(); await expect(panel(page)).toHaveCount(0); }
async function fixture(page: Page, brands?: string[]) {
  // Synthetic capabilities on a real partition; source files on disk stay unchanged.
  const file = structuredClone(real);
  file.stations.forEach((station, index) => {
    station.name = `Filter fixture ${String(index).padStart(4, "0")}`;
    station.originalBrand = brands ? brands[index] ?? "Fixture Other" : index < 30 ? index % 2 ? "エネオス" : "ENEOS" : "Fixture Other";
    station.normalizedBrand = index < 30 ? "ENEOS" : "Fixture Other";
    station.paymentVisa = index < 2 ? "YES" : "UNKNOWN";
    station.paymentMastercard = index === 1 || index === 2 ? "YES" : "UNKNOWN";
    station.serviceType = index === 0 ? "SELF" : index === 1 ? "FULL" : "UNKNOWN";
    if (index < 30) { station.lat = file.stations[0].lat; station.lon = file.stations[0].lon; }
  });
  const body = JSON.stringify(file);
  const metadata = structuredClone(manifest);
  Object.assign(metadata.stations.partitions.find((entry) => entry.code === "JP-01")!, { bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: metadata }));
  await page.route(`**${partition.path}`, (route) => route.fulfill({ body, contentType: "application/json" }));
  return file;
}
async function load(page: Page, locale = "en") {
  await page.goto(`/${locale}/`);
  await expect(trigger(page)).toBeDisabled();
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(trigger(page)).toBeEnabled();
}

// Queue submission and Leaflet animation both begin on animation frames.
async function waitForMapAnimation(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let idleFrames = 0;
    function sample() {
      idleFrames = document.querySelector(".leaflet-zoom-anim") ? 0 : idleFrames + 1;
      if (idleFrames >= 3) resolve(); else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
}

test("draft, cancel, reset and apply keep loaded counts and map/list totals consistent", async ({ page }) => {
  await fixture(page); await load(page);
  await open(page);
  await expect(panel(page).getByRole("tab")).toHaveCount(3);
  await selectOption(page, "ENEOS").click();
  await expect(selectOption(page, "ENEOS")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-status p")).toHaveText(en.mapResultCount.replace("{count}", real.stations.length.toLocaleString("en")));
  await panel(page).getByRole("button", { name: en.sfClose }).click();
  await expect(trigger(page)).toBeFocused();
  await open(page); await expect(selectOption(page, "ENEOS")).toHaveAttribute("aria-pressed", "false");
  await selectOption(page, "ENEOS").click(); await apply(page, 30);
  await expect(page.locator(".map-status p")).toHaveText(en.mapResultCount.replace("{count}", "30"));
  await expect(page.locator(".map-pin-cluster")).toHaveText(["30"]);
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.ffShowMore, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(30);
  await open(page); await apply(page, 30);
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
  await open(page);
  await panel(page).getByRole("button", { name: en.sfReset, exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toContainText("1");
  await open(page); await panel(page).getByRole("button", { name: en.sfReset, exact: true }).click();
  await apply(page, real.stations.length);
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
  await expect(page.getByRole("button", { name: en.sfClear, exact: true })).toHaveCount(0);
});

test("payment union, service AND, zero results, independent query and stale detail cleanup", async ({ page }) => {
  // Desktop keeps the map filters available beside the open details.
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page); await load(page);
  await open(page); await selectOption(page, "ENEOS").click(); await apply(page, 30);
  await expect(page.locator(".map-pin-cluster")).toHaveText(["30"]);
  for (let click = 0; click < 3; click++) { await page.locator(".map-pin-cluster").click(); await waitForMapAnimation(page); }
  await expect(page.locator(".cluster-members")).toBeVisible();
  await page.locator(".cluster-members .station-card").first().click();
  await expect(page.locator(".station-detail")).toBeVisible();
  await open(page); await panel(page).getByRole("tab", { name: en.sfPayments }).click();
  await selectOption(page, "Visa").click(); await selectOption(page, "Mastercard").click(); await apply(page, 3);
  await expect(page.locator(".station-detail, .cluster-members")).toHaveCount(0);
  await expect(page.locator(".map-pin-cluster")).toHaveText("3");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(3);
  await open(page); await panel(page).getByRole("tab", { name: en.sfServices }).click();
  await selectOption(page, en.ffFull).click(); await apply(page, 1);
  await open(page);
  await panel(page).getByRole("tab", { name: en.sfBrands }).click();
  await selectOption(page, "ENEOS").click();
  await selectOption(page, "Fixture Other").click();
  await apply(page, 0);
  await expect(page.locator(".map-empty")).toBeVisible();
  await expect(trigger(page)).toBeEnabled();
  await open(page);
  await selectOption(page, "Fixture Other").click();
  await selectOption(page, "ENEOS").click();
  await apply(page, 1);
  await page.locator("#station-search").fill("Filter fixture 0000");
  await expect(page.locator(".map-empty")).toBeVisible();
  await page.getByRole("button", { name: en.sfClear, exact: true }).click();
  await expect(page.locator("#station-search")).toHaveValue("Filter fixture 0000");
  await expect(page.locator(".station-list .station-card")).toHaveCount(1);
  await page.getByRole("button", { name: en.sfClearSearch, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
});

test("applying unchanged filters closes cluster members and station details", async ({ page }) => {
  // Desktop keeps the map filters available beside the open details.
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixture(page); await load(page);
  await open(page); await selectOption(page, "ENEOS").click(); await apply(page, 30);
  await expect(page.locator(".map-pin-cluster")).toHaveText(["30"]);
  for (let click = 0; click < 3; click++) { await page.locator(".map-pin-cluster").click(); await waitForMapAnimation(page); }
  await expect(page.locator(".cluster-members")).toBeVisible();
  await open(page); await apply(page, 30);
  await expect(page.locator(".cluster-members")).toHaveCount(0);
  await page.locator(".map-pin-cluster").click();
  await page.locator(".cluster-members .station-card").first().click();
  await expect(page.locator(".station-detail")).toBeVisible();
  await open(page); await apply(page, 30);
  await expect(page.locator(".station-detail, .cluster-members")).toHaveCount(0);
  await expect(page.locator(".map-status p")).toHaveText(en.mapResultCount.replace("{count}", "30"));
});

test("query and brand search do not change complete-area option counts", async ({ page }) => {
  await fixture(page); await load(page);
  await page.locator("#station-search").fill("Filter fixture 0000");
  await open(page);
  await expect(selectOption(page, "ENEOS").locator(".filter-option-count")).toHaveText("30");
  await panel(page).getByLabel(en.sfBrandSearch, { exact: true }).fill("ENEOS");
  await expect(panel(page).locator(".filter-option:visible")).toHaveCount(1);
  await selectOption(page, "ENEOS").click(); await apply(page, 1);
  await expect(page.locator("#station-search")).toHaveValue("Filter fixture 0000");
  await expect(page.locator(".map-pin-station")).toHaveCount(1);
});

test("changing area, returning to overview and new location clear filters without persistence or extra data fetches", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __locationRequests: 0 });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: () => { (window as unknown as { __locationRequests: number }).__locationRequests++; } } });
  });
  await fixture(page); await load(page);
  await chooseFuels(page, ["DIESEL"]);
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }));
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/")) requests.push(request.url()); });
  await open(page); await selectOption(page, "ENEOS").click(); await apply(page, 30);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } }))).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { __locationRequests: number }).__locationRequests)).toBe(0);
  await page.locator("#prefecture").selectOption("JP-02");
  await expect(trigger(page)).toBeEnabled(); await expect(trigger(page).locator(".filter-count")).toHaveCount(0);
  await page.locator("#prefecture").selectOption("JP-01");
  await open(page); await selectOption(page, "ENEOS").click(); await apply(page, 30);
  await page.getByRole("button", { name: en.mapOverview, exact: true }).click();
  await expect(trigger(page)).toBeDisabled(); await expect(trigger(page).locator(".filter-count")).toHaveCount(0);
  await page.locator("#prefecture").selectOption("JP-01");
  await open(page); await selectOption(page, "ENEOS").click(); await apply(page, 30);
  await page.getByRole("button", { name: en.ffUseLocation, exact: true }).click();
  await expect(trigger(page)).toBeDisabled(); await expect(trigger(page).locator(".filter-count")).toHaveCount(0);
  await page.getByRole("button", { name: en.ffCancel, exact: true }).click();
  await expect(trigger(page)).toBeDisabled(); await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
});

for (const locale of locales) {
  for (const width of [320, 390, 1280]) {
    test(`${locale} filters at ${width}px: keyboard tabs, native modal, missing data and focus return`, async ({ page }) => {
      const t = messages[locale];
      await page.setViewportSize({ width, height: 844 });
      await load(page, locale); // Real, unmodified partition.
      await open(page);
      const brands = panel(page).getByRole("tab", { name: t.sfBrands, exact: true });
      await expect(brands).toBeFocused();
      await expect(panel(page)).toHaveAttribute("aria-modal", "true");
      expect(await panel(page).evaluate((element) => element.matches(":modal"))).toBe(true);
      await page.locator("#prefecture").evaluate((element: HTMLSelectElement) => element.focus());
      await expect(brands).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(panel(page).getByRole("tab", { name: t.sfPayments, exact: true })).toBeFocused();
      await expect(panel(page).getByText(t.sfPaymentHelp, { exact: true })).toBeVisible();
      await expect(panel(page).locator(".filter-unavailable")).toHaveCount(0);
      await expect(selectOption(page, t.sfCash)).toHaveCount(0);
      await expect(selectOption(page, t.sfFleetCard)).toHaveCount(0);
      await panel(page).getByRole("tab", { name: t.sfPayments, exact: true }).focus();
      await page.keyboard.press("End");
      await expect(panel(page).getByRole("tab", { name: t.sfServices, exact: true })).toBeFocused();
      await expect(panel(page).getByText("セルフ", { exact: true })).toBeVisible();
      await expect(selectOption(page, t.sfCounter)).toHaveCount(0);
      await expect(selectOption(page, t.sfTerminal)).toHaveCount(0);
      await expect(panel(page).locator(".filter-option:disabled")).toHaveCount(0);
      await expect(panel(page).locator("[role=tabpanel]:visible .filter-option")).toHaveCount(2);
      await panel(page).getByRole("tab", { name: t.sfServices, exact: true }).focus();
      await page.keyboard.press("Home"); await expect(brands).toBeFocused();
      await page.keyboard.press("ArrowLeft"); await expect(panel(page).getByRole("tab", { name: t.sfServices, exact: true })).toBeFocused();
      expect(await panel(page).evaluate((element) => { const rect = element.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && element.scrollWidth <= element.clientWidth; })).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.keyboard.press("Escape"); await expect(trigger(page)).toBeFocused();
      await expect(panel(page)).toHaveCount(0);
    });
  }
}

test("reviewed logos and alias search agree across filters, map markers and thumbnails", async ({ page }) => {
  await fixture(page, ["ホクレン", "出光", "モービル", "Shell"]);
  await load(page); await open(page);
  for (const [label, asset] of [["ホクレン", "hokuren.svg"], ["Idemitsu", "idemitsu.svg"], ["Mobil", "mobil.svg"]]) {
    const image = selectOption(page, label).locator("img");
    await expect(image).toHaveAttribute("src", `/brands/${asset}`);
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  }
  await expect(selectOption(page, "Shell").locator("img")).toHaveCount(0);
  await panel(page).getByLabel(en.sfBrandSearch, { exact: true }).fill("出光");
  await expect(panel(page).getByRole("tabpanel", { name: en.sfBrands }).locator(".filter-option")).toHaveCount(1);
  await expect(selectOption(page, "Idemitsu")).toBeVisible();
  await panel(page).getByRole("button", { name: en.sfClose }).click();
  await page.locator("#station-search").fill("Filter fixture 0001");
  await expect(page.locator(".map-pin-station img")).toHaveAttribute("src", "/brands/idemitsu.svg");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-mini-map-pin img")).toHaveAttribute("src", "/brands/idemitsu.svg");
});

test("all shipped brand files decode and a missing new logo retains the pump fallback", async ({ page }) => {
  await page.goto("/en/about/");
  await page.locator("#brand-credits > summary").click();
  const registry = JSON.parse(readFileSync("public/brands/sources.json", "utf8")) as { assets: { assetPath: string; symbolAssetPath?: string }[] };
  await expect(page.locator(".brand-credits-list li")).toHaveCount(registry.assets.length);
  const paths = registry.assets.map(asset => asset.symbolAssetPath ?? asset.assetPath);
  const decoded = await page.evaluate(async (urls) => Promise.all(urls.map(async (url) => {
    const image = new Image(); image.src = url;
    try { await image.decode(); return { url, width: image.naturalWidth, height: image.naturalHeight }; }
    catch { return { url, width: 0, height: 0 }; }
  })), paths);
  for (const image of decoded) { expect(image.width, image.url).toBeGreaterThan(0); expect(image.height, image.url).toBeGreaterThan(0); }
  await page.route("**/brands/hokuren.svg", route => route.abort());
  await fixture(page, ["ホクレン"]); await load(page); await open(page);
  const option = selectOption(page, "ホクレン");
  await expect(option.locator("img")).toBeHidden();
  await expect(option.locator(".filter-logo-fallback svg")).toBeVisible();
  await option.click(); await apply(page, 1);
  await expect(page.locator(".map-pin-station img")).toHaveAttribute("src", "/brands/fuel-pump.svg");
});
