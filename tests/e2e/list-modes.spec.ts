import { chooseFuels } from "./fuel-selection";
import { test, expect } from "./offline";

test("list modes are reachable from the national overview without loading station partitions", async ({ page }) => {
  const partitions: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/stations/")) partitions.push(request.url()); });
  await page.goto("/en/");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cheapest", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Nearest", exact: true }).click();
  await expect(page.locator(".region-list .station-card")).toHaveCount(47);
  await page.getByRole("button", { name: "Favorites", exact: true }).click();
  await expect(page.locator(".region-list")).toHaveCount(0);
  await expect(page.getByText("No saved stations yet. Use a station’s star to save it.", { exact: true })).toBeVisible();
  expect(partitions).toEqual([]);
});

import { readFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import { FAVORITES_KEY, FAVORITES_LIMIT, type Favorite } from "../../src/lib/favorites";
import { nearbyStations, selectNearbyPartitions, type DataManifest, type StationFile } from "../../src/lib/stations";
const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
const messages = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<string, Record<string, string>>;
const en = messages.en;
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = (code: string) => manifest.stations.partitions.find((p) => p.code === code)!;
const file = (code: string): StationFile => JSON.parse(readFileSync(`public${partition(code).path}`, "utf8"));
const hokkaido = file("JP-01").stations;
const okinawa = file("JP-47").stations;
const saved = (station: typeof hokkaido[number]): Favorite => ({ id: station.id, partition: station.prefectureCode });
const row = (page: Page, id: string) => page.locator(`[id="list-${id}"]`).locator("..");
const mode = (page: Page, value: string) => page.locator(`#list-mode-${value}`);
async function seed(page: Page, entries: Favorite[], raw?: string) {
  await page.addInitScript(({ key, value }) => {
    if (!sessionStorage.getItem("fixture-favorites-seeded")) {
      localStorage.setItem(key, value);
      sessionStorage.setItem("fixture-favorites-seeded", "yes");
    }
  }, { key: FAVORITES_KEY, value: raw ?? JSON.stringify({ version: 1, entries }) });
}
async function openList(page: Page, code = "JP-01") {
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption(code);
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-list .station-card")).toHaveCount(25);
}
async function favorites(page: Page) {
  if (!await mode(page, "favorites").isVisible()) await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await mode(page, "favorites").click();
  await expect(mode(page, "favorites")).toHaveAttribute("aria-pressed", "true");
}
function dataRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/")) requests.push(new URL(request.url()).pathname); });
  return requests;
}
async function favoriteFixture(page: Page) {
  const fixture = file("JP-01");
  fixture.stations.forEach((station, index) => {
    station.name = `List fixture ${String(index).padStart(4, "0")}`;
    station.originalBrand = index < 30 ? "Saved fixture brand" : "Other fixture brand";
    station.normalizedBrand = station.originalBrand;
    station.serviceType = index % 2 === 0 ? "SELF" : "FULL";
    station.paymentVisa = index < 2 ? "YES" : "UNKNOWN";
  });
  const body = JSON.stringify(fixture);
  const index = structuredClone(manifest);
  Object.assign(index.stations.partitions.find((p) => p.code === "JP-01")!, { bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex") });
  await page.route("**/data/manifest.json", (route) => route.fulfill({ json: index }));
  await page.route(`**${partition("JP-01").path}`, (route) => route.fulfill({ body, contentType: "application/json" }));
  return fixture.stations;
}

test("cheapest has one honest explanation and mode/fuel/query/filter changes reset pagination without new data", async ({ page }) => {
  await favoriteFixture(page); await openList(page);
  await expect(page.getByText(en.lmNoPrices, { exact: true })).toHaveCount(1);
  await expect(page.locator(".station-card .station-price")).toHaveCount(0);
  const requests = dataRequests(page);
  for (const action of ["nearest", "fuel", "query", "filter"]) {
    await page.getByRole("button", { name: en.ffShowMore, exact: true }).click();
    await expect(page.locator(".station-card")).toHaveCount(50);
    if (action === "nearest") await mode(page, "nearest").click();
    if (action === "fuel") await chooseFuels(page, ["DIESEL"]);
    if (action === "query") await page.locator("#station-search").fill("List fixture");
    if (action === "filter") {
      await page.locator(".station-filter-trigger:visible").click();
      await page.getByRole("dialog").locator(".filter-option").filter({ hasText: "Saved fixture brand" }).click();
      await page.getByRole("button", { name: en.sfApply.replace("{count}", "30"), exact: true }).click();
    }
    await expect(page.locator(".station-card")).toHaveCount(25);
  }
  expect(requests).toEqual([]);
  await mode(page, "cheapest").click();
  await expect(page.locator(".map-status > p")).toHaveText(en.mapResultCount.replace("{count}", "30"));
});

test("nearest never requests location on selection, then uses numeric Haversine order after the locate icon", async ({ page }) => {
  const position = { lat: 35.681234567, lon: 139.767654321 };
  await page.addInitScript(() => {
    Object.assign(window, { __listGeo: [] });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: (success: PositionCallback) => (window as unknown as { __listGeo: PositionCallback[] }).__listGeo.push(success) } });
  });
  const requests = dataRequests(page);
  await openList(page);
  await mode(page, "nearest").click();
  await expect(page.getByText(en.lmNearestHint, { exact: true })).toBeVisible();
  await expect(page.locator(".station-card .distance")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __listGeo: unknown[] }).__listGeo.length)).toBe(0);
  await page.locator(".location-button:visible").click();
  await page.evaluate((point) => (window as unknown as { __listGeo: PositionCallback[] }).__listGeo[0]({ coords: { latitude: point.lat, longitude: point.lon }, timestamp: Date.now() } as GeolocationPosition), position);
  await expect(page.locator(".station-card")).toHaveCount(25);
  const loaded = selectNearbyPartitions(manifest, position).flatMap((p) => file(p.code).stations);
  const expected = nearbyStations(loaded, position).slice(0, 25).map((station) => `list-${station.id}`);
  expect(await page.locator(".station-card").evaluateAll((cards) => cards.map((card) => card.id))).toEqual(expected);
  await expect(page.getByText(en.ffStraightLineHelp, { exact: true })).toBeVisible();
  await chooseFuels(page, ["HIGH_OCTANE"]);
  await mode(page, "cheapest").click(); await mode(page, "nearest").click();
  expect(await page.evaluate(() => (window as unknown as { __listGeo: unknown[] }).__listGeo.length)).toBe(1);
  const storage = await page.evaluate(() => JSON.stringify({ ...localStorage }));
  for (const coordinate of Object.values(position)) {
    expect(storage).not.toContain(String(coordinate));
    expect(requests.join("\n")).not.toContain(String(coordinate));
  }
});

