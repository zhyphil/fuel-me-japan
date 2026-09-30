import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { test, expect } from "./offline";
import { rentalFixtures, stationFixtures, fixtures, rentalManifest, rentalManifestUrl, rentalIndex, rentalLocation, officialBranches, naha, chitose, counter, detailPath, messages, locales, watchPageErrors, observations, storageSnapshot, evidencePath } from "./rental-fixtures";
import type { Locale } from "../../src/i18n";

const defaultCount = rentalIndex.records.filter(row => row.candidateStatus !== "COUNTER_ONLY").length;
const expectedCount = (locale: Locale, count: number) => messages[locale].rdResults.replace("{count}", count.toLocaleString(locale));
async function openDirectory(page: Page, locale: Locale = "en", search = "") {
  await page.goto(`/${locale}/return-car/${search}`);
  const directory = page.getByTestId("rental-directory");
  await expect(directory).toBeVisible();
  await expect(directory.getByTestId("rental-map")).toHaveClass(/leaflet-container/);
  return directory;
}
async function search(page: Page, value: string, locale: Locale = "en") {
  await page.locator("#rental-query").fill(value);
  await page.getByRole("button", { name: messages[locale].rdSearch, exact: true }).click();
}
async function metadata(page: Page, locale: Locale, pathname: string) {
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://fuel-me-japan.com${pathname}`);
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(6);
  for (const language of locales) await expect(page.locator(`link[hreflang="${language}"]`)).toHaveAttribute("href", `https://fuel-me-japan.com${pathname.replace(`/${locale}/`, `/${language}/`)}`);
  await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute("href", `https://fuel-me-japan.com${pathname.replace(`/${locale}/`, "/en/")}`);
}
async function targetSize(control: Locator) {
  const box = await control.boundingBox();
  expect(box, await control.evaluate(node => node.outerHTML)).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44); expect(box!.height).toBeGreaterThanOrEqual(44);
}
// Recover the map center from the tile URL and CSS offset, independently of the
// application's thumbnail helper. A different shop's copied thumbnail cannot pass.
async function thumbnailPoint(thumbnail: Locator) {
  await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail.locator(".station-mini-map-tiles img").first()).toBeVisible();
  return thumbnail.evaluate(node => {
    const img = node.querySelector<HTMLImageElement>(".station-mini-map-tiles img")!;
    const match = new URL(img.src).pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.png$/)!;
    const n = 2 ** Number(match[1]) * 256;
    const x = Number(match[2]) * 256 - parseFloat(img.style.left) + node.clientWidth / 2;
    const y = Number(match[3]) * 256 - parseFloat(img.style.top) + node.clientHeight / 2;
    return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / n))) * 180 / Math.PI, lon: x / n * 360 - 180 };
  });
}

test("homepage remains fuel-first and loads no national rental data until the real same-site link is followed", async ({ page }) => {
  await fixtures(page); const requests: string[] = []; const errors = watchPageErrors(page);
  page.on("request", request => { if (request.url().includes("/data/rental/")) requests.push(new URL(request.url()).pathname); });
  await page.goto("/en/");
  await expect(page.locator("#prefecture")).toBeVisible();
  await expect(page.locator(".fuel-home-host .leaflet-container")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#return-car-link")).toHaveAttribute("href", "/en/return-car/");
  await expect(page.locator("#return-car-link")).not.toHaveAttribute("aria-haspopup", "dialog");
  const before = await storageSnapshot(page);
  await page.locator("#prefecture").selectOption("JP-47");
  await expect(page.locator("#prefecture")).toHaveValue("JP-47");
  expect(requests).toEqual([]);
  await page.locator("#return-car-link").click();
  await expect(page).toHaveURL(/\/en\/return-car\/$/);
  await expect(page.getByTestId("rental-directory")).toBeVisible();
  expect(requests).toEqual([rentalManifestUrl, rentalManifest.index.url]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await observations(page)).geolocationCalls).toBe(0);
  expect(await storageSnapshot(page)).toEqual(before); expect(errors).toEqual([]);
});

