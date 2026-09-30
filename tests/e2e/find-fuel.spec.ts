import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { Locale } from "../../src/i18n";
const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
const messages = Object.fromEntries(locales.map((locale) => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<Locale, Record<string, string>>;
import type { DataManifest, PriceFile, Station, StationFile } from "../../src/lib/stations";

const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = (code: string) => manifest.stations.partitions.find((entry) => entry.code === code)!;
const stations = (code: string): Station[] => (JSON.parse(readFileSync(`public${partition(code).path}`, "utf8")) as StationFile).stations;
const hokkaido = stations("JP-01");
const recorded = hokkaido.find((station) => station.city && station.address)!;
const prices: PriceFile = JSON.parse(readFileSync(`public${manifest.prices.path}`, "utf8"));
const origin = { latitude: 35.681234567, longitude: 139.767654321 };
const en = messages.en;

declare global {
  interface Window {
    __geo: { success: PositionCallback; error?: PositionErrorCallback | null }[];
    __leaks: string[];
  }
}

test.beforeEach(async ({ page, context }) => {
  // All external navigation is intercepted: no live maps, analytics or services.
  await context.route(/https?:\/\//, async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") await route.continue();
    else await route.fulfill({ status: 200, contentType: "text/plain", body: "Offline external navigation interception" });
  });
  await page.addInitScript(() => {
    window.__geo = [];
    window.__leaks = [];
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (success: PositionCallback, error?: PositionErrorCallback | null) => window.__geo.push({ success, error }),
      watchPosition: () => { throw new Error("Unexpected position watch"); },
    } });
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) { window.__leaks.push(`${key}:${value}`); setItem.call(this, key, value); };
    navigator.sendBeacon = (url, data) => { window.__leaks.push(`${url}:${String(data)}`); return true; };
  });
});

async function open(page: Page, locale: Locale = "en") {
  await page.goto(`/${locale}/`);
  await page.getByRole("button", { name: messages[locale].findTitle, exact: true }).click();
  await expect(page.locator("#find-title")).toBeFocused();
}
async function manual(page: Page, code = "JP-01") {
  await page.locator("#prefecture").selectOption(code);
  await expect(page.locator("#station-search")).toBeVisible();
}
async function locate(page: Page, index = 0, point = origin) {
  await page.evaluate(({ index, point }) => window.__geo[index].success({ coords: { ...point, accuracy: 10 }, timestamp: Date.now() } as GeolocationPosition), { index, point });
}
async function cleanOrigin(page: Page) {
  const surface = await page.evaluate(() => JSON.stringify({
    url: location.href, links: [...document.querySelectorAll("a")].map((a) => a.href),
    local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie, attempts: window.__leaks,
  }));
  for (const coordinate of Object.values(origin)) expect(surface).not.toContain(String(coordinate));
  expect(await page.context().cookies()).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length, window.__leaks.length])).toEqual([0, 0, 0]);
}