test("normal list sorting preserves the map marker DOM and viewport", async ({ page }) => {
  await page.goto("/en/"); await page.locator("#prefecture").selectOption("JP-01");
  const station = hokkaido.find((s) => s.address && hokkaido.filter((other) => other.address?.includes(s.address!)).length === 1)!;
  await page.locator("#station-search").fill(station.address!);
  const pin = page.locator(`[data-map-key="${station.id}"]`);
  await expect(pin).toBeVisible();
  await pin.evaluate((button) => { button.setAttribute("data-list-mode-probe", "same"); });
  const before = await pin.boundingBox();
  await expect(page.locator(".list-modes")).toBeHidden();
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await mode(page, "nearest").click(); await mode(page, "cheapest").click();
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  await expect(pin).toHaveAttribute("data-list-mode-probe", "same");
  await expect.poll(() => pin.boundingBox()).toEqual(before);
});

test("list and detail stars persist across prefectures and reload with only saved partition requests", async ({ page }) => {
  await openList(page);
  const first = hokkaido[0], second = okinawa[0];
  await row(page, first.id).locator(".favorite-button").click();
  await expect(row(page, first.id).locator(".favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.locator(`[id="list-${first.id}"]`).click();
  await expect(page.locator(".station-detail .favorite-button")).toHaveAttribute("aria-pressed", "true");
  await page.locator(".station-detail .favorite-button").click();
  await expect(page.locator(".station-detail .favorite-button")).toHaveAttribute("aria-pressed", "false");
  await page.locator(".station-detail .favorite-button").click();
  await page.getByRole("button", { name: en.mapCloseDetail, exact: true }).click();
  await expect(page.locator(`[id="list-${first.id}"]`)).toBeFocused();
  await page.locator("#prefecture").selectOption("JP-47");
  await row(page, second.id).locator(".favorite-button").click();
  const requests = dataRequests(page);
  await page.reload();
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
  expect(requests.filter((path) => path.includes("/stations/"))).toEqual([]);
  await favorites(page);
  await expect(page.locator(".station-card")).toHaveCount(2);
  expect(requests.filter((path) => path.includes("/stations/")).sort()).toEqual([partition("JP-01").path, partition("JP-47").path].sort());
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), FAVORITES_KEY)).toEqual({ version: 1, entries: [saved(first), saved(second)] });
  await expect(page.locator(".map-range")).toContainText(en.lmSavedScope);
  await expect(page.locator(".distance")).toHaveCount(0);
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  await expect(page.locator(".map-pin-station")).toHaveCount(2);
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await page.locator(`[id="list-${first.id}"]`).click();
  await page.locator(".station-detail .favorite-button").click();
  await expect(page.locator(".station-detail")).toHaveCount(0);
  await expect(mode(page, "favorites")).toBeFocused();
  await expect(page.locator(".station-card")).toHaveCount(1);
  await row(page, second.id).locator(".favorite-button").click();
  await expect(page.getByText(en.lmEmpty, { exact: true })).toBeVisible();
  await expect(mode(page, "favorites")).toBeFocused();
});

