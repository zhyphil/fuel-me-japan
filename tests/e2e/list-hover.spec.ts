import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const records: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const first = records.stations[0];
const second = records.stations[1];
test.use({ isMobile: false, hasTouch: false, viewport: { width: 1280, height: 900 } });

async function settleLayout(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    let frames = 0;
    function next() { if (++frames === 4) resolve(); else requestAnimationFrame(next); }
    requestAnimationFrame(next);
  }));
}
async function openList(page: Page) {
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await expect(page.locator(".map-pin-station, .map-pin-cluster").first()).toBeVisible();
  const originalZoom = await zoom(page);
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
  await settleLayout(page);
  return originalZoom;
}
async function zoom(page: Page) {
  return page.locator(".map-surface .leaflet-tile-container").evaluateAll((containers) => {
    const container = containers.find((element) => element.querySelector("img.leaflet-tile"));
    const image = container?.querySelector<HTMLImageElement>("img.leaflet-tile");
    const level = image?.src.match(/\/(\d+)\/\d+\/\d+\.png$/)?.[1];
    if (!container || !level) return null;
    const matrix = new DOMMatrix(getComputedStyle(container).transform);
    return Number(level) + Math.log2(Math.hypot(matrix.a, matrix.b));
  });
}
async function centeredPreview(page: Page, id: string) {
  await expect(page.locator(`.map-pin-station.is-preview[data-map-key="${id}"]`)).toBeVisible();
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(16);
  await expect.poll(async () => {
    const surface = (await page.locator(".map-surface").boundingBox())!;
    const pin = (await page.locator(`[data-map-key="${id}"]`).boundingBox())!;
    return Math.abs(pin.x + pin.width / 2 - surface.x - surface.width / 2) < 3 && Math.abs(pin.y + pin.height / 2 - surface.y - surface.height / 2) < 3;
  }).toBe(true);
}

test("hovering a list station zooms its marker into the overall map without opening details or stealing focus", async ({ page }) => {
  await openList(page);
  const focus = await page.evaluate(() => document.activeElement?.outerHTML);
  await page.locator(`[id="list-${first.id}"]`).hover();
  await centeredPreview(page, first.id);
  await expect(page.locator(".station-row.is-map-preview")).toHaveCount(1);
  await expect(page.locator("#station-title")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.outerHTML)).toBe(focus);
  await page.locator(`[id="thumbnail-${second.id}"]`).hover();
  await centeredPreview(page, second.id);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(1);
});


test("rapid row changes keep only the last preview, and leaving a pending row cancels it", async ({ page }) => {
  await openList(page);
  // Dispatch the two moves in the same browser task, before the hover deadline.
  await page.evaluate(([a, b]) => {
    for (const id of [a, b]) document.getElementById(`list-${id}`)!.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", buttons: 0 }));
  }, [first.id, second.id]);
  await centeredPreview(page, second.id);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(1);
  await page.evaluate((id) => {
    const card = document.getElementById(`list-${id}`)!;
    card.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", buttons: 0 }));
    card.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
  }, first.id);
  await page.waitForTimeout(180); // Beyond the 120ms dwell deadline, the cancelled row must not win.
  await centeredPreview(page, second.id);
});

async function coincidentStations(page: Page) {
  const file = structuredClone(records);
  for (const station of file.stations.slice(0, 4)) {
    station.lat = first.lat; station.lon = first.lon;
    station.name = `Hover same-point fixture ${station.id}`;
  }
  const body = JSON.stringify(file);
  const index = structuredClone(manifest);
  Object.assign(index.stations.partitions.find((entry) => entry.code === "JP-01")!, { bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: index }));
  await page.route(`**${partition.path}`, (route) => route.fulfill({ body, contentType: "application/json" }));
}

test("hovered coincident stations have their own marker and are excluded from the remaining cluster count", async ({ page }) => {
  await coincidentStations(page);
  await openList(page);
  await page.locator("#station-search").fill("Hover same-point fixture");
  await expect(page.locator(".station-card")).toHaveCount(4);
  await page.locator(`[id="list-${second.id}"]`).scrollIntoViewIfNeeded();
  await settleLayout(page);
  await page.locator(`[id="list-${second.id}"]`).hover();
  await centeredPreview(page, second.id);
  await expect(page.locator(".map-pin-cluster")).toHaveText("3");
  const marker = page.locator(`[data-map-key="${second.id}"]`);
  await marker.click();
  await expect(page.locator("#station-title")).toHaveText(`Hover same-point fixture ${second.id}`);
});