test("manual prefecture fetches one region; city/address search and detail never invent distance", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await open(page);
  expect(await page.evaluate(() => window.__geo.length)).toBe(0);
  expect(requests.filter((url) => url.includes("/data/"))).toEqual([]);
  await manual(page);
  expect(requests.filter((url) => url.includes("/data/stations/")).map((url) => new URL(url).pathname)).toEqual([partition("JP-01").path]);
  expect(requests.some((url) => url.includes("/data/prices/"))).toBe(false);
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.ffShowMore }).click();
  await expect(page.locator(".station-card")).toHaveCount(50);
  for (const query of [recorded.city!, recorded.address!]) {
    await page.locator("#station-search").fill(query);
    await expect(page.locator(`[id="station-${recorded.id}"]`)).toBeVisible();
  }
  await expect(page.locator(".distance")).toHaveCount(0);
  await page.locator(`[id="station-${recorded.id}"]`).click();
  await expect(page.locator("#station-title")).toHaveText(recorded.name!);
  await expect(page.locator("#station-title")).toBeFocused();
  await expect(page.locator(".distance")).toHaveCount(0);
  await expect(page.getByRole("link", { name: en.ffOfficialSource })).toHaveAttribute("href", prices.sourceUrl);
  await expect(page.locator(".official-price")).toContainText(en.ffPriceScope);
  await expect(page.locator(".official-price")).toContainText(en.ffPriceUnit);
  await expect(page.locator(`.official-price time[datetime="${prices.surveyDate}"]`)).toBeVisible();
  await expect(page.locator(`.official-price time[datetime="${prices.publishedAt}"]`)).toBeVisible();
  await expect(page.locator(".official-price")).toContainText(en.ffProcessed);
  const expectedPrices = prices.records.filter((row) => row.prefectureCode === "JP-01");
  for (const row of expectedPrices) await expect(page.locator(".official-price")).toContainText(`${row.priceJpy.toFixed(1)} JPY/L`);
  for (const label of ["レギュラー", "ハイオク", "軽油"]) await expect(page.locator(".station-detail [lang='ja']").filter({ hasText: label }).first()).toBeVisible();
  await expect(page.locator(".station-detail")).toContainText(en.ffFuelReminder);
  const stateCopy = { YES: en.ffYes, NO: en.ffNo, UNKNOWN: en.ffUnknown };
  for (const [label, value] of [[en.ffVisa, recorded.paymentVisa], [en.ffMastercard, recorded.paymentMastercard]] as const) {
    await expect(page.locator(".station-facts > div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd")).toHaveText(stateCopy[value]);
  }
  for (const [label, value] of [["レギュラー", recorded.fuelRegular], ["ハイオク", recorded.fuelHighOctane], ["軽油", recorded.fuelDiesel]] as const) {
    await expect(page.locator(".station-detail > .station-facts > div").filter({ hasText: label }).locator("dd")).toHaveText(stateCopy[value]);
  }
  await expect(page.locator(".station-detail")).toContainText(recorded.openingHours || en.ffUnknown);
  await expect(page.locator(".find-attribution")).toContainText("© OpenStreetMap contributors");
  await expect(page.locator(".find-attribution a[href='https://opendatacommons.org/licenses/odbl/1-0/']")).toBeVisible();
  await expect(page.locator("a[href*='gogo.gs']")).toHaveCount(0);
  await page.getByRole("button", { name: en.ffBack }).click();
  await expect(page.locator(`[id="station-${recorded.id}"]`)).toBeFocused();
  await expect(page.locator("#station-search")).toHaveValue(recorded.address!);
  await cleanOrigin(page);
});

