import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { test, expect, offlineTile } from "./offline";
import { prefectureName } from "../../src/lib/find-fuel";
import type { DataManifest, StationFile } from "../../src/lib/stations";

const en: Record<string, string> = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((entry) => entry.code === "JP-01")!;
const realFile: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
async function home(page: Page) {
  await page.goto("/en/");
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
}
async function overlapFixture(page: Page) {
  // Display-only fixture: preserves real source IDs and contracts; never writes POI data.
  const file = structuredClone(realFile);
  for (const [index, station] of file.stations.slice(0, 30).entries()) {
    station.lat = file.stations[0].lat; station.lon = file.stations[0].lon;
    station.name = `Overlap fixture ${String(index).padStart(2, "0")}`;
  }
  const body = JSON.stringify(file);
  const fixture = structuredClone(manifest);
  Object.assign(fixture.stations.partitions.find((entry) => entry.code === "JP-01")!, {
    bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex"),
  });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: fixture }));
  await page.route(`**${partition.path}`, (route) => route.fulfill({ body, contentType: "application/json" }));
  return file.stations.slice(0, 30);
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

test("overview counts match every manifest region; selecting and panning load only its partition", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/")) requests.push(new URL(request.url()).pathname); });
  await home(page);
  await expect(page.locator(".hero, .task-grid")).toHaveCount(0);
  const counts = await page.locator(".map-pin-region, .map-pin-region-group").allTextContents();
  expect(counts.reduce((sum, count) => sum + Number(count.replace(/[^0-9]/g, "")), 0)).toBe(manifest.stations.count);
  await expect(page.locator(".map-pin-region-group").first()).toBeVisible();
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".region-list .station-card")).toHaveCount(47);
  for (const region of manifest.stations.partitions.filter((entry) => entry.code !== "UNKNOWN" && entry.count)) {
    const entry = page.locator(".region-list .station-card").filter({ hasText: prefectureName(region.code)! });
    await expect(entry).toContainText(en.mapRecordCount.replace("{count}", region.count.toLocaleString("en")));
  }
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  expect(requests.sort()).toEqual(["/data/manifest.json", manifest.sourceRegistry.path].sort());
  for (let step = 0; step < 8 && !await page.locator('button[data-map-key="JP-01"]').count(); step++) {
    await page.locator('.map-pin-region-group[data-region-codes*="JP-01"]').click();
    await waitForMapAnimation(page);
  }
  await page.locator('button[data-map-key="JP-01"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#station-search")).toBeVisible();
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await page.locator(".map-surface").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  expect(requests.filter((path) => path.includes("/stations/"))).toEqual([partition.path]);
  expect(requests.some((path) => path.includes("/prices/"))).toBe(false);
});

test("query synchronizes map and list, marker opens the real record, and Escape restores marker focus", async ({ page }) => {
  await home(page);
  await page.locator("#prefecture").selectOption("JP-01");
  const unique = realFile.stations.find((station) => station.address && realFile.stations.filter((row) => row.address?.includes(station.address!)).length === 1)!;
  await page.locator("#station-search").fill(unique.address!);
  const marker = page.locator(`button[data-map-key="${unique.id}"]`);
  await expect(marker).toBeVisible();
  await expect(page.locator(".map-pin-station")).toHaveCount(1);
  await marker.focus(); await page.keyboard.press("Enter");
  await expect(page.locator("#station-title")).toHaveText(unique.name || en.ffUnnamed);
  await expect(page.locator("#station-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".station-detail")).toHaveCount(0);
  await expect(marker).toBeFocused();
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(1);
  const item = page.locator(`[id="list-${unique.id}"]`);
  await item.focus(); await page.keyboard.press("Enter");
  await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
  await expect(item).toBeFocused();
  await page.locator("#station-search").fill("NoSuchStation_zz_9213");
  await expect(page.locator(".station-card, .map-pin-station, .map-pin-cluster")).toHaveCount(0);
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  await expect(page.getByText(en.ffNoResults, { exact: true })).toBeVisible();
});

test("cluster counts exceed list pagination and all 30 identical-coordinate members remain accessible", async ({ page }) => {
  const records = await overlapFixture(page);
  await home(page);
  await page.locator("#prefecture").selectOption("JP-01");
  await page.locator("#station-search").fill("Overlap fixture");
  await expect(page.locator(".map-pin-cluster")).toHaveText("30");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  const cluster = page.locator(".map-pin-cluster");
  for (let click = 0; click < 3; click++) { await cluster.click(); await waitForMapAnimation(page); }
  await expect(page.locator(".cluster-members .station-card")).toHaveCount(30);
  for (const station of records) {
    await page.locator(`[id="members-${station.id}"]`).click();
    await expect(page.locator("#station-title")).toHaveText(station.name!);
    await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
    await expect(page.locator(`[id="members-${station.id}"]`)).toBeFocused();
    await expect(page.locator(`[id="members-${station.id}"]`)).toBeInViewport();
  }
  await page.getByRole("button", { name: en.mapCloseMembers, exact: true }).click();
  await expect(cluster).toBeFocused();
});

test("failed tile images retain list access and explicit retry reloads valid offline PNGs", async ({ page }) => {
  let failing = true;
  let successes = 0;
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    if (failing) await route.fulfill({ status: 503, body: "offline fixture failure" });
    else { successes++; await route.fulfill({ contentType: "image/png", body: offlineTile }); }
  });
  await home(page);
  await expect(page.getByText(en.mapTileError, { exact: true })).toBeVisible();
  await page.locator("#prefecture").selectOption("JP-01");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.locator(".station-card").first().click();
  await expect(page.locator("#station-title")).toBeVisible();
  await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  failing = false;
  await page.getByRole("button", { name: en.mapRetry, exact: true }).click();
  await expect(page.locator(".map-error")).toHaveCount(0);
  await expect.poll(() => successes).toBeGreaterThan(0);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
});