for (const locale of locales) for (const width of [320, 390, 1280]) test(`${locale}: ${width}px directory combines region/company/name, resets, paginates and fits`, async ({ page }, testInfo) => {
  await rentalFixtures(page); await page.setViewportSize({ width, height: 844 });
  const errors = watchPageErrors(page); const directory = await openDirectory(page, locale); const t = messages[locale];
  const before = await storageSnapshot(page);
  await expect(directory.locator(".rental-results-count")).toHaveText(expectedCount(locale, defaultCount));
  await expect(directory.locator(".rental-card")).toHaveCount(25);
  await expect(directory.locator(".station-mini-map-open")).toHaveCount(25);
  await expect(directory.locator(".status-counter_only")).toHaveCount(0);
  const firstIds = await directory.locator(".rental-card").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-rental-id")));
  await directory.getByRole("link", { name: t.rdNext, exact: true }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "26");
  await expect(directory.locator(".rental-card")).toHaveCount(25);
  const secondIds = await directory.locator(".rental-card").evaluateAll(nodes => nodes.map(node => node.getAttribute("data-rental-id")));
  expect(secondIds.some(id => firstIds.includes(id))).toBe(false);
  await expect(directory.locator(".rental-results-count")).toHaveText(expectedCount(locale, defaultCount));
  await directory.locator("#rental-region").selectOption("JP-47");
  await directory.locator("#rental-company").selectOption("times");
  await search(page, "OKA", locale);
  await expect(directory.locator(".rental-results-count")).toHaveText(expectedCount(locale, 1));
  await expect(directory.locator(".rental-card")).toHaveCount(1);
  await expect(directory.locator(".rental-card")).toHaveAttribute("data-rental-id", naha.id);
  const actual = await thumbnailPoint(directory.locator(".station-mini-map-open"));
  expect(actual.lat).toBeCloseTo(naha.lat, 5); expect(actual.lon).toBeCloseTo(naha.lon, 5);
  for (const control of [directory.locator("#rental-region"), directory.locator("#rental-company"), directory.locator("#rental-query"), directory.getByRole("button", { name: t.rdSearch, exact: true }), directory.getByRole("link", { name: t.rdReset, exact: true }), directory.locator(".rental-counters"), directory.locator(".rental-view-link"), directory.locator(".rental-map-point"), directory.locator(".leaflet-control-zoom-in")]) await targetSize(control);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await directory.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  await expect(directory.locator(".rental-map-caption")).toContainText(t.mapPrivacy);
  await expect(directory.locator(".rental-map-caption a")).toHaveAttribute("href", "https://www.openstreetmap.org/copyright");
  await page.screenshot({ path: evidencePath(testInfo, `directory-${locale}-${width}.png`), fullPage: true });
  await search(page, "no-rental-with-this-name-999999", locale);
  await expect(directory.locator(".rental-card")).toHaveCount(0);
  await expect(directory.getByText(t.rdEmpty, { exact: true })).toBeVisible();
  await directory.getByRole("link", { name: t.rdReset, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/${locale}/return-car/$`));
  await expect(directory.locator("#rental-region")).toHaveValue(""); await expect(directory.locator("#rental-company")).toHaveValue(""); await expect(directory.locator("#rental-query")).toHaveValue("");
  await expect(directory.locator(".rental-results-count")).toHaveText(expectedCount(locale, defaultCount));
  expect(await storageSnapshot(page)).toEqual(before); expect((await observations(page)).geolocationCalls).toBe(0); expect(errors).toEqual([]);
});

for (const branch of officialBranches) test(`${branch.airportCode}: official Times detail is directly addressable, refreshable and honest about the entrance`, async ({ page }) => {
  await rentalFixtures(page); await stationFixtures(page, { empty: true }); const errors = watchPageErrors(page);
  const partitionRequests: string[] = [];
  page.on("request", request => { if (/\/partitions\//.test(request.url()) && request.url().includes("/rental/")) partitionRequests.push(new URL(request.url()).pathname); });
  await page.goto(detailPath(branch));
  const detail = page.getByTestId("rental-detail");
  await expect(detail.locator("h1")).toHaveText(branch.names.primary!);
  await expect(detail.locator(".rental-detail-heading")).toContainText(messages.en.rdVerified);
  await expect(detail.locator(".rental-official-notes")).toContainText(messages.en[`rental.airport.${branch.airportCode!}`]);
  await expect(detail.locator(".rental-detail-heading")).toContainText(messages.en.rdReferencePoint);
  await expect(detail.locator(".rental-official-notes")).toContainText(messages.en.rdScope);
  await expect(detail.locator(".rental-official-notes")).toContainText("2026-09-30");
  await expect(detail.locator(".rental-official-notes [role=alert]")).toHaveCount(0);
  expect(branch.vehicleEntranceStatus).toBe("NOT_VERIFIED"); expect(branch.companyId).toBe("times");
  if (branch.airportCode === "KIX") {
    await expect(detail.locator(".rental-official-notes")).toContainText("2F");
    await expect(detail.locator(".rental-official-notes")).toContainText("vehicle entrance");
    expect(branch.positionKind).toBe("FACILITY_REFERENCE");
  }
  if (branch.airportCode === "NGO") await expect(detail.getByRole("link", { name: messages.en.rdAirportDirections })).toHaveAttribute("href", "https://www.centrair.jp/en/access/rental-car/return-route.html");
  const location = rentalLocation(branch);
  await detail.locator(".rental-record-sources > summary").click();
  for (const source of location.sources) {
    await expect(detail.locator(`.rental-record-sources a[href="${source.url}"]`)).toBeVisible();
    await expect(detail.locator(`.rental-record-sources time[datetime="${source.sourceDate}"]`).first()).toBeVisible();
  }
  const expectedPartition = rentalManifest.partitions.find(p => p.code === branch.prefectureCode)!.url;
  expect(partitionRequests).toEqual([expectedPartition]);
  await metadata(page, "en", detailPath(branch));
  await expect(page).toHaveTitle(`${branch.names.primary} | Fuel Me Japan`);
  await page.reload();
  await expect(detail.locator("#return-fuel")).toBeVisible(); await expect(detail.locator("h1")).toHaveText(branch.names.primary!);
  expect(partitionRequests).toEqual([expectedPartition, expectedPartition]); expect(errors).toEqual([]);
});

for (const locale of locales) test(`${locale}: locale links retain detail ID/query and synchronize metadata on directory navigation`, async ({ page }) => {
  await fixtures(page); const errors = watchPageErrors(page);
  const query = "?region=JP-47&company=times&q=OKA";
  await openDirectory(page, locale, query);
  await metadata(page, locale, `/${locale}/return-car/`);
  await page.locator(`[id="rental-card-${naha.id}"]`).click();
  await expect(page.getByTestId("rental-detail").locator("#return-fuel")).toBeVisible();
  await expect(page).toHaveTitle(`${naha.names.primary} | Fuel Me Japan`);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", `${naha.names.primary}. ${messages[locale].rdIntro}`);
  await metadata(page, locale, detailPath(naha, locale));
  const next = locales[(locales.indexOf(locale) + 1) % locales.length];
  const link = page.locator(`.locale-switcher a[lang="${next}"]`);
  await expect(link).toHaveAttribute("href", detailPath(naha, next, query));
  await page.locator(".locale-trigger").click(); await link.click();
  await expect.poll(() => new URL(page.url()).pathname + new URL(page.url()).search).toBe(detailPath(naha, next, query));
  await expect(page.getByTestId("rental-detail")).toHaveAttribute("data-rental-id", naha.id);
  await expect(page.locator("#return-fuel")).toBeVisible();
  await metadata(page, next, detailPath(naha, next));
  await page.locator("[data-return-directory]").click();
  await expect(page.locator("#rental-region")).toHaveValue("JP-47"); await expect(page.locator("#rental-company")).toHaveValue("times"); await expect(page.locator("#rental-query")).toHaveValue("OKA");
  await expect(page).toHaveTitle(`${messages[next].rdTitle} | Fuel Me Japan`);
  expect(errors).toEqual([]);
});

for (const id of ["does-not-exist", "%2F", "a/b"]) test(`unknown or malformed detail ${id} has accessible not-found and a directory return`, async ({ page }) => {
  await rentalFixtures(page); const errors = watchPageErrors(page);
  await page.goto(`/en/return-car/${id}/`);
  await expect(page.getByRole("status").filter({ has: page.getByRole("heading", { name: messages.en.rdNotFound }) })).toBeVisible();
  await expect(page.locator("#return-fuel, .return-navigation")).toHaveCount(0);
  await expect(page.locator("#prefecture")).toHaveCount(0);
  await metadata(page, "en", `/en/return-car/${id}/`);
  await page.getByRole("link", { name: messages.en.rdBackDirectory, exact: true }).click();
  await expect(page.getByTestId("rental-directory")).toBeVisible(); expect(errors).toEqual([]);
});

test("local preview rejects malformed UTF-8 before application routing", async ({ page }) => {
  await rentalFixtures(page);
  const response = await page.goto("/en/return-car/%E0%A4%A/");
  // Vite does not serve its SPA shell for a URI that cannot be decoded.
  expect(response?.status()).toBe(404);
  await expect(page.locator("#return-fuel, .return-navigation, #prefecture")).toHaveCount(0);
});

test("retired duplicate alias replaces the URL with its canonical ID and preserves the directory query", async ({ page }) => {
  await fixtures(page); const errors = watchPageErrors(page); const query = "?region=JP-47&company=times&q=OKA";
  await page.goto(`/en/return-car/${naha.aliases[0]}/${query}`);
  await expect(page).toHaveURL(new RegExp(`/en/return-car/${naha.id}/\\?region=JP-47&company=times&q=OKA$`));
  await expect(page.locator("#return-fuel")).toBeVisible(); await metadata(page, "en", detailPath(naha));
  await page.reload(); await expect(page.getByTestId("rental-detail")).toHaveAttribute("data-rental-id", naha.id); expect(errors).toEqual([]);
});

test("detail return and browser back restore region/company/name/page, exact card focus and scroll", async ({ page }) => {
  await rentalFixtures(page); await stationFixtures(page, { empty: true }); await page.setViewportSize({ width: 390, height: 844 });
  // Enough matching Hokkaido Toyota rows to exercise a real second page.
  const query = "?region=JP-01&company=toyota&q=トヨタ&page=2&perPage=10";
  const directory = await openDirectory(page, "en", query);
  const card = directory.locator(".rental-card h2 a").nth(7);
  await expect(card).toBeVisible(); await card.scrollIntoViewIfNeeded(); await card.focus();
  const id = await card.getAttribute("id"); const originalScroll = await page.evaluate(() => scrollY);
  const listScroll = await directory.locator("#rental-results-scroll").evaluate(node => node.scrollTop);
  expect(listScroll).toBeGreaterThan(0);
  const map = await directory.getByTestId("rental-map").elementHandle();
  await card.click(); await expect(page.getByTestId("rental-detail").locator("#return-fuel")).toBeVisible();
  await page.locator("[data-return-directory]").click();
  await expect(page).toHaveURL(/region=JP-01&company=toyota&q=.*&page=2&perPage=10$/);
  await expect(page.locator(`[id="${id}"]`)).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - originalScroll)).toBeLessThan(3);
  await expect.poll(async () => Math.abs(await directory.locator("#rental-results-scroll").evaluate(node => node.scrollTop) - listScroll)).toBeLessThan(3);
  await expect(directory.locator("#rental-page-size")).toHaveValue("10");
  await expect(page.locator("#rental-region")).toHaveValue("JP-01"); await expect(page.locator("#rental-company")).toHaveValue("toyota"); await expect(page.locator("#rental-query")).toHaveValue("トヨタ");
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
  await page.locator(`[id="${id}"]`).click(); await expect(page.getByTestId("rental-detail")).toBeVisible();
  await page.goBack();
  await expect(page.locator(`[id="${id}"]`)).toBeFocused();
  await expect.poll(async () => Math.abs(await page.evaluate(() => scrollY) - originalScroll)).toBeLessThan(3);
  await expect.poll(async () => Math.abs(await directory.locator("#rental-results-scroll").evaluate(node => node.scrollTop) - listScroll)).toBeLessThan(3);
  await expect(directory.locator("#rental-page-size")).toHaveValue("10");
});

test("mouse hover, rapid preview changes and keyboard focus highlight the final branch without rebuilding the map", async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width: 1280, height: 900 });
  const directory = await openDirectory(page, "en", "?region=JP-47&company=times");
  const map = directory.getByTestId("rental-map"); const instance = await map.elementHandle();
  const cards = directory.locator(".rental-card"); const first = cards.nth(0), second = cards.nth(1);
  const firstId = await first.getAttribute("data-rental-id"), secondId = await second.getAttribute("data-rental-id");
  await first.hover();
  await expect(map.locator(`[id="rental-marker-${firstId}"]`)).toHaveClass(/is-preview/);
  // React derives pointer-enter/leave from bubbling pointer-over/out events.
  // Dispatch rapid movement in one browser task, before the 180ms deadline.
  await page.evaluate(([a, b]) => {
    const first = document.querySelector(`[data-rental-id="${a}"]`)!;
    const second = document.querySelector(`[data-rental-id="${b}"]`)!;
    first.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
    first.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
    first.dispatchEvent(new PointerEvent("pointerout", { bubbles: true, pointerType: "mouse", relatedTarget: document.body }));
    second.dispatchEvent(new PointerEvent("pointerover", { bubbles: true, pointerType: "mouse" }));
  }, [firstId, secondId]);
  await expect(second).toHaveClass(/is-preview/); await expect(first).not.toHaveClass(/is-preview/);
  const marker = map.locator(`[id="rental-marker-${secondId}"]`);
  await expect(marker).toHaveClass(/is-preview/);
  await expect(map.locator(".rental-map-point.is-preview")).toHaveCount(1);
  await expect.poll(async () => {
    const a = await marker.boundingBox(), b = await map.boundingBox();
    return a && b ? Math.abs(a.x + a.width / 2 - b.x - b.width / 2) + Math.abs(a.y + a.height / 2 - b.y - b.height / 2) : Infinity;
  }).toBeLessThan(6);
  await expect.poll(() => map.locator("img.leaflet-tile").evaluateAll(nodes => nodes.some(node => /\/14\//.test((node as HTMLImageElement).src)))).toBe(true);
  await second.dispatchEvent("pointerout", { pointerType: "mouse" });
  await first.locator("h2 a").focus();
  await expect(map.locator(`[id="rental-marker-${firstId}"]`)).toHaveClass(/is-preview/);
  await directory.locator("#rental-query").focus();
  await expect(map.locator(".is-preview")).toHaveCount(0);
  await map.locator(".leaflet-control-zoom-in").click();
  await directory.locator("#rental-region").selectOption("JP-01");
  await expect(map.locator(".is-preview")).toHaveCount(0); expect(await instance!.evaluate(node => node.isConnected)).toBe(true);
  await expect(directory.locator(".leaflet-container")).toHaveCount(1);
});

test("touch scrolling does not preview a branch; only visible thumbnail rows request tiles and old rows unload", async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width: 390, height: 844 }); const directory = await openDirectory(page);
  const cards = directory.locator(".rental-card"); await expect(cards).toHaveCount(25);
  const first = cards.first().locator(".station-mini-map-open"); const last = cards.last().locator(".station-mini-map-open");
  await first.scrollIntoViewIfNeeded();
  const id = await cards.first().getAttribute("data-rental-id"); const row = rentalIndex.records.find(row => row.id === id)!;
  const center = await thumbnailPoint(first); expect(center.lat).toBeCloseTo(row.lat, 5); expect(center.lon).toBeCloseTo(row.lon, 5);
  await expect(last.locator(".station-mini-map-tiles img")).toHaveCount(0);
  await cards.first().dispatchEvent("pointerover", { pointerType: "touch", isPrimary: true });
  await page.evaluate(() => window.scrollBy(0, 180));
  await expect.poll(() => cards.locator(".station-mini-map-tiles img").count()).toBeGreaterThan(0);
  // Negative assertion must span the application's 180ms preview debounce.
  await page.waitForTimeout(250);
  await expect(directory.locator(".rental-card.is-preview, .rental-map-point.is-preview")).toHaveCount(0);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(first.locator(".station-mini-map-tiles img")).toHaveCount(0);
  const activeRows = await cards.evaluateAll(nodes => nodes.filter(node => node.querySelector(".station-mini-map-tiles img")).length);
  expect(activeRows).toBeLessThan(5);
  await expect(directory.locator(".leaflet-container")).toHaveCount(1);
});

for (const failure of ["tiles", "provider"]) test(`directory ${failure} failure keeps names, links and attribution usable`, async ({ page }) => {
  await rentalFixtures(page);
  const tileRequests: string[] = []; page.on("request", request => { if (request.resourceType() === "image" && /tile|unapproved/.test(request.url())) tileRequests.push(request.url()); });
  if (failure === "tiles") await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({ status: 503, body: "Offline tile error" }));
  else await page.route("**/runtime-map-provider.json", route => route.fulfill({ json: { tileUrl: "https://unapproved.invalid/{z}/{x}/{y}.png", prefetch: false, offlineTiles: false } }));
  await page.goto("/en/return-car/?region=JP-47&company=times&q=OKA");
  const directory = page.getByTestId("rental-directory");
  await expect(directory.locator(".rental-card h2")).toHaveText(naha.names.primary!);
  await expect(directory.locator(".rental-map-message")).toHaveText(messages.en.rdMapUnavailable);
  const thumbnail = directory.locator(".station-mini-map-open"); await thumbnail.scrollIntoViewIfNeeded();
  await expect(thumbnail.locator(".station-mini-map-message")).toHaveText(messages.en.rdMapUnavailable);
  await expect(directory.locator(".station-mini-map-attribution")).toBeVisible();
  if (failure === "provider") expect(tileRequests).toEqual([]);
  else expect(tileRequests.every(url => new URL(url).hostname === "tile.openstreetmap.org")).toBe(true);
  await directory.locator(".rental-view-link").click(); await expect(page.getByTestId("rental-detail")).toHaveAttribute("data-rental-id", naha.id);
});

test("counter opt-in is explicit and counter detail cannot become a return destination", async ({ page }) => {
  await rentalFixtures(page); const directory = await openDirectory(page);
  await search(page, counter.id); await expect(directory.locator(".rental-card")).toHaveCount(0);
  await directory.locator(".rental-counters input").check();
  await expect(directory.locator(".rental-card")).toHaveCount(1);
  await expect(directory.locator(".rental-status")).toHaveText(messages.en.rdCounter);
  await directory.locator(".rental-card h2 a").click();
  await expect(page.getByTestId("rental-detail").locator(".return-car-rules")).toBeVisible();
  await expect(page.getByTestId("rental-detail")).toContainText(messages.en.rdCounterHelp);
  await expect(page.locator("#return-fuel, .return-search, .return-navigation")).toHaveCount(0);
});

for (const target of ["index", "partition"] as const) for (const failure of ["network", "same-size hash corruption", "truncated bytes"] as const) test(`${target} ${failure} fails closed and retries the signed artifact`, async ({ page }) => {
  await fixtures(page); let failed = true;
  const artifact = target === "index" ? rentalManifest.index : rentalManifest.partitions.find(p => p.code === naha.prefectureCode)!;
  const original = readFileSync(`public${artifact.url}`);
  const corrupt = Buffer.from(original);
  // Change only trailing JSON whitespace: identical parsed data and byte length,
  // so rejecting this payload specifically proves the SHA-256 check still runs.
  expect(corrupt[corrupt.length - 1]).toBe(10); corrupt[corrupt.length - 1] = 9;
  expect(JSON.parse(corrupt.toString())).toEqual(JSON.parse(original.toString()));
  expect(corrupt.length).toBe(original.length); expect(createHash("sha256").update(corrupt).digest("hex")).not.toBe(artifact.sha256);
  await page.route(`**${artifact.url}`, route => !failed ? route.fallback() : failure === "network" ? route.fulfill({ status: 503, body: "Offline network failure" }) : route.fulfill({ contentType: "application/json", body: failure === "same-size hash corruption" ? corrupt : original.subarray(0, original.length - 1) }));
  await page.goto(detailPath(naha));
  await expect(page.getByRole("alert")).toContainText(messages.en.rcError);
  await expect(page.locator("#return-fuel, .return-navigation, .return-candidates")).toHaveCount(0);
  failed = false; await page.getByRole("button", { name: messages.en.ffRetry, exact: true }).click();
  await expect(page.locator(".return-candidates h4")).toHaveCount(3);
});

test("leaving a pending rental detail aborts its partition and a late response cannot replace another branch", async ({ page }) => {
  await fixtures(page); const path = rentalManifest.partitions.find(p => p.code === naha.prefectureCode)!.url;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let observed!: () => void; const seen = new Promise<void>(resolve => { observed = resolve; });
  await page.route(`**${path}`, async route => { observed(); await gate; await route.fallback(); });
  try {
    await page.goto(detailPath(naha)); await seen;
    await page.locator("[data-return-directory]").click();
    await expect.poll(async () => (await observations(page)).aborted).toContain(path);
    await search(page, "CTS"); await page.locator(`[id="rental-card-${chitose.id}"]`).click();
    await expect(page.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
    release(); await expect(page.getByTestId("rental-detail")).toHaveAttribute("data-rental-id", chitose.id);
    await expect(page.locator(".rental-detail-info")).toContainText(chitose.address!);
    await expect(page.locator(".rental-detail-info")).not.toContainText(naha.address!);
  } finally { release(); }
});

test("source downloads expose all 59 manifest artifacts, every partition and original provenance", async ({ page }) => {
  await rentalFixtures(page); await openDirectory(page); const sources = page.locator(".rental-sources");
  await sources.locator(":scope > summary").click();
  await expect(sources).toContainText(messages.en.rdLicenseHelp); await expect(sources).toContainText(messages.en.rdDownloadHelp);
  for (const source of rentalManifest.sources) await expect(sources.locator(`a[href="${source.url}"]`)).toBeVisible();
  for (const license of rentalManifest.licenses) await expect(sources.locator(`.rental-license-links a[href="${license.url}"]`)).toBeVisible();
  await sources.getByText(messages.en.ffDownloads, { exact: true }).click();
  const links = sources.locator(".download-list a"); await expect(links).toHaveCount(rentalManifest.downloads.length);
  const urls = await links.evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  expect(urls.sort()).toEqual(rentalManifest.downloads.map(item => item.url).sort()); expect(urls).toHaveLength(59);
  expect(rentalManifest.partitions).toHaveLength(48);
  for (const artifact of rentalManifest.downloads) {
    // BrowserContext routing handles page requests; use the page's native fetch so
    // fixture bytes are actually downloaded and independently hashed here.
    const result = await page.evaluate(async url => {
      const response = await fetch(url); const bytes = await response.arrayBuffer();
      const digest = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map(b => b.toString(16).padStart(2, "0")).join("");
      return { ok: response.ok, bytes: bytes.byteLength, sha256: digest };
    }, artifact.url);
    expect(result).toEqual({ ok: true, bytes: artifact.bytes, sha256: artifact.sha256 });
    if (rentalManifest.partitions.some(p => p.url === artifact.url)) {
      const partition = JSON.parse(readFileSync(`public${artifact.url}`, "utf8"));
      const descriptor = rentalManifest.partitions.find(p => p.url === artifact.url)!;
      expect(partition.records).toHaveLength(descriptor.count);
      expect(partition.records.every((row: { prefectureCode: string }) => row.prefectureCode === descriptor.code)).toBe(true);
    }
  }
});

test("changing region while a name is being edited cannot display results for invisible stale criteria", async ({ page }) => {
  await rentalFixtures(page); const directory = await openDirectory(page);
  await page.locator("#rental-query").fill("no-rental-with-this-name-999999");
  await page.locator("#rental-region").selectOption("JP-47");
  // A filter change may commit the draft or clear it; it must not leave a visible
  // name filter with unrelated rows. The Search button remains available either way.
  const visibleQuery = await page.locator("#rental-query").inputValue();
  const urlQuery = new URL(page.url()).searchParams.get("q") ?? "";
  expect(visibleQuery).toBe(urlQuery);
  if (visibleQuery) await expect(directory.locator(".rental-card")).toHaveCount(0);
});

test("cluster keyboard activation offers bounded members and clears them on filtering", async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width: 1280, height: 900 }); const directory = await openDirectory(page);
  const map = directory.getByTestId("rental-map"); const instance = await map.elementHandle();
  await expect(map.locator(".rental-map-cluster").first()).toBeVisible();
  const index = await map.locator(".rental-map-cluster").evaluateAll(nodes => nodes.findIndex(node => Number(node.textContent?.replaceAll(",", "")) > 20));
  expect(index).toBeGreaterThanOrEqual(0);
  const cluster = map.locator(".rental-map-cluster").nth(index);
  await cluster.focus(); await page.keyboard.press("Enter");
  const members = directory.locator(".rental-cluster-members");
  await expect(members).toBeVisible(); await expect(members.locator("li")).toHaveCount(20);
  await expect(members.locator("summary")).toBeFocused();
  await page.keyboard.press("Tab"); await expect(members.locator("li a").first()).toBeFocused();
  const links = await members.locator("li a").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
  expect(links.every(href => href?.startsWith("/en/return-car/"))).toBe(true);
  await members.getByRole("button", { name: messages.en.rdMore, exact: true }).click();
  expect(await members.locator("li").count()).toBeGreaterThan(20); expect(await members.locator("li").count()).toBeLessThanOrEqual(40);
  await search(page, "OKA"); await expect(members).toHaveCount(0);
  await expect(directory.locator(".rental-card")).toHaveCount(1);
  expect(await instance!.evaluate(node => node.isConnected)).toBe(true);
});

for (const path of ["/en/", "/en/return-car/", "/en/return-car/times-naha-airport/"]) test(`same-page skip link moves keyboard focus into main on ${path}`, async ({ page }) => {
  await fixtures(page);
  await page.goto(path);
  if (path.includes("times-naha")) await expect(page.locator("#return-fuel")).toBeVisible();
  else if (path.includes("return-car")) await expect(page.getByTestId("rental-directory")).toBeVisible();
  else await expect(page.locator("#prefecture")).toBeVisible();
  await page.locator(".skip-link").focus();
  await expect(page.locator(".skip-link")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main")).toBeFocused();
  await expect(page).toHaveURL(new RegExp(`${path}#main$`));
});

for (const width of [320, 390, 1280]) test(`${width}px: bounded rental list supports 10/25/50/100 rows without lengthening the page`, async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width, height: 844 });
  const directory = await openDirectory(page);
  const cards = directory.locator(".rental-card");
  await expect(cards).toHaveCount(25);
  const pageSize = directory.locator("#rental-page-size");
  await expect(pageSize).toHaveValue("25");
  expect(await pageSize.locator("option").evaluateAll(nodes => nodes.map(node => node.getAttribute("value")))).toEqual(["10", "25", "50", "100"]);
  const scroll = directory.locator("#rental-results-scroll");
  const pagination = directory.locator(".rental-pagination");
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (const size of [100, 10, 25, 50]) {
    await pageSize.selectOption(String(size));
    await expect(pageSize).toBeFocused();
    await expect(cards).toHaveCount(size);
    await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "1");
    expect(await scroll.evaluate(node => node.scrollHeight > node.clientHeight)).toBe(true);
    expect((await scroll.boundingBox())!.height).toBeLessThan(844);
    expect(Math.abs(await page.evaluate(() => document.documentElement.scrollHeight) - height)).toBeLessThan(3);
    const firstIds = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-rental-id")));
    await pagination.getByRole("link", { name: messages.en.rdNext, exact: true }).click();
    await expect(directory.locator(".rental-cards")).toHaveAttribute("start", String(size + 1));
    await expect(pagination).toBeFocused();
    await expect(cards).toHaveCount(size);
    expect(await cards.evaluateAll((nodes, ids) => nodes.some(node => ids.includes(node.getAttribute("data-rental-id"))), firstIds)).toBe(false);
    await scroll.evaluate(node => { node.scrollTop = node.scrollHeight; });
    expect(await scroll.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    const barBefore = await pagination.boundingBox();
    const windowBefore = await page.evaluate(() => scrollY);
    await pagination.getByRole("link", { name: messages.en.rdPrevious, exact: true }).click();
    await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "1");
    await expect.poll(() => scroll.evaluate(node => node.scrollTop)).toBe(0);
    expect(Math.abs((await pagination.boundingBox())!.y - barBefore!.y)).toBeLessThan(3);
    expect(Math.abs(await page.evaluate(() => scrollY) - windowBefore)).toBeLessThan(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.reload();
  await expect(pageSize).toHaveValue("50"); await expect(cards).toHaveCount(50);
  await directory.locator("#rental-region").selectOption("JP-47");
  await expect(pageSize).toHaveValue("50");
  await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "1");
});