test("favorites use saved dataset filter counts, reset pagination on fuel and restore the normal query", async ({ page }) => {
  const stations = await favoriteFixture(page);
  await seed(page, stations.slice(0, 30).map(saved));
  await openList(page);
  await page.locator("#station-search").fill("List fixture 0030");
  await expect(page.locator(".station-card")).toHaveCount(1);
  await favorites(page);
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.ffShowMore, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(30);
  await chooseFuels(page, ["DIESEL"]);
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.locator(".station-filter-trigger:visible").click();
  const option = page.getByRole("dialog").locator(".filter-option").filter({ hasText: "Saved fixture brand" });
  await expect(option.locator(".filter-option-count")).toHaveText("30");
  await expect(page.getByRole("dialog").locator(".filter-option").filter({ hasText: "Other fixture brand" })).toHaveCount(0);
  await page.getByRole("tab", { name: en.sfPayments, exact: true }).click();
  await page.getByRole("dialog").locator(".filter-option").filter({ hasText: "Visa" }).click();
  await page.getByRole("button", { name: en.sfApply.replace("{count}", "2"), exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(2);
  await expect(page.getByText(en.lmHiddenFavorites.replace("{count}", "28"), { exact: true })).toBeVisible();
  await page.locator("#station-search").fill("not_found_7738");
  await expect(page.getByText(en.lmNoMatch, { exact: true })).toBeVisible();
  await mode(page, "cheapest").click();
  await expect(page.locator("#station-search")).toHaveValue("List fixture 0030");
  await expect(page.locator(".station-card")).toHaveCount(1);
  await expect(page.locator(".station-filter-trigger:visible")).toHaveAccessibleName(en.sfTitle);
});

for (const blocked of ["read", "write"]) {
  test(`blocked ${blocked} storage keeps memory favorites usable and shows an honest notice`, async ({ page }) => {
    await page.addInitScript(({ blocked, key }) => {
      if (blocked === "read") Object.defineProperty(window, "localStorage", { get: () => { throw new Error("blocked fixture"); } });
      else {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (name, value) { if (name === key) throw new Error("quota fixture"); original.call(this, name, value); };
      }
    }, { blocked, key: FAVORITES_KEY });
    await openList(page);
    await row(page, hokkaido[0].id).locator(".favorite-button").click();
    await expect(page.getByText(en.lmStorageError, { exact: true })).toBeVisible();
    await favorites(page);
    await expect(page.locator(".station-card")).toHaveCount(1);
    await page.locator(".favorite-button[aria-pressed='true']").click();
    await expect(page.getByText(en.lmEmpty, { exact: true })).toBeVisible();
    await expect(page.getByText(en.lmStorageError, { exact: true })).toBeVisible();
  });
}

test("corrupt storage does not load arbitrary paths and is replaced only by an explicit save", async ({ page }) => {
  const raw = JSON.stringify({ version: 1, entries: [{ id: hokkaido[0].id, partition: "https://invalid.example/stations", path: "/untrusted" }] });
  await seed(page, [], raw);
  const requests = dataRequests(page);
  await page.goto("/en/"); await favorites(page);
  await expect(page.getByText(en.lmStorageCorrupt, { exact: true })).toBeVisible();
  await expect(page.getByText(en.lmEmpty, { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => localStorage.getItem(key), FAVORITES_KEY)).toBe(raw);
  expect(requests.filter((path) => path.includes("/stations/"))).toEqual([]);
  await page.locator("#prefecture").selectOption("JP-01");
  await row(page, hokkaido[0].id).locator(".favorite-button").click();
  await expect(page.getByText(en.lmStorageCorrupt, { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), FAVORITES_KEY)).toEqual({ version: 1, entries: [saved(hokkaido[0])] });
});

test("favorite cap allows removal and then another save", async ({ page }) => {
  await seed(page, hokkaido.slice(0, FAVORITES_LIMIT).map(saved));
  await openList(page);
  const station = hokkaido.slice(FAVORITES_LIMIT).find((s) => s.address && hokkaido.filter((other) => other.address?.includes(s.address!)).length === 1)!;
  await page.locator("#station-search").fill(station.address!);
  await row(page, station.id).locator(".favorite-button").click();
  await expect(page.getByText(en.lmLimit.replace("{count}", "200"), { exact: true })).toBeVisible();
  await expect(row(page, station.id).locator(".favorite-button")).toHaveAttribute("aria-pressed", "false");
  await page.locator("#station-search").fill("");
  await row(page, hokkaido[0].id).locator(".favorite-button").click();
  await page.locator("#station-search").fill(station.address!);
  await row(page, station.id).locator(".favorite-button").click();
  await expect(row(page, station.id).locator(".favorite-button")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText(en.lmLimit.replace("{count}", "200"), { exact: true })).toHaveCount(0);
});

test("missing source record remains removable and UNKNOWN uses only its explicit partition", async ({ page }) => {
  const unknown: Favorite = { id: "osm:way:9007199254740990", partition: "UNKNOWN" };
  const missing: Favorite = { id: "osm:node:9007199254740991", partition: "JP-01" };
  await seed(page, [missing, unknown, saved(hokkaido[0])]);
  const requests = dataRequests(page);
  await page.goto("/en/"); await favorites(page);
  await expect(page.getByText(en.lmMissing, { exact: true })).toBeVisible();
  await expect(page.locator(".station-card")).toHaveCount(1);
  expect(requests.filter((path) => path.includes("/stations/")).sort()).toEqual([partition("JP-01").path, partition("UNKNOWN").path].sort());
  await page.getByRole("button", { name: en.lmRemoveFavorite.replace("{name}", missing.id), exact: true }).click();
  await page.getByRole("button", { name: en.lmRemoveFavorite.replace("{name}", unknown.id), exact: true }).click();
  await expect(page.getByText(en.lmMissing, { exact: true })).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).entries, FAVORITES_KEY)).toEqual([saved(hokkaido[0])]);
});

