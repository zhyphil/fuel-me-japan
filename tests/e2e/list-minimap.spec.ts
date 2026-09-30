import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import { FAVORITES_KEY } from "../../src/lib/favorites";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const en: Record<string, string> = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const records: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const unique = records.stations.find((station) => station.address && records.stations.filter((other) => other.address?.includes(station.address!)).length === 1)!;

async function openList(page: Page) {
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
}

for (const width of [320, 390, 768, 1280]) {
  test(`list and mini-map at ${width}px share usable space with independent list scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await openList(page);
    const stage = await page.locator(".map-stage").boundingBox();
    const list = await page.locator(".map-list-panel").boundingBox();
    expect(stage).not.toBeNull(); expect(list).not.toBeNull();
    if (width <= 650) {
      expect(stage!.y + stage!.height).toBeLessThanOrEqual(list!.y + 1);
      expect(stage!.height).toBeGreaterThanOrEqual(200);
      expect(list!.height).toBeGreaterThanOrEqual(320);
    } else {
      expect(list!.x + list!.width).toBeLessThanOrEqual(stage!.x + 1);
      expect(stage!.width).toBeGreaterThanOrEqual(300);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator(".map-surface.leaflet-container")).toHaveCount(1);
    await expect(page.locator(".location-button:visible")).toHaveCount(1);
    await expect(page.locator(".station-filter-trigger:visible")).toHaveCount(1);
    for (const selector of [".location-button", ".station-filter-trigger", ".leaflet-control-zoom-in", ".leaflet-control-zoom-out"]) {
      const box = await page.locator(selector).boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    await page.locator(".map-list-panel").evaluate((element) => { element.scrollTop = 450; });
    expect(await page.locator(".map-list-panel").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator(".map-stage").boundingBox()).toEqual(stage);
    await page.locator(".map-list-panel").evaluate((element) => { element.scrollTop = 0; });
    mkdirSync("reports/evidence/m01/list-minimap", { recursive: true });
    await page.screenshot({ path: `reports/evidence/m01/list-minimap/layout-${width}-offline.png`, fullPage: true });
    // A single filtered station must fit its full droplet, including on the compact map.
    await page.locator("#station-search").fill(unique.address!);
    await expect.poll(async () => {
      const surface = await page.locator(".map-surface").boundingBox();
      const pin = await page.locator(`[data-map-key="${unique.id}"]`).boundingBox();
      return Boolean(surface && pin && pin.x >= surface.x && pin.y >= surface.y && pin.x + pin.width <= surface.x + surface.width && pin.y + pin.height <= surface.y + surface.height);
    }).toBe(true);
  });
}

test("a mini-map marker opens details then returns to the same list and marker focus", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await openList(page);
  await page.locator("#station-search").fill(unique.address!);
  await expect(page.locator(".station-card")).toHaveCount(1);
  const marker = page.locator(`[data-map-key="${unique.id}"]`);
  await expect(marker).toBeVisible();
  await marker.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#station-title")).toHaveText(unique.name || en.ffUnnamed);
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
  await expect(marker).toBeFocused();
  await expect(page.locator("#station-search")).toHaveValue(unique.address!);
  const card = page.locator(`[id="list-${unique.id}"]`);
  await card.click();
  await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
  await expect(card).toBeFocused();
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
});

test("favorites and query synchronize mini-map markers without loading another partition", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 844 });
  await page.addInitScript(({ key, entry }) => localStorage.setItem(key, JSON.stringify({ version: 1, entries: [entry] })), {
    key: FAVORITES_KEY, entry: { id: unique.id, partition: unique.prefectureCode },
  });
  await openList(page);
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/stations/")) requests.push(request.url()); });
  await page.locator("#list-mode-favorites").click();
  await expect(page.locator(".station-card")).toHaveCount(1);
  await expect(page.locator(".map-pin-station")).toHaveCount(1);
  await expect(page.locator(`[data-map-key="${unique.id}"]`)).toBeVisible();
  await page.locator("#station-search").fill("NoSuchMiniMapStation_0381");
  await expect(page.locator(".station-card, .map-pin-station, .map-pin-cluster")).toHaveCount(0);
  await page.locator("#station-search").fill("");
  await expect(page.locator(".map-pin-station")).toHaveCount(1);
  await page.locator(".map-list-panel .favorite-button").click();
  await expect(page.locator(".station-card, .map-pin-station, .map-pin-cluster")).toHaveCount(0);
  expect(requests.map((url) => new URL(url).pathname)).toEqual([partition.path]);
});

test("mini-map tile errors do not cover filter or location controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.route("https://tile.openstreetmap.org/**", (route) => route.fulfill({ status: 503, body: "Offline test failure" }));
  await openList(page);
  const message = page.locator(".map-message.map-error");
  await expect(message).toBeVisible();
  const error = await message.boundingBox();
  for (const selector of [".station-filter-trigger", ".location-button"]) {
    const control = await page.locator(selector).boundingBox();
    expect(error!.x + error!.width <= control!.x || control!.x + control!.width <= error!.x || error!.y + error!.height <= control!.y || control!.y + control!.height <= error!.y).toBe(true);
  }
  await page.locator(".station-filter-trigger").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});


test("mini-map cluster details return through members to the list", async ({ page }) => {
  const file = structuredClone(records);
  for (const station of file.stations.slice(0, 2)) {
    station.lat = file.stations[0].lat; station.lon = file.stations[0].lon;
    station.name = "Mini-map overlapping station";
  }
  const body = JSON.stringify(file);
  const index = structuredClone(manifest);
  Object.assign(index.stations.partitions.find((entry) => entry.code === "JP-01")!, {
    bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex"),
  });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: index }));
  await page.route(`**${partition.path}`, (route) => route.fulfill({ body, contentType: "application/json" }));
  await openList(page);
  await page.locator("#station-search").fill("Mini-map overlapping station");
  await expect(page.locator(".map-pin-cluster")).toHaveText("2");
  for (let click = 0; click < 3; click++) {
    await page.locator(".map-pin-cluster").click();
    await page.evaluate(() => new Promise<void>((resolve) => {
      let idleFrames = 0;
      function sample() {
        idleFrames = document.querySelector(".leaflet-zoom-anim") ? 0 : idleFrames + 1;
        if (idleFrames >= 3) resolve(); else requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }));
  }
  await expect(page.locator(".cluster-members .station-card")).toHaveCount(2);
  await expect(page.locator(".leaflet-control-zoom-in")).toHaveAttribute("aria-disabled", "true");
  const member = page.locator(`[id="members-${file.stations[0].id}"]`);
  await member.click();
  await expect(page.locator("#station-title")).toHaveText("Mini-map overlapping station");
  await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
  await expect(member).toBeFocused();
  await page.getByRole("button", { name: en.mapCloseMembers, exact: true }).click();
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
  await expect(page.locator(".map-pin-cluster")).toBeFocused();
  await expect(page.locator(".map-list-panel .station-card")).toHaveCount(2);
});