test("production CSP injected into local HTML permits Leaflet styles, initialization and approved tiles", async ({ page }) => {
  const csp = readFileSync("public/_headers", "utf8").split("\n").find((line) => line.trim().startsWith("Content-Security-Policy:"))!.trim().slice("Content-Security-Policy:".length).trim();
  await page.route("**/en/", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __cspViolations: violations });
    document.addEventListener("securitypolicyviolation", (event) => violations.push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  await home(page);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  expect(await page.locator(".map-surface").evaluate((element) => getComputedStyle(element).position)).toBe("relative");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator(".map-pin-cluster").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations)).toEqual([]);
});

for (const width of [320, 390, 1280]) {
  test(`map and detail at ${width}px keep attribution and sheet visible without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await home(page);
    await expect(page.locator(".map-attribution")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/map-home-${width}-offline-tiles.png`, fullPage: true });
    await page.locator("#prefecture").selectOption("JP-01");
    await page.getByRole("button", { name: en.mapList, exact: true }).click();
    await page.locator(".station-card").first().click();
    await expect(page.locator(".map-detail-panel")).toBeInViewport();
    await expect.poll(async () => {
      const surface = await page.locator(".map-surface").boundingBox();
      const pin = await page.locator('.map-pin[aria-pressed="true"]').boundingBox();
      return Boolean(surface && pin && pin.x >= surface.x && pin.y >= surface.y && pin.x + pin.width <= surface.x + surface.width && pin.y + pin.height <= surface.y + surface.height);
    }).toBe(true);
    await expect(page.locator(".map-attribution")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/map-detail-${width}-offline-tiles.png`, fullPage: true });
  });
}


test("map configuration failure allows list fallback and explicit initialization retry", async ({ page }) => {
  let failed = true;
  await page.route("**/runtime-map-provider.json", async (route) => {
    if (failed) await route.fulfill({ status: 503, body: "offline configuration" });
    else await route.fulfill({ path: "public/runtime-map-provider.json", contentType: "application/json" });
  });
  await page.goto("/en/");
  await expect(page.getByText(en.mapUnavailable, { exact: true })).toBeVisible();
  await page.locator("#prefecture").selectOption("JP-01");
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  failed = false;
  await page.getByRole("button", { name: en.mapRetry, exact: true }).click();
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
  await expect(page.locator(".map-error")).toHaveCount(0);
  await expect(page.locator(".map-pin-cluster").first()).toBeVisible();
});

for (const action of ["cancel", "overview"] as const) {
  test(`returning to overview via ${action} rejects a late station response`, async ({ page }) => {
    let release!: () => void;
    let started!: () => void;
    let finished!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const received = new Promise<void>((resolve) => { started = resolve; });
    const completed = new Promise<void>((resolve) => { finished = resolve; });
    await page.route(`**${partition.path}`, async (route) => {
      started(); await held;
      try { await route.fulfill({ path: `public${partition.path}`, contentType: "application/json" }); }
      finally { finished(); }
    });
    await home(page);
    await page.locator("#prefecture").selectOption("JP-01");
    await received;
    await page.getByRole("button", { name: action === "cancel" ? en.ffCancel : en.mapOverview, exact: true }).click();
    release(); await completed;
    await expect(page.locator("#prefecture")).toHaveValue("");
    await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
    await expect(page.locator("#station-search, .map-pin-station, .map-pin-cluster")).toHaveCount(0);
    await expect(page.locator(".map-status")).toHaveText(en.mapOverviewCount.replace("{count}", manifest.stations.count.toLocaleString("en")));
  });
}


test("coincident Fukuoka and Saga summary anchors offer both regions instead of endless zoom", async ({ page }) => {
  await home(page);
  for (let step = 0; step < 10 && !await page.locator(".region-list").isVisible(); step++) {
    await page.locator('.map-pin-region-group[data-region-codes*="JP-40"]').click();
    await waitForMapAnimation(page);
  }
  await expect(page.locator(".region-list .station-card")).toHaveCount(2);
  await expect(page.locator(".region-list")).toContainText("福岡 / Fukuoka");
  await expect(page.locator(".region-list")).toContainText("佐賀 / Saga");
  await page.locator(".region-list .station-card").filter({ hasText: "佐賀 / Saga" }).click();
  await expect(page.locator("#prefecture")).toHaveValue("JP-41");
  await expect(page.locator(".station-card")).toHaveCount(25);
});

// A retry must preserve the integer XYZ tile contract at the overview scale.
test("overview tile retry uses integer XYZ coordinates", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  let failing = true;
  const retriedPaths: string[] = [];
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    if (failing) await route.fulfill({ status: 503, body: "offline fixture failure" });
    else {
      const path = new URL(route.request().url()).pathname;
      retriedPaths.push(path);
      await route.fulfill({ contentType: "image/png", body: offlineTile });
    }
  });
  await home(page);
  await expect(page.locator(".map-error")).toBeVisible();
  failing = false;
  await page.getByRole("button", { name: en.mapRetry, exact: true }).click();
  await expect.poll(() => retriedPaths.length).toBeGreaterThan(0);
  expect(retriedPaths.every((path) => {
    const match = /^\/(\d+)\/(\d+)\/(\d+)\.png$/.exec(path);
    if (!match) return false;
    const [z, x, y] = match.slice(1).map(Number);
    return x < 2 ** z && y < 2 ** z;
  })).toBe(true);
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
});