for (const action of ["mode", "region", "overview", "cancel", "unstar", "navigation"] as const) {
  test(`late favorites response is isolated after ${action}`, async ({ page }) => {
    await seed(page, [saved(hokkaido[0])]);
    let release!: () => void, started!: () => void, finished!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const received = new Promise<void>((resolve) => { started = resolve; });
    const completed = new Promise<void>((resolve) => { finished = resolve; });
    await page.route(`**${partition("JP-01").path}`, async (route) => {
      started(); await held;
      try { await route.fulfill({ path: `public${partition("JP-01").path}`, contentType: "application/json" }); } catch { /* Canceled by the tested action. */ } finally { finished(); }
    });
    await page.goto("/en/");
    await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
    await favorites(page); await received;
    if (action === "mode") await mode(page, "cheapest").click();
    if (action === "region") await page.locator("#prefecture").selectOption("JP-47");
    if (action === "overview") await page.getByRole("button", { name: en.mapOverview, exact: true }).click();
    if (action === "cancel") await page.getByRole("button", { name: en.ffCancel, exact: true }).click();
    if (action === "unstar") {
      await page.locator(".favorite-recovery summary").click();
      await page.getByRole("button", { name: en.lmRemoveFavorite.replace("{name}", hokkaido[0].id), exact: true }).click();
    }
    if (action === "navigation") await page.goto("/zh-Hans/");
    release(); await completed;
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    await expect(page.locator(`[id="list-${hokkaido[0].id}"]`)).toHaveCount(0);
    if (action === "region") { await expect(page.locator("#prefecture")).toHaveValue("JP-47"); await expect(page.locator(".station-card")).toHaveCount(25); }
    else if (action === "unstar") { await expect(page.getByText(en.lmEmpty, { exact: true })).toBeVisible(); await expect(mode(page, "favorites")).toBeFocused(); }
    else await expect(mode(page, "cheapest")).toHaveAttribute("aria-pressed", "true");
    if (action !== "unstar") expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).entries.length, FAVORITES_KEY)).toBe(1);
  });
}