test("explicit mocked location sorts real stations; navigation sends destination only and origin stays private", async ({ page, context }) => {
  const requests: string[] = [];
  context.on("request", (request) => requests.push(`${request.url()} ${request.postData() ?? ""}`));
  await open(page);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  expect(await page.evaluate(() => window.__geo.length)).toBe(1);
  await locate(page);
  await expect(page.locator(".station-card")).toHaveCount(25);
  await expect(page.getByText(en.ffStraightLineHelp, { exact: true })).toBeVisible();
  const distances = (await page.locator(".station-card .distance").allTextContents()).map((text) => Number(text.match(/·\s*([\d.]+)/)![1]));
  expect(distances).toEqual([...distances].sort((a, b) => a - b));
  expect(distances.every((distance) => distance <= 50)).toBe(true);
  const stationId = (await page.locator(".station-card").first().getAttribute("id"))!.replace("station-", "");
  const station = manifest.stations.partitions.flatMap((p) => stations(p.code)).find((row) => row.id === stationId)!;
  await page.locator(".station-card").first().click();
  for (const [label, key] of [[en.ffGoogle, "destination"], [en.ffApple, "daddr"]]) {
    const link = page.getByRole("link", { name: label });
    const url = new URL((await link.getAttribute("href"))!);
    expect(url.searchParams.get(key)).toBe(`${station.lat},${station.lon}`);
    expect(url.searchParams.has("origin")).toBe(false);
    expect(url.searchParams.has("saddr")).toBe(false);
    expect([...url.searchParams.keys()].sort()).toEqual(key === "destination" ? ["api", "destination", "travelmode"] : ["daddr", "dirflg"]);
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const popupPromise = page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState();
    await expect(popup.locator("body")).toHaveText("Offline external navigation interception");
    await popup.close();
  }
  for (const coordinate of Object.values(origin)) expect(requests.join("\n")).not.toContain(String(coordinate));
  const fetches = requests.filter((url) => /\/data\//.test(url));
  expect(fetches.length).toBeGreaterThan(2);
  expect(fetches.every((url) => url.startsWith("http://127.0.0.1:") && !url.includes("?"))).toBe(true);
  expect(requests.some((url) => /overpass|analytics|collect\?/.test(url))).toBe(false);
  await cleanOrigin(page);
  await page.getByRole("button", { name: en.ffClose }).click();
  await expect(page.getByRole("button", { name: en.findTitle, exact: true })).toBeFocused();
  await page.reload();
  await cleanOrigin(page);
});

for (const [name, code, message] of [["denied", 1, en.ffDenied], ["unavailable", 2, en.ffUnavailable], ["timeout", 3, en.ffTimeout]] as const) {
  test(`location ${name} permits manual fallback`, async ({ page }) => {
    await open(page);
    await page.getByRole("button", { name: en.ffUseLocation }).click();
    await page.evaluate((code) => window.__geo[0].error?.({ code } as GeolocationPositionError), code);
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await manual(page, "JP-47");
    await expect(page.locator(".station-card")).toHaveCount(25);
    await cleanOrigin(page);
  });
}

test("missing geolocation API and out-of-Japan location do not fetch stations", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => { if (request.resourceType() === "fetch") requests.push(request.url()); });
  await open(page);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await locate(page, 0, { latitude: 48.8566, longitude: 2.3522 });
  await expect(page.getByText(en.ffOutside, { exact: true })).toBeVisible();
  await page.evaluate(() => Object.defineProperty(navigator, "geolocation", { value: undefined }));
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await expect(page.getByText(en.ffUnavailable, { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test("watchdog timeout rejects a late position and allows a fresh request", async ({ page }) => {
  await page.clock.install();
  await open(page);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await page.clock.fastForward(12_001);
  await expect(page.getByText(en.ffTimeout, { exact: true })).toBeVisible();
  await locate(page);
  await expect(page.getByText(en.ffTimeout, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await locate(page, 1);
  await expect(page.locator(".station-card")).toHaveCount(25);
});

test("late location cannot replace manual choice; cancel, retry and close reject stale callbacks", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await manual(page, "JP-47");
  await locate(page, 0);
  await expect(page.locator("#prefecture")).toHaveValue("JP-47");
  await expect(page.locator(".distance")).toHaveCount(0);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await page.getByRole("button", { name: en.ffCancel }).click();
  await locate(page, 1);
  await expect(page.getByText(en.ffStart, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await locate(page, 2, { latitude: 48.8, longitude: 2.3 });
  await expect(page.getByText(en.ffLocating, { exact: true })).toBeVisible();
  await locate(page, 3);
  await expect(page.locator(".station-card")).toHaveCount(25);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await page.getByRole("button", { name: en.ffClose }).click();
  await page.getByRole("button", { name: en.findTitle, exact: true }).click();
  await locate(page, 4);
  await expect(page.getByText(en.ffStart, { exact: true })).toBeVisible();
  await cleanOrigin(page);
});

test("station load failure retries; an older retry response cannot replace a newer prefecture", async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  const received = new Promise<void>((resolve) => { started = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  let attempts = 0;
  await page.route(`**${partition("JP-01").path}`, async (route) => {
    attempts += 1;
    if (attempts === 1) { await route.fulfill({ status: 503, body: "offline" }); return; }
    started(); await held;
    await route.fulfill({ path: `public${partition("JP-01").path}`, contentType: "application/json" });
  });
  await open(page);
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.getByText(en.ffLoadError, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.ffSearchGoogle })).toBeVisible();
  await page.getByRole("button", { name: en.ffRetry }).click();
  await received;
  await manual(page, "JP-47");
  release();
  await expect(page.locator(".station-card").first()).toContainText(stations("JP-47")[0].name!);
  await expect(page.locator("#prefecture")).toHaveValue("JP-47");
  await expect(page.locator(".search-status")).toContainText(String(stations("JP-47").length));
});

test("empty search gives external map fallback without invented stations or coordinates", async ({ page }) => {
  await open(page); await manual(page);
  const query = "NoSuchStation_zz_9213";
  await page.locator("#station-search").fill(query);
  await expect(page.locator(".station-card")).toHaveCount(0);
  await expect(page.getByText(en.ffNoResults, { exact: true })).toBeVisible();
  for (const name of [en.ffSearchGoogle, en.ffSearchApple]) {
    const url = new URL((await page.getByRole("link", { name }).getAttribute("href"))!);
    expect(url.searchParams.get("query") ?? url.searchParams.get("q")).toContain(`北海道 / Hokkaido ${query}`);
  }
  await cleanOrigin(page);
});

test("price failure does not block navigation; retry shows dated stale reference", async ({ page }) => {
  await page.clock.setFixedTime(new Date(Math.max(Date.now(), Date.parse(prices.surveyDate)) + 32 * 86_400_000));
  let attempts = 0;
  await page.route(`**${manifest.prices.path}`, async (route) => {
    if (++attempts === 1) await route.fulfill({ status: 503, body: "offline" });
    else await route.fulfill({ path: `public${manifest.prices.path}`, contentType: "application/json" });
  });
  await open(page); await manual(page);
  await page.locator(".station-card").first().click();
  await expect(page.getByText(en.ffPriceError, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.ffGoogle })).toBeVisible();
  await page.getByRole("button", { name: en.ffRetry }).click();
  await expect(page.getByText(en.ffStalePrice, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: en.ffOfficialSource })).toHaveAttribute("href", prices.sourceUrl);
});

for (const locale of locales) {
  test(`${locale} list/detail fit 320 and 390 pixels, retain Japanese labels and capture screenshots`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(page, locale); await manual(page);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator(".station-card").first().click();
      await expect(page.getByRole("link", { name: messages[locale].ffOfficialSource })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      for (const label of ["レギュラー", "ハイオク", "軽油"]) await expect(page.locator(".station-detail [lang='ja']").filter({ hasText: label }).first()).toBeVisible();
      await page.locator("#find-fuel").screenshot({ scale: "css", path: `test-results/find-fuel-${locale}-${width}.png` });
      await page.getByRole("button", { name: messages[locale].ffBack }).click();
    }
    if (locale === "en") {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.locator("#station-search").fill(recorded.address!);
      await page.screenshot({ path: "test-results/find-fuel-desktop.png", fullPage: true, scale: "css" });
    }
    expect(errors).toEqual([]);
  });
}


test("empty nearby coverage uses map fallback without claiming that no stations exist", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: en.ffUseLocation }).click();
  await locate(page, 0, { latitude: 30.1234567, longitude: 140.4567891 });
  await expect(page.locator("#station-search")).toBeVisible();
  await expect(page.locator(".station-card")).toHaveCount(0);
  await expect(page.getByText(en.ffNoResults, { exact: true })).toBeVisible();
  const link = page.getByRole("link", { name: en.ffSearchGoogle });
  expect(new URL((await link.getAttribute("href"))!).searchParams.get("query")).toBe("gas station near me");
});

