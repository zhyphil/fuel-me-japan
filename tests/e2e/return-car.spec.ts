import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";
import type { Locale, MessageKey } from "../../src/i18n";
import type { DataManifest, Station } from "../../src/lib/stations";

const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;
const messages = Object.fromEntries(locales.map(locale => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<Locale, Record<MessageKey, string>>;
const rental = JSON.parse(readFileSync("public/data/rental/locations.json", "utf8"));
const naha = "times-naha-airport", chitose = "times-new-chitose-airport";
function row(id: number, lat: number, fields: Partial<Station> = {}): Station {
  return { id: `osm:node:${id}`, osmType: "node", osmId: id, lat, lon: 127.6582094, name: `Fixture station ${id}`, address: `Fixture address ${id}`, prefectureCode: "JP-47", source: "osm", positionMethod: "OSM_NODE", sourceUpdatedAt: "2026-09-29T00:00:00Z", serviceType: "UNKNOWN", paymentVisa: "UNKNOWN", paymentMastercard: "UNKNOWN", fuelRegular: "UNKNOWN", fuelHighOctane: "UNKNOWN", fuelDiesel: "UNKNOWN", ...fields };
}
const nahaRows = [row(1, 26.2110555, { name: "Diesel only", fuelRegular: "NO", fuelDiesel: "YES" }), row(2, 26.2120555, { name: "Unknown supply" }), row(3, 26.2130555, { name: "Regular recorded", fuelRegular: "YES", fuelDiesel: "NO", serviceType: "SELF", openingHours: "Mo-Fr 08:00-18:00" }), row(4, 26.2140555, { name: "Complex hours", openingHours: "sunrise-sunset" }), row(9, 26.5, { name: "Outside radius" })];
const chitoseRows = [row(5, 42.8175023, { name: "Chitose fixture", lon: 141.678983, prefectureCode: "JP-01" })];
async function fixtures(page: Page, empty = false) {
  await page.clock.setFixedTime(new Date("2026-10-01T00:00:00Z"));
  await page.addInitScript(() => { Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { throw new Error("Return flow requested location"); } }); });
  const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
  for (const entry of manifest.stations.partitions) {
    const rows = empty ? [] : entry.code === "JP-47" ? nahaRows : entry.code === "JP-01" ? chitoseRows : [];
    const body = JSON.stringify({ schemaVersion: 1, version: manifest.stations.version, prefectureCode: entry.code, stations: rows });
    entry.count = rows.length; entry.bytes = Buffer.byteLength(body); entry.sha256 = createHash("sha256").update(body).digest("hex");
    entry.bbox = rows.length ? [Math.min(...rows.map(s => s.lon)) - 0.01, Math.min(...rows.map(s => s.lat)) - 0.01, Math.max(...rows.map(s => s.lon)) + 0.01, Math.max(...rows.map(s => s.lat)) + 0.01] : null;
    entry.cells = entry.bbox ? [entry.bbox] : [];
    await page.route(`**${entry.path}`, route => route.fulfill({ contentType: "application/json", body }));
  }
  // The core manifest requires nonempty coverage, so an empty search still has an unrelated partition.
  if (empty) {
    const entry = manifest.stations.partitions.find(p => p.code === "JP-13")!;
    const body = JSON.stringify({ schemaVersion: 1, version: manifest.stations.version, prefectureCode: entry.code, stations: [row(10, 35.68, { lon: 139.76, prefectureCode: "JP-13" })] });
    Object.assign(entry, { count: 1, bytes: Buffer.byteLength(body), sha256: createHash("sha256").update(body).digest("hex"), bbox: [139.75, 35.67, 139.77, 35.69], cells: [[139.75, 35.67, 139.77, 35.69]] });
    await page.route(`**${entry.path}`, route => route.fulfill({ contentType: "application/json", body }));
  }
  manifest.stations.count = manifest.stations.partitions.reduce((sum, p) => sum + p.count, 0);
  await page.route("**/data/manifest.json", route => route.fulfill({ json: manifest }));
  return manifest;
}
async function open(page: Page, locale: Locale = "en") {
  await page.goto(`/${locale}/`);
  await page.getByRole("button", { name: messages[locale].rcTitle, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: messages[locale].rcTitle, exact: true });
  await expect(dialog.locator("#return-location")).toBeVisible();
  return dialog;
}