test("failed favorite validation keeps IDs and retries the same saved partition", async ({ page }) => {
  await seed(page, [saved(hokkaido[0])]);
  let failure = true;
  await page.route(`**${partition("JP-01").path}`, (route) => failure ? route.fulfill({ body: "{}", contentType: "application/json" }) : route.fulfill({ path: `public${partition("JP-01").path}`, contentType: "application/json" }));
  await page.goto("/en/"); await favorites(page);
  await expect(page.getByText(en.lmLoadError, { exact: true })).toBeVisible();
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).entries, FAVORITES_KEY)).toEqual([saved(hokkaido[0])]);
  failure = false;
  await page.locator(".map-status").getByRole("button", { name: en.ffRetry, exact: true }).click();
  await expect(page.locator(".station-card")).toHaveCount(1);
  await expect(page.getByText(en.lmLoadError, { exact: true })).toHaveCount(0);
});

for (const locale of locales) {
  test(`localized modes and star labels remain keyboard accessible in ${locale}`, async ({ page }) => {
    const t = messages[locale];
    await page.goto(`/${locale}/`);
    await page.getByRole("button", { name: t.mapList, exact: true }).click();
    await expect(mode(page, "cheapest")).toHaveAccessibleName(t.lmCheapest);
    await expect(mode(page, "nearest")).toHaveAccessibleName(t.lmNearest);
    await expect(mode(page, "favorites")).toHaveAccessibleName(t.lmFavorites);
    await page.locator("#prefecture").selectOption("JP-01");
    await mode(page, "nearest").focus(); await page.keyboard.press("Enter");
    await expect(mode(page, "nearest")).toHaveAttribute("aria-pressed", "true");
    const star = row(page, hokkaido[0].id).locator(".favorite-button");
    const name = hokkaido[0].name || t.ffUnnamed;
    await expect(star).toHaveAccessibleName(t.lmAddFavorite.replace("{name}", name));
    await star.focus(); await page.keyboard.press("Space");
    await expect(star).toHaveAttribute("aria-pressed", "true");
    await expect(star).toHaveAccessibleName(t.lmRemoveFavorite.replace("{name}", name));
    await page.locator(`[id="list-${hokkaido[0].id}"]`).focus(); await page.keyboard.press("Enter");
    await expect(page.locator("#station-title")).toBeFocused();
    await expect(page.locator(".station-detail .favorite-button")).toHaveAccessibleName(t.lmRemoveFavorite.replace("{name}", name));
    await page.keyboard.press("Escape");
    await expect(page.locator(`[id="list-${hokkaido[0].id}"]`)).toBeFocused();
    expect(await page.locator("button button").count()).toBe(0);
  });
}