test("keyboard focus previews a station and clicking still opens details then restores the card focus", async ({ page }) => {
  await openList(page);
  await page.keyboard.press("Tab"); // Establish keyboard navigation before focusing the card.
  const card = page.locator(`[id="list-${second.id}"]`);
  await card.focus();
  await centeredPreview(page, second.id);
  await expect(card).toBeFocused();
  await card.press("Enter");
  await expect(page.locator("#station-title")).toHaveText(second.name!);
  await page.keyboard.press("Escape");
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
  await expect(card).toBeFocused();
});

test("hover does not overwrite the full-map view saved before entering the list", async ({ page }) => {
  const originalZoom = (await openList(page))!;
  await page.locator(`[id="list-${first.id}"]`).hover();
  await centeredPreview(page, first.id);
  await page.getByRole("button", { name: "Map", exact: true }).click();
  await expect.poll(async () => Math.abs((await zoom(page))! - originalZoom)).toBeLessThan(0.01);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
});

test("changing query or area cancels an obsolete preview without fetching location", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition: () => { throw new Error("Unexpected geolocation"); } } });
  });
  await openList(page);
  const stationRequests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/stations/")) stationRequests.push(request.url()); });
  await page.locator(`[id="list-${first.id}"]`).hover();
  await centeredPreview(page, first.id);
  await page.locator("#station-search").fill("NoHoverMatch_4931");
  await expect(page.locator(".map-pin-station, .map-pin-cluster")).toHaveCount(0);
  await page.locator("#station-search").fill("");
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
  expect(stationRequests).toHaveLength(0);
  await page.locator(`[id="list-${second.id}"]`).dispatchEvent("pointermove", { pointerType: "mouse", buttons: 0 });
  await page.getByRole("button", { name: "Japan overview", exact: true }).click();
  await page.waitForTimeout(180);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  expect((await zoom(page))!).toBeLessThan(10);
});

test("opening a different detail takes precedence over an uncommitted hover", async ({ page }) => {
  await openList(page);
  await page.locator(`[id="list-${first.id}"]`).dispatchEvent("pointermove", { pointerType: "mouse", buttons: 0 });
  await page.locator(`[id="list-${second.id}"]`).click();
  await expect(page.locator("#station-title")).toHaveText(second.name!);
  await page.waitForTimeout(180);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
  const station = (await page.locator(`[data-map-key="${second.id}"]`).boundingBox())!;
  const map = (await page.locator(".map-surface").boundingBox())!;
  expect(Math.abs(station.x + station.width / 2 - map.x - map.width / 2)).toBeLessThan(3);
});

test("touch movement does not trigger hover zoom", async ({ page }) => {
  await openList(page);
  const originalZoom = (await zoom(page))!;
  await page.locator(`[id="list-${first.id}"]`).dispatchEvent("pointermove", { pointerType: "touch", buttons: 0 });
  await page.waitForTimeout(180);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
  expect(await zoom(page)).toBeCloseTo(originalZoom, 2);
});


test("closing cluster members does not revive an earlier hover preview", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await coincidentStations(page);
  await openList(page);
  await page.locator("#station-search").fill("Hover same-point fixture");
  await page.locator(`[id="list-${first.id}"]`).hover();
  await centeredPreview(page, first.id);
  const group = page.locator(".map-pin-cluster");
  await group.press("Enter");
  await expect.poll(() => zoom(page)).toBeGreaterThanOrEqual(18);
  await page.locator(".map-surface").evaluate(() => new Promise<void>((resolve) => {
    const frame = () => document.querySelector(".leaflet-zoom-anim") ? requestAnimationFrame(frame) : resolve();
    requestAnimationFrame(frame);
  }));
  await group.press("Enter");
  await expect(page.locator(".leaflet-control-zoom-in")).toHaveAttribute("aria-disabled", "true");
  await page.locator(".map-surface").evaluate(() => new Promise<void>((resolve) => {
    const frame = () => document.querySelector(".leaflet-zoom-anim") ? requestAnimationFrame(frame) : resolve();
    requestAnimationFrame(frame);
  }));
  await expect(group).toHaveAccessibleName("3 overlapping station records. Open member list.");
  await group.press("Enter");
  await expect(page.locator(".cluster-members .station-card")).toHaveCount(3);
  await page.locator(".cluster-members .detail-close").click();
  await expect(page.locator(".map-workspace.show-list")).toBeVisible();
  await settleLayout(page);
  await expect(page.locator(".map-pin-station.is-preview")).toHaveCount(0);
  await expect(page.locator(".map-pin-cluster")).toHaveText("4");
});