test("an oversized page URL clamps to the real last page and keeps ten-per-page navigation beyond 500", async ({ page }) => {
  await rentalFixtures(page);
  const directory = await openDirectory(page, "en", "?page=999999&perPage=10");
  const last = Math.ceil(defaultCount / 10);
  await expect(directory.locator(".rental-cards")).toHaveAttribute("start", String((last - 1) * 10 + 1));
  await expect(directory.locator(".rental-card")).toHaveCount(defaultCount - (last - 1) * 10);
  await expect(directory.locator("#rental-page-size")).toHaveValue("10");
  await expect(directory.getByRole("link", { name: messages.en.rdNext, exact: true })).toHaveCount(0);
  await directory.getByRole("link", { name: messages.en.rdPrevious, exact: true }).click();
  expect(new URL(page.url()).searchParams.get("page")).toBe(String(last - 1));
  expect(new URL(page.url()).searchParams.get("perPage")).toBe("10");
  await expect(directory.locator(".rental-card")).toHaveCount(10);
});


for (const width of [320, 1280]) test(`${width}px: page number entry jumps directly to the final page and keeps keyboard and button navigation in sync`, async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width, height: 844 });
  const errors = watchPageErrors(page); const directory = await openDirectory(page);
  const pageNumber = directory.locator("#rental-page-number");
  const jump = directory.locator(".rental-page-jump button");
  await expect(pageNumber).toBeVisible(); await expect(pageNumber).toHaveValue("1");
  const last = Math.ceil(defaultCount / 25);
  await pageNumber.fill(String(last)); await pageNumber.press("Enter");
  await expect(page).toHaveURL(new RegExp(`page=${last}$`));
  await expect(directory.locator(".rental-cards")).toHaveAttribute("start", String((last - 1) * 25 + 1));
  await expect(directory.locator(".rental-card")).toHaveCount(defaultCount - (last - 1) * 25);
  await expect(directory.getByRole("link", { name: messages.en.rdNext, exact: true })).toHaveCount(0);
  await expect(pageNumber).toBeFocused();
  await pageNumber.fill("42"); await jump.click();
  await expect(page).toHaveURL(/page=42$/); await expect(pageNumber).toHaveValue("42");
  await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "1026");
  await expect(directory.locator(".rental-card")).toHaveCount(25);
  await expect.poll(() => directory.locator("#rental-results-scroll").evaluate(node => node.scrollTop)).toBe(0);
  await directory.getByRole("link", { name: messages.en.rdNext, exact: true }).click();
  await expect(pageNumber).toHaveValue("43");
  await page.goBack(); await expect(pageNumber).toHaveValue("42");
  await page.reload(); await expect(pageNumber).toHaveValue("42");
  await directory.getByRole("link", { name: messages.en.rdPrevious, exact: true }).click();
  await expect(pageNumber).toHaveValue("41");
  await targetSize(pageNumber); await targetSize(jump);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await directory.locator(".rental-pagination").evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("page number entry preserves filters, clamps bounds and rejects empty or non-integer drafts", async ({ page }) => {
  await rentalFixtures(page);
  const directory = await openDirectory(page, "en", "?region=JP-01&company=toyota&q=トヨタ&perPage=10");
  const pageNumber = directory.locator("#rental-page-number");
  const count = Number((await directory.locator(".rental-results-count").innerText()).replace(/\D/g, ""));
  const last = Math.ceil(count / 10); expect(last).toBeGreaterThan(1);
  await pageNumber.fill("999999"); await pageNumber.press("Enter");
  await expect(pageNumber).toHaveValue(String(last));
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(params)).toEqual({ region: "JP-01", company: "toyota", q: "トヨタ", page: String(last), perPage: "10" });
  const lastUrl = page.url();
  for (const value of ["", "abc", "1.5", "1e3"]) {
    await pageNumber.fill(value); await pageNumber.press("Enter");
    await expect(pageNumber).toHaveValue(String(last)); await expect(page).toHaveURL(lastUrl);
  }
  for (const value of ["0", "-4"]) {
    await pageNumber.fill(value); await pageNumber.press("Enter");
    await expect(pageNumber).toHaveValue("1");
    await expect(directory.locator(".rental-cards")).toHaveAttribute("start", "1");
  }
  await pageNumber.fill("2"); await pageNumber.press("Enter");
  await expect(pageNumber).toHaveValue("2");
  await directory.locator("#rental-page-size").selectOption("25");
  await expect(pageNumber).toHaveValue("1");
  await search(page, "no-rental-with-this-name-999999");
  await expect(pageNumber).toHaveValue("1"); await expect(pageNumber).toBeDisabled();
  await expect(directory.locator(".rental-page-jump button")).toBeDisabled();
});