test("station request retry succeeds with the original real partition", async ({ page }) => {
  let attempts = 0;
  await page.route(`**${partition("JP-01").path}`, async (route) => {
    if (++attempts === 1) await route.abort("failed");
    else await route.fulfill({ path: `public${partition("JP-01").path}`, contentType: "application/json" });
  });
  await open(page);
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.getByText(en.ffLoadError, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.ffRetry }).click();
  await expect(page.locator(".station-card")).toHaveCount(25);
  expect(attempts).toBe(2);
  await expect(page.locator(".station-card").first()).toContainText(hokkaido[0].name!);
});

test("back from detail discards its pending price response before another prefecture opens", async ({ page }) => {
  let release!: () => void;
  let started!: () => void;
  let finished!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  const received = new Promise<void>((resolve) => { started = resolve; });
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  let attempts = 0;
  await page.route(`**${manifest.prices.path}`, async (route) => {
    if (++attempts === 1) {
      started(); await held;
      try { await route.fulfill({ path: `public${manifest.prices.path}`, contentType: "application/json" }); }
      finally { finished(); }
    } else await route.fulfill({ path: `public${manifest.prices.path}`, contentType: "application/json" });
  });
  await open(page); await manual(page);
  await page.locator(".station-card").first().click();
  await received;
  await expect(page.getByText(en.ffPriceLoading, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: en.ffBack }).click();
  await manual(page, "JP-47");
  await page.locator(".station-card").first().click();
  await expect(page.getByRole("link", { name: en.ffOfficialSource })).toBeVisible();
  release(); await completed;
  await expect(page.locator("#station-title")).toHaveText(stations("JP-47")[0].name!);
  for (const row of prices.records.filter((row) => row.prefectureCode === "JP-47")) {
    await expect(page.locator(".official-price")).toContainText(`${row.priceJpy.toFixed(1)} JPY/L`);
  }
});