test("filters selected fuel independently, retains unknowns, and requires explicit completion before return navigation", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixtures(page); const dialog = await open(page);
  await dialog.locator("#return-location").selectOption(naha);
  await expect(dialog.locator(".return-candidates h4")).toHaveText(["Unknown supply", "Regular recorded", "Complex hours"]);
  await expect(dialog.getByText("Straight-line distance: 0.1 km", { exact: true })).toBeVisible();
  await expect(dialog.getByText(messages.en.rcUnknownSupply, { exact: false }).first()).toBeVisible();
  await expect(dialog.getByText(messages.en.ffServiceUnknown, { exact: true }).first()).toBeVisible();
  await expect(dialog.locator(".hours-raw").last()).toHaveText("sunrise-sunset");
  await expect(dialog.getByText(messages.en.ffHoursUntranslated, { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Choose this station: Unknown supply", exact: true }).click();
  await expect(dialog.getByText(messages.en.rcStep1, { exact: true })).toBeVisible();
  const google = dialog.getByRole("link", { name: messages.en.ffGoogle });
  const apple = dialog.getByRole("link", { name: messages.en.ffApple });
  const url = new URL(await google.getAttribute("href") ?? "");
  expect([...url.searchParams]).toEqual([["api", "1"], ["destination", "26.2120555,127.6582094"], ["travelmode", "driving"]]);
  expect(new URL(await apple.getAttribute("href") ?? "").searchParams.get("daddr")).toBe("26.2120555,127.6582094");
  await expect(dialog.locator(".return-fuel-reminder")).toContainText("レギュラー");
  const popupPromise = context.waitForEvent("page"); await google.click(); const popup = await popupPromise; await popup.close();
  await expect(dialog.getByText(messages.en.rcStep2, { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await expect(dialog.getByText(messages.en.rcStep2, { exact: true })).toBeFocused();
  expect(new URL(await google.getAttribute("href") ?? "").searchParams.get("destination")).toBe("26.2110555,127.6582094");
  await dialog.locator("#return-location").selectOption(chitose);
  await expect(dialog.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
  await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  await expect(dialog.locator(".return-search")).not.toContainText("Fixture address 2");
  await dialog.locator("#return-location").selectOption(naha);
  await dialog.locator("#return-fuel").selectOption("DIESEL");
  await expect(dialog.locator(".return-candidates h4")).toHaveText(["Diesel only", "Unknown supply", "Complex hours"]);
  await dialog.getByRole("button", { name: "Choose this station: Diesel only", exact: true }).click();
  await dialog.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await dialog.getByRole("button", { name: messages.en.rcReselect, exact: true }).click();
  await expect(dialog.locator(".return-candidates h4")).toHaveCount(3);
  await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Choose this station: Unknown supply", exact: true }).click();
  await dialog.locator("#return-fuel").selectOption("REGULAR");
  await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  await expect(dialog.locator(".return-candidates h4")).toHaveText(["Unknown supply", "Regular recorded", "Complex hours"]);
});

for (const locale of locales) test(`${locale}: 320px dialog, Japanese labels, source policy, focus and mounted map`, async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width: 320, height: 844 });
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const requests: string[] = []; page.on("request", request => { if (/timescar-rental\.com|\/data\/vehicles\//.test(request.url())) requests.push(request.url()); });
  const t = messages[locale]; const dialog = await open(page, locale);
  const map = await page.locator(".leaflet-container").elementHandle();
  await expect(page.getByRole("navigation", { includeHidden: true })).toHaveCount(1);
  await dialog.locator("#return-location").selectOption(naha);
  await expect(dialog.locator(".return-candidates h4")).toHaveCount(3);
  await expect(dialog.locator("dt[lang=ja]")).toHaveText(["満タン", "領収書 / レシート"]);
  await expect(dialog.locator(".return-car-address")).toContainText("沖縄県那覇市鏡水457-1");
  await expect(dialog.getByRole("link", { name: t.rcOfficial })).toHaveAttribute("href", "https://www.timescar-rental.com/en/");
  await expect(dialog.locator('a[href*="timescar-rental.com"]')).toHaveCount(1);
  await expect(dialog.getByRole("link", { name: t.rcDownload })).toHaveAttribute("href", "/data/rental/locations.json");
  await expect(dialog.getByText(t.rcRules, { exact: true })).toBeVisible();
  await expect(dialog.locator("#return-fuel")).toHaveValue("REGULAR");
  for (const value of ["レギュラー", "ハイオク", "軽油"]) await expect(dialog.locator("#return-fuel")).toContainText(value);
  expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of [dialog.locator("#return-location"), dialog.locator("#return-fuel"), dialog.getByRole("button", { name: t.rcClose }), dialog.getByRole("button", { name: t.rcBack })]) {
    const box = await control.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44); expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  await dialog.getByRole("button", { name: t.rcBack }).focus(); await page.keyboard.press("Tab");
  expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0); await expect(page.getByRole("button", { name: t.rcTitle, exact: true })).toBeFocused();
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
  await page.getByRole("button", { name: t.rcTitle, exact: true }).click();
  await expect(dialog.locator("#return-location")).toHaveValue(""); await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  await dialog.getByRole("button", { name: t.rcClose }).click();
  expect(errors).toEqual([]); expect(requests).toEqual([]);
});

test("single preference seeds the flow; multiple map fuels require a choice and preserve map, filters and storage", async ({ page }) => {
  await fixtures(page); await page.goto("/en/");
  await page.getByRole("button", { name: messages.en.myFuelTitle, exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("DIESEL"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: messages.en.rcTitle, exact: true }).click();
  await expect(page.locator("#return-fuel")).toHaveValue("DIESEL"); await page.keyboard.press("Escape");
  await page.locator("#prefecture").selectOption("JP-47");
  await page.getByRole("button", { name: messages.en.mapList, exact: true }).click();
  await page.locator("#station-search").fill("Unknown"); await chooseFuels(page, ["REGULAR", "DIESEL"]);
  const before = await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY);
  const transform = await page.locator(".leaflet-map-pane").getAttribute("style");
  await page.getByRole("button", { name: messages.en.rcTitle, exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog.locator("#return-fuel")).toHaveValue("");
  await dialog.locator("#return-location").selectOption(naha); await expect(dialog.locator(".return-search")).toHaveCount(0);
  await dialog.locator("#return-fuel").selectOption("HIGH_OCTANE"); await expect(dialog.locator(".return-candidates h4")).toHaveCount(4);
  await page.keyboard.press("Escape");
  expect(await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe(before);
  await expect(page.locator("#prefecture")).toHaveValue("JP-47"); await expect(page.locator("#station-search")).toHaveValue("Unknown");
  await expect(page.getByRole("button", { name: messages.en.mapList, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(2);
  expect(await page.locator(".leaflet-map-pane").getAttribute("style")).toBe(transform);
});

test("late results from a previous branch cannot replace current results; closing cancels and reopening resets", async ({ page }) => {
  const manifest = await fixtures(page); let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const path = manifest.stations.partitions.find(p => p.code === "JP-47")!.path;
  let requestSeen!: () => void; const seen = new Promise<void>(resolve => { requestSeen = resolve; });
  await page.route(`**${path}`, async route => { requestSeen(); await delayed; await route.fallback(); });
  const dialog = await open(page); await dialog.locator("#return-location").selectOption(naha); await seen;
  await dialog.locator("#return-location").selectOption(chitose);
  await expect(dialog.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
  release(); await expect(dialog.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
  await dialog.getByRole("button", { name: "Choose this station: Chitose fixture", exact: true }).click();
  await page.keyboard.press("Escape"); await page.getByRole("button", { name: messages.en.rcTitle, exact: true }).click();
  await expect(dialog.locator("#return-location")).toHaveValue(""); await expect(dialog.locator(".return-search")).toHaveCount(0);
});

for (const failure of ["network", "unapproved source"]) test(`rental data ${failure} is rejected and retry succeeds`, async ({ page }) => {
  await fixtures(page); let failed = true;
  await page.route("**/data/rental/locations.json", route => {
    if (!failed) return route.fulfill({ json: rental });
    if (failure === "network") return route.fulfill({ status: 503, body: "unavailable" });
    const bad = structuredClone(rental); bad.sources[2].allowedUseAssessment = "PENDING"; return route.fulfill({ json: bad });
  });
  await page.goto("/en/"); await page.getByRole("button", { name: messages.en.rcTitle, exact: true }).click();
  const dialog = page.getByRole("dialog"); await expect(dialog.getByRole("alert")).toContainText(messages.en.rcError);
  await expect(dialog.locator("#return-location")).toHaveCount(0); failed = false;
  await dialog.getByRole("button", { name: messages.en.ffRetry }).click(); await expect(dialog.locator("#return-location")).toBeVisible();
});

test("station network failure supports retry with no return navigation", async ({ page }) => {
  const manifest = await fixtures(page); let failed = true;
  await page.route(`**${manifest.stations.partitions.find(p => p.code === "JP-47")!.path}`, route => failed ? route.fulfill({ status: 503, body: "unavailable" }) : route.fallback());
  const dialog = await open(page); await dialog.locator("#return-location").selectOption(naha);
  await expect(dialog.getByRole("alert")).toContainText(messages.en.rcStationsError); await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  failed = false; await dialog.getByRole("button", { name: messages.en.ffRetry }).click(); await expect(dialog.locator(".return-candidates h4")).toHaveCount(3);
});

test("empty nearby records are explicit and offer the map", async ({ page }) => {
  await fixtures(page, true); const dialog = await open(page); await dialog.locator("#return-location").selectOption(naha);
  await expect(dialog.getByRole("status")).toHaveText(messages.en.rcEmpty); await expect(dialog.locator(".return-navigation")).toHaveCount(0);
  await dialog.getByRole("button", { name: messages.en.rcBack }).click(); await expect(dialog).toHaveCount(0);
});

test("ninety-day-old sources retain their real check date and require rechecking", async ({ page }) => {
  await fixtures(page); await page.clock.setFixedTime(new Date("2026-12-29T00:00:00Z")); const dialog = await open(page);
  await expect(dialog.getByRole("alert")).toHaveText(messages.en.rcStale);
  await expect(dialog.getByText("Branch and rules checked: Sep 30, 2026", { exact: true })).toBeVisible();
});

test("closing while a branch request is pending aborts the request and cannot restore its address on reopen", async ({ page }) => {
  const manifest = await fixtures(page);
  const path = manifest.stations.partitions.find(p => p.code === "JP-47")!.path;
  let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
  let requestSeen!: () => void; const seen = new Promise<void>(resolve => { requestSeen = resolve; });
  await page.route(`**${path}`, async route => { requestSeen(); await delayed; await route.fallback(); });
  const aborted = page.waitForEvent("requestfailed", request => new URL(request.url()).pathname === path);
  const dialog = await open(page); await dialog.locator("#return-location").selectOption(naha); await seen;
  await page.keyboard.press("Escape"); release(); await aborted;
  await page.getByRole("button", { name: messages.en.rcTitle, exact: true }).click();
  await expect(dialog.locator("#return-location")).toHaveValue("");
  await expect(dialog.locator(".return-car-address")).toHaveCount(0);
  await expect(dialog.locator(".return-search")).toHaveCount(0);
});

test("shipped branch records load real station candidates and keep each return destination distinct", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-10-01T00:00:00Z"));
  await page.setViewportSize({ width: 1280, height: 900 });
  const dialog = await open(page, "zh-Hans");
  const t = messages["zh-Hans"];
  for (const branch of rental.records) {
    await dialog.locator("#return-location").selectOption(branch.id);
    await expect(dialog.locator(".return-candidates h4").first()).toBeVisible();
    const count = await dialog.locator(".return-candidates h4").count();
    expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(10);
    await expect(dialog.locator(".return-car-address")).toContainText(branch.addressJa);
    await dialog.locator(".return-candidates button").first().click();
    await expect(dialog.getByText(t.rcStep1, { exact: true })).toBeFocused();
    await dialog.getByRole("button", { name: t.rcDone, exact: true }).click();
    const region = dialog.locator(".return-search");
    await expect(region.getByText(t.rcStep2, { exact: true })).toBeFocused();
    await expect(region).toContainText(t.rcNavigationHelp);
    const href = await region.getByRole("link", { name: t.ffGoogle }).getAttribute("href");
    expect(new URL(href!).searchParams.get("destination")).toBe(`${branch.lat},${branch.lon}`);
    if (branch.id === naha) await page.screenshot({ path: testInfo.outputPath("return-car-shipped-data.png"), fullPage: true });
  }
});