for (const width of [320, 390, 1280]) {
  test(`list modes fit ${width}px with 44px controls and visible saved results`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1280 ? 900 : 844 });
    await openList(page);
    for (const control of [...await page.locator(".list-modes button").all(), row(page, hokkaido[0].id).locator(".favorite-button")]) {
      const box = await control.boundingBox(); expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await row(page, hokkaido[0].id).locator(".favorite-button").click();
    await favorites(page);
    await expect(page.locator(".station-card")).toHaveCount(1);
    await expect(page.locator(".station-card")).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    mkdirSync("reports/evidence/m01/list-modes", { recursive: true });
    await page.screenshot({ path: `reports/evidence/m01/list-modes/favorites-${width}-offline.png`, fullPage: true });
  });
}

test("region loading resumes after visiting favorites without accepting the aborted response", async ({ page }) => {
  let release: () => void = () => undefined;
  let firstSeen: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => { firstSeen = resolve; });
  const hold = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route(`**${partition("JP-01").path}`, async (route) => {
    requests++;
    if (requests === 1) { firstSeen(); await hold; }
    await route.fulfill({ path: `public${partition("JP-01").path}`, contentType: "application/json" }).catch(() => undefined);
  });
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  await waiting;
  await favorites(page);
  await expect(page.getByText(en.lmEmpty, { exact: true })).toBeVisible();
  await mode(page, "cheapest").click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect.poll(() => requests).toBe(2);
  release();
  await expect(mode(page, "cheapest")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".map-status > p")).toHaveText(en.mapResultCount.replace("{count}", hokkaido.length.toLocaleString("en")));
});

test("late location callback cannot replace favorites or resumed manual results", async ({ page }) => {
  await seed(page, [saved(hokkaido[0])]);
  await page.addInitScript(() => {
    Object.assign(window, { __heldListLocation: [] });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (callback: PositionCallback) => (window as unknown as { __heldListLocation: PositionCallback[] }).__heldListLocation.push(callback),
    } });
  });
  await openList(page);
  const requests = dataRequests(page);
  await page.locator(".location-button:visible").click();
  await favorites(page);
  await expect(page.locator(".station-card")).toHaveCount(1);
  const before = [...requests];
  await page.evaluate(() => (window as unknown as { __heldListLocation: PositionCallback[] }).__heldListLocation[0]({ coords: { latitude: 35.681234567, longitude: 139.767654321 }, timestamp: Date.now() } as GeolocationPosition));
  await expect(mode(page, "favorites")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".station-card")).toHaveCount(1);
  expect(requests).toEqual(before);
  await mode(page, "nearest").click();
  await expect(page.locator(".map-status > p")).toHaveText(en.ffUnavailable);
  await page.locator("#prefecture").selectOption("JP-47");
  await expect(page.locator(".station-card")).toHaveCount(25);
  await expect(page.locator(".station-card .distance")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __heldListLocation: unknown[] }).__heldListLocation.length)).toBe(1);
});
