import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";
import { fixtures, rentalFixtures, stationFixtures, stationRow, nahaRows, naha, chitose, officialBranches, rentalIndex, rentalManifest, rentalManifestUrl, rentalLocation, messages, locales, openDetail, switchBranch, detailPath, destination, observations, storageSnapshot, watchPageErrors, evidencePath } from "./rental-fixtures";

const point = (row: { lat: number; lon: number }) => `${row.lat},${row.lon}`;

test("filters selected fuel independently, retains unknowns, and requires explicit completion before return navigation", async ({ page, context }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await fixtures(page); const detail = await openDetail(page);
  await expect(detail.locator(".return-candidates h4")).toHaveText(["Unknown supply", "Regular recorded", "Complex hours"]);
  await expect(detail.getByText("Straight-line distance: 0.1 km", { exact: true })).toBeVisible();
  await expect(detail.getByText(messages.en.rcUnknownSupply, { exact: false }).first()).toBeVisible();
  await expect(detail.getByText(messages.en.ffServiceUnknown, { exact: true }).first()).toBeVisible();
  await expect(detail.locator(".hours-raw").last()).toHaveText("sunrise-sunset");
  await expect(detail.getByText(messages.en.ffHoursUntranslated, { exact: true })).toBeVisible();
  await detail.getByRole("button", { name: "Choose this station: Unknown supply", exact: true }).click();
  await expect(detail.getByText(messages.en.rcStep1, { exact: true })).toBeFocused();
  const google = detail.getByRole("link", { name: messages.en.ffGoogle });
  const apple = detail.getByRole("link", { name: messages.en.ffApple });
  const url = new URL(await google.getAttribute("href") ?? "");
  expect([...url.searchParams]).toEqual([["api", "1"], ["destination", point(nahaRows[1])], ["travelmode", "driving"]]);
  expect(await destination(apple, "apple")).toBe(point(nahaRows[1]));
  await expect(detail.locator(".return-fuel-reminder")).toContainText("レギュラー");
  const popupPromise = context.waitForEvent("page"); await google.click(); const popup = await popupPromise; await popup.close();
  await expect(detail.getByText(messages.en.rcStep2, { exact: true })).toHaveCount(0);
  await detail.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await expect(detail.getByText(messages.en.rcStep2, { exact: true })).toBeFocused();
  expect(await destination(google)).toBe(point(naha));
  expect(await destination(apple, "apple")).toBe(point(naha));
  expect(point(naha)).not.toBe(point(nahaRows[1]));
  await switchBranch(page, chitose);
  await expect(detail.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await expect(detail.locator(".return-search")).not.toContainText("Fixture address 2");
  await switchBranch(page, naha);
  await detail.locator("#return-fuel").selectOption("DIESEL");
  await expect(detail.locator(".return-candidates h4")).toHaveText(["Diesel only", "Unknown supply", "Complex hours"]);
  await detail.getByRole("button", { name: "Choose this station: Diesel only", exact: true }).click();
  await detail.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await detail.getByRole("button", { name: messages.en.rcReselect, exact: true }).click();
  await expect(detail.locator(".return-candidates h4")).toHaveCount(3);
  await expect(detail.getByText(messages.en.rcCandidates, { exact: true })).toBeFocused();
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await detail.getByRole("button", { name: "Choose this station: Unknown supply", exact: true }).click();
  await detail.locator("#return-fuel").selectOption("REGULAR");
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await expect(detail.locator(".return-candidates h4")).toHaveText(["Unknown supply", "Regular recorded", "Complex hours"]);
});

for (const locale of locales) test(`${locale}: 320px detail, Japanese labels, source policy, navigation focus and mounted home map`, async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width: 320, height: 844 });
  const errors = watchPageErrors(page);
  const requests: string[] = []; page.on("request", request => { if (/timescar-rental\.com|\/data\/vehicles\/|\/data\/rental\/locations.json/.test(request.url())) requests.push(request.url()); });
  const t = messages[locale];
  await page.goto(`/${locale}/`);
  await expect(page.locator(".fuel-home-host .leaflet-container")).toBeVisible();
  const map = await page.locator(".fuel-home-host .leaflet-container").elementHandle();
  await page.locator("#return-car-link").click();
  await expect(page.getByTestId("rental-directory")).toBeVisible();
  await page.locator("#rental-query").fill("OKA"); await page.getByRole("button", { name: t.rdSearch, exact: true }).click();
  await page.locator(`[id="rental-card-${naha.id}"]`).click();
  const detail = page.getByTestId("rental-detail");
  await expect(detail.locator(".return-candidates h4")).toHaveCount(3);
  await expect(detail.locator(".station-mini-map-preview")).toHaveCount(3);
  await expect(detail.locator(".station-mini-map-preview").first()).toHaveAccessibleName(t.smPreview.replace("{name}", "Unknown supply"));
  await expect(detail.locator("dt[lang=ja]")).toHaveText(["満タン", "領収書 / レシート"]);
  await expect(detail.locator(".rental-detail-info")).toContainText(naha.address!);
  await expect(detail.getByRole("link", { name: t.rdOfficialWebsite })).toHaveAttribute("href", "https://www.timescar-rental.com/en/");
  await expect(detail.getByRole("link", { name: t.rdRuleSource })).toHaveAttribute("href", "https://www.timescar-rental.com/en/agreement/gas.html");
  await expect(detail.getByText(t.rcRules, { exact: true })).toBeVisible();
  await expect(detail.locator("#return-fuel")).toHaveValue("REGULAR");
  for (const value of ["レギュラー", "ハイオク", "軽油"]) await expect(detail.locator("#return-fuel")).toContainText(value);
  const regular = detail.locator(".return-candidates > li").filter({ has: page.getByRole("heading", { name: "Regular recorded", exact: true }) });
  await expect(regular.locator(".hours-original summary")).toHaveText(t.ffHoursOriginal);
  await expect(regular.getByText(t.ffHoursUntranslated, { exact: true })).toHaveCount(0);
  const translatedHours = { en: "Monday–Friday: 08:00–18:00", "zh-Hant": "星期一至星期五：08:00–18:00", "zh-Hans": "星期一至星期五：08:00–18:00", ko: "월요일–금요일: 08:00–18:00", th: "วันจันทร์–วันศุกร์: 08:00–18:00" };
  await expect(regular.getByText(translatedHours[locale], { exact: true })).toBeVisible();
  await regular.locator(".hours-original summary").click();
  await expect(regular.locator(".hours-raw")).toHaveText("Mo-Fr 08:00-18:00");
  expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of [detail.locator("#return-fuel"), detail.locator("[data-return-directory]"), page.getByRole("link", { name: t.navFindFuel, exact: true })]) {
    const box = await control.boundingBox(); expect(box?.height).toBeGreaterThanOrEqual(44); expect(box?.width).toBeGreaterThanOrEqual(44);
  }
  // The old modal focus trap/Escape assertions are replaced by actual page navigation.
  await detail.locator("[data-return-directory]").click();
  await expect(page.locator(`[id="rental-card-${naha.id}"]`)).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: t.navFindFuel, exact: true }).click();
  await expect(page.locator("#return-car-link")).toBeVisible();
  expect(await map!.evaluate(node => node.isConnected)).toBe(true);
  await page.locator("#return-car-link").click();
  await expect(page.locator("#rental-query")).toHaveValue("");
  await expect(page.locator(".return-navigation")).toHaveCount(0);
  expect(errors).toEqual([]); expect(requests).toEqual([]);
  expect((await observations(page)).geolocationCalls).toBe(0);
});

test("single preference seeds the flow; multiple map fuels require a choice and preserve map, filters and storage", async ({ page }) => {
  await fixtures(page); await page.goto("/en/");
  await page.getByRole("button", { name: messages.en.myFuelTitle, exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("DIESEL"); await page.keyboard.press("Escape");
  await page.locator("#return-car-link").click();
  await page.locator("#rental-query").fill("OKA"); await page.getByRole("button", { name: messages.en.rdSearch, exact: true }).click();
  await page.locator(`[id="rental-card-${naha.id}"]`).click();
  await expect(page.locator("#return-fuel")).toHaveValue("DIESEL");
  await page.getByRole("link", { name: messages.en.navFindFuel, exact: true }).click();
  await page.locator("#prefecture").selectOption("JP-47");
  await page.getByRole("button", { name: messages.en.mapList, exact: true }).click();
  await page.locator("#station-search").fill("Unknown"); await chooseFuels(page, ["REGULAR", "DIESEL"]);
  const before = await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY);
  const map = page.locator(".fuel-home-host .leaflet-container");
  const original = await map.elementHandle();
  const transform = await map.locator(".leaflet-map-pane").getAttribute("style");
  await page.locator("#return-car-link").click();
  await page.locator("#rental-query").fill("OKA"); await page.getByRole("button", { name: messages.en.rdSearch, exact: true }).click();
  await page.locator(`[id="rental-card-${naha.id}"]`).click();
  await expect(page.locator("#return-fuel")).toHaveValue(""); await expect(page.locator(".return-search")).toHaveCount(0);
  await page.locator("#return-fuel").selectOption("HIGH_OCTANE"); await expect(page.locator(".return-candidates h4")).toHaveCount(4);
  await page.getByRole("link", { name: messages.en.navFindFuel, exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe(before);
  await expect(page.locator("#prefecture")).toHaveValue("JP-47"); await expect(page.locator("#station-search")).toHaveValue("Unknown");
  await expect(page.getByRole("button", { name: messages.en.mapList, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(2);
  expect(await original!.evaluate(node => node.isConnected)).toBe(true);
  expect(await map.locator(".leaflet-map-pane").getAttribute("style")).toBe(transform);
});

test("late results from a previous branch cannot replace current results; leaving cancels and returning resets", async ({ page }) => {
  const manifest = await fixtures(page); let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const path = manifest.stations.partitions.find(p => p.code === "JP-47")!.path;
  let requestSeen!: () => void; const seen = new Promise<void>(resolve => { requestSeen = resolve; });
  await page.route(`**${path}`, async route => { requestSeen(); await delayed; await route.fallback(); });
  try {
    const detail = await openDetail(page); await seen;
    await switchBranch(page, chitose);
    await expect(detail.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
    await expect.poll(async () => (await observations(page)).aborted).toContain(path);
    release(); await expect(detail.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
    await detail.getByRole("button", { name: "Choose this station: Chitose fixture", exact: true }).click();
    await detail.locator("[data-return-directory]").click();
    await page.locator(`[id="rental-card-${chitose.id}"]`).click();
    await expect(detail.locator(".return-navigation")).toHaveCount(0);
    await expect(detail.locator(".return-candidates h4")).toHaveText(["Chitose fixture"]);
  } finally { release(); }
});

for (const failure of ["network", "unapproved source"] as const) test(`rental data ${failure} is rejected and retry succeeds`, async ({ page }) => {
  await fixtures(page); let failed = true;
  await page.route(`**${rentalManifestUrl}`, route => {
    if (!failed) return route.fallback();
    if (failure === "network") return route.fulfill({ status: 503, body: "unavailable" });
    const bad = structuredClone(rentalManifest); bad.sources[0].licenses = ["PENDING"];
    return route.fulfill({ json: bad });
  });
  await page.goto(detailPath(naha));
  await expect(page.getByRole("alert")).toContainText(messages.en.rcError);
  await expect(page.locator("#return-fuel")).toHaveCount(0);
  await expect(page.locator(".return-navigation")).toHaveCount(0);
  failed = false; await page.getByRole("button", { name: messages.en.ffRetry, exact: true }).click();
  await expect(page.locator(".return-candidates h4")).toHaveCount(3);
});

test("station network failure supports retry with no return navigation", async ({ page }) => {
  const manifest = await fixtures(page); let failed = true;
  await page.route(`**${manifest.stations.partitions.find(p => p.code === "JP-47")!.path}`, route => failed ? route.fulfill({ status: 503, body: "unavailable" }) : route.fallback());
  const detail = await openDetail(page);
  await expect(detail.getByRole("alert")).toContainText(messages.en.rcStationsError); await expect(detail.locator(".return-navigation")).toHaveCount(0);
  failed = false; await detail.getByRole("button", { name: messages.en.ffRetry }).click(); await expect(detail.locator(".return-candidates h4")).toHaveCount(3);
});

test("empty nearby records are explicit and offer a return to the fuel map", async ({ page }) => {
  await fixtures(page, true); const detail = await openDetail(page);
  await expect(detail.locator(".return-search").getByRole("status")).toHaveText(messages.en.rcEmpty);
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await page.getByRole("link", { name: messages.en.navFindFuel, exact: true }).click();
  await expect(page.locator("#prefecture")).toBeVisible();
});

test("ninety-day-old sources retain their real check date and require rechecking", async ({ page }) => {
  await fixtures(page);
  const checkedAt = rentalLocation(naha).official!.checkedAt;
  await page.clock.setFixedTime(new Date(Date.parse(`${checkedAt}T00:00:00Z`) + 90 * 86400000));
  const detail = await openDetail(page);
  await expect(detail.locator(".rental-official-notes").getByRole("alert")).toHaveText(messages.en.rdStale);
  await expect(detail.locator(".return-car-rules").getByRole("alert")).toHaveText(messages.en.rdStale);
  await expect(detail.getByText(messages.en.rcChecked.replace("{date}", checkedAt), { exact: true })).toBeVisible();
});

test("leaving while a branch request is pending aborts it and cannot restore its address in the directory", async ({ page }) => {
  const manifest = await fixtures(page);
  const path = manifest.stations.partitions.find(p => p.code === "JP-47")!.path;
  let release!: () => void; const delayed = new Promise<void>(resolve => { release = resolve; });
  let requestSeen!: () => void; const seen = new Promise<void>(resolve => { requestSeen = resolve; });
  await page.route(`**${path}`, async route => { requestSeen(); await delayed; await route.fallback(); });
  try {
    const detail = await openDetail(page); await seen;
    await detail.locator("[data-return-directory]").click();
    await expect.poll(async () => (await observations(page)).aborted).toContain(path);
    release();
    await expect(page.getByTestId("rental-directory")).toBeVisible();
    await expect(page.getByTestId("rental-detail")).toHaveCount(0);
    await expect(page.locator(".return-search, .return-navigation")).toHaveCount(0);
  } finally { release(); }
});

test("all reviewed shipped branches load real station candidates and keep every return destination distinct", async ({ page }, testInfo) => {
  test.setTimeout(60_000); // All reviewed facilities and complete return flows.
  await rentalFixtures(page); await page.setViewportSize({ width: 1280, height: 900 });
  for (const branch of officialBranches) {
    const detail = await openDetail(page, branch, "zh-Hans");
    const t = messages["zh-Hans"];
    await expect(detail.locator(".return-candidates h4").first()).toBeVisible();
    const count = await detail.locator(".return-candidates h4").count();
    expect(count).toBeGreaterThan(0); expect(count).toBeLessThanOrEqual(25);
    await expect(detail.locator(".rental-detail-info")).toContainText(branch.address!);
    await detail.locator(".return-candidates button").first().click();
    await expect(detail.getByText(t.rcStep1, { exact: true })).toBeFocused();
    const stationDestination = await destination(detail.getByRole("link", { name: t.ffGoogle }));
    expect(stationDestination).not.toBe(point(branch));
    await detail.getByRole("button", { name: t.rcDone, exact: true }).click();
    await expect(detail.getByText(t.rcStep2, { exact: true })).toBeFocused();
    await expect(detail.locator(".return-search")).toContainText(t.rcNavigationHelp);
    expect(await destination(detail.getByRole("link", { name: t.ffGoogle }))).toBe(point(branch));
  }
  await page.screenshot({ path: evidencePath(testInfo, "seven-airports-return.png"), fullPage: true });
});

test("candidate mini maps show each station, load only visible rows, and keep selection independent", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await fixtures(page);
  let providerRequests = 0;
  page.on("request", request => { if (request.url().endsWith("/runtime-map-provider.json")) providerRequests++; });
  const detail = await openDetail(page);
  const rows = detail.locator(".return-candidates > li");
  await expect(rows.locator(".station-mini-map-preview")).toHaveCount(3);
  const first = rows.nth(0).getByRole("img", { name: "Location of Unknown supply", exact: true });
  const second = rows.nth(1).getByRole("img", { name: "Location of Regular recorded", exact: true });
  const last = rows.nth(2).getByRole("img", { name: "Location of Complex hours", exact: true });
  await first.scrollIntoViewIfNeeded();
  await expect(first.locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(last.locator(".station-mini-map-tiles img")).toHaveCount(0);
  await expect(first.locator(".station-mini-map-pin img")).toHaveAttribute("src", "/brands/fuel-pump.svg");
  await expect(rows.first().getByRole("link", { name: messages.en.ffAttribution })).toBeVisible();
  const firstTiles = await first.locator(".station-mini-map-tiles img").evaluateAll(nodes => nodes.map(node => [node.getAttribute("src"), node.getAttribute("style")]));
  await first.click(); await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await second.scrollIntoViewIfNeeded();
  await expect(second.locator(".station-mini-map-tiles img").first()).toBeVisible();
  const secondTiles = await second.locator(".station-mini-map-tiles img").evaluateAll(nodes => nodes.map(node => [node.getAttribute("src"), node.getAttribute("style")]));
  expect(secondTiles).not.toEqual(firstTiles);
  await last.scrollIntoViewIfNeeded();
  await expect(last.locator(".station-mini-map-tiles img").first()).toBeVisible();
  await expect(first.locator(".station-mini-map-tiles img")).toHaveCount(0);
  await expect(detail.locator(".leaflet-container")).toHaveCount(2);
  await detail.getByRole("button", { name: "Choose this station: Regular recorded", exact: true }).click();
  await expect(detail.getByText(messages.en.rcStep1, { exact: true })).toBeFocused();
  expect(await destination(detail.getByRole("link", { name: messages.en.ffGoogle }))).toBe(point(nahaRows[2]));
  await detail.getByRole("button", { name: messages.en.rcReselect, exact: true }).click();
  await expect(rows.locator(".station-mini-map-preview")).toHaveCount(3);
  await switchBranch(page, chitose);
  const changed = detail.getByRole("img", { name: "Location of Chitose fixture", exact: true });
  await changed.scrollIntoViewIfNeeded();
  await expect(changed.locator(".station-mini-map-tiles img").first()).toBeVisible();
  const changedTiles = await changed.locator(".station-mini-map-tiles img").evaluateAll(nodes => nodes.map(node => [node.getAttribute("src"), node.getAttribute("style")]));
  expect(changedTiles).not.toEqual(firstTiles);
  await expect(rows).toHaveCount(1); await expect(detail.locator(".leaflet-container")).toHaveCount(2);
  expect(providerRequests).toBe(1);
});

for (const width of [320, 390, 768, 1280]) test(`candidate mini maps fit ${width}px`, async ({ page }, testInfo) => {
  await fixtures(page); await page.setViewportSize({ width, height: 844 });
  const detail = await openDetail(page, naha, "zh-Hans");
  const row = detail.locator(".return-candidates > li").first();
  const preview = row.locator(".station-mini-map-preview");
  await preview.scrollIntoViewIfNeeded(); await expect(preview.locator(".station-mini-map-message")).toHaveCount(0);
  const boxes = await row.evaluate(node => {
    const box = (selector: string) => { const r = node.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { map: box(".station-mini-map-preview"), details: box(".return-candidate-details"), attribution: box(".station-mini-map-attribution"), button: box("button"), fits: node.scrollWidth <= node.clientWidth };
  });
  expect(boxes.fits).toBe(true); expect(boxes.map.width).toBeGreaterThanOrEqual(80); expect(boxes.map.height).toBeGreaterThanOrEqual(100);
  expect(boxes.button.width).toBeGreaterThanOrEqual(44); expect(boxes.button.height).toBeGreaterThanOrEqual(44); expect(boxes.attribution.height).toBeGreaterThanOrEqual(44);
  expect(boxes.details.x).toBeGreaterThan(boxes.map.right);
  expect(await detail.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(detail.locator(".station-mini-map-expand, .station-mini-map-open")).toHaveCount(0);
  await page.screenshot({ path: evidencePath(testInfo, `return-candidate-minimaps-${width}.png`) });
});

test("candidate mini maps scroll the bounded list without moving the upper map", async ({ page, browserName, isMobile }) => {
  test.skip(browserName === "webkit" && isMobile, "Mobile WebKit cannot synthesize wheel input; covered by desktop WebKit.");
  await fixtures(page); await page.setViewportSize({ width: 1280, height: 844 }); const detail = await openDetail(page);
  const preview = detail.locator(".station-mini-map-preview").first(); await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator(".station-mini-map-message")).toHaveCount(0);
  const scrollBefore = await detail.locator("#return-results-scroll").evaluate(node => node.scrollTop);
  const mapTransform = await detail.locator(".rental-detail-layout .leaflet-map-pane").getAttribute("style");
  await preview.hover(); await page.mouse.wheel(0, 280);
  await expect.poll(() => detail.locator("#return-results-scroll").evaluate(node => node.scrollTop)).toBeGreaterThan(scrollBefore + 50);
  expect(await detail.locator(".rental-detail-layout .leaflet-map-pane").getAttribute("style")).toBe(mapTransform);
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
});

for (const failure of ["tiles", "provider"]) test(`candidate mini maps tolerate ${failure} failure without blocking station selection`, async ({ page }) => {
  await fixtures(page); let tileRequests = 0;
  page.on("request", request => { if (request.url().includes("tile.openstreetmap.org")) tileRequests++; });
  if (failure === "tiles") await page.route("https://tile.openstreetmap.org/**", route => route.fulfill({ status: 503, body: "Offline failure fixture" }));
  else await page.route("**/runtime-map-provider.json", route => route.fulfill({ json: { tileUrl: "https://unapproved.invalid/{z}/{x}/{y}.png" } }));
  const detail = await openDetail(page, naha, "zh-Hans"); const preview = detail.locator(".station-mini-map-preview").first();
  await preview.scrollIntoViewIfNeeded();
  await expect(preview.locator(".station-mini-map-message")).toHaveText(messages["zh-Hans"].smPreviewUnavailable);
  if (failure === "provider") { expect(tileRequests).toBe(0); await expect(detail.locator(".station-mini-map-tiles img")).toHaveCount(0); }
  await detail.getByRole("button", { name: `${messages["zh-Hans"].rcSelect}: Unknown supply`, exact: true }).click();
  await expect(detail.getByText(messages["zh-Hans"].rcStep1, { exact: true })).toBeFocused();
  expect(await destination(detail.getByRole("link", { name: messages["zh-Hans"].ffGoogle }))).toBe(point(nahaRows[1]));
});

// Additional page-model regressions beyond the original 23 migrated cases.
test("pending fuel change and explicit cancellation abort stale requests without changing persisted preferences", async ({ page }) => {
  const manifest = await fixtures(page); const path = manifest.stations.partitions.find(p => p.code === "JP-47")!.path;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; }); let calls = 0;
  await page.route(`**${path}`, async route => { if (++calls === 1) await gate; await route.fallback(); });
  try {
    const detail = await openDetail(page); await expect.poll(() => calls).toBe(1);
    const before = await storageSnapshot(page);
    await detail.locator("#return-fuel").selectOption("DIESEL");
    await expect.poll(async () => (await observations(page)).aborted).toContain(path);
    await expect(detail.locator(".return-candidates h4")).toHaveText(["Diesel only", "Unknown supply", "Complex hours"]);
    release(); await expect(detail.locator(".return-candidates h4")).toHaveText(["Diesel only", "Unknown supply", "Complex hours"]);
    await detail.getByRole("button", { name: messages.en.rdCancelSearch, exact: true }).click();
    await expect(detail.locator(".return-search")).toHaveCount(0);
    await detail.getByRole("button", { name: messages.en.ffRetry, exact: true }).click();
    await expect(detail.locator(".return-candidates h4")).toHaveCount(3);
    expect(await storageSnapshot(page)).toEqual(before);
  } finally { release(); }
});

test("10km search retains all nearby candidates for pagination, excludes known NO and retains UNKNOWN", async ({ page }) => {
  await rentalFixtures(page);
  const rows = Array.from({ length: 14 }, (_, i) => stationRow(100 + i, { lat: naha.lat + (i + 1) * .001, lon: naha.lon }, { fuelRegular: i === 0 ? "NO" : "UNKNOWN" }));
  await stationFixtures(page, { rows: [...rows, nahaRows[4]] });
  const detail = await openDetail(page);
  await expect(detail.locator(".return-candidates h4")).toHaveText(rows.slice(1).map(row => row.name!));
  await expect(detail.locator(".return-candidates")).not.toContainText("Outside radius");
});

test("ordinary non-Times candidates require reservation-address confirmation and never inherit Times rules", async ({ page }) => {
  const candidate = rentalIndex.records.find(row => row.companyId !== "times" && row.candidateStatus === "CANDIDATE")!;
  await rentalFixtures(page);
  await stationFixtures(page, { rows: [stationRow(99, { lat: candidate.lat + .001, lon: candidate.lon }, { prefectureCode: candidate.prefectureCode as "JP-47" })] });
  const detail = await openDetail(page, candidate);
  await expect(detail.locator(".return-car-rules")).toHaveText(messages.en.rdContractRules);
  await expect(detail.getByText(messages.en.rcRules, { exact: true })).toHaveCount(0);
  await expect(detail.locator(".rental-official-notes, dt[lang=ja]")).toHaveCount(0);
  await expect(detail.locator(".rental-detail-heading")).toContainText(messages.en.rdCandidate);
  await detail.locator(".return-candidates button").click();
  await detail.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await detail.locator(".rental-confirm input").check();
  expect(await destination(detail.getByRole("link", { name: messages.en.ffGoogle }))).toBe(point(candidate));
  await detail.getByRole("button", { name: messages.en.rcReselect, exact: true }).click();
  await detail.locator(".return-candidates button").click();
  await detail.getByRole("button", { name: messages.en.rcDone, exact: true }).click();
  await expect(detail.locator(".rental-confirm input")).not.toBeChecked();
  await expect(detail.locator(".return-navigation")).toHaveCount(0);
});

test("station integrity failure is fail-closed and retry keeps the real manifest hash check", async ({ page }) => {
  const manifest = await fixtures(page); const artifact = manifest.stations.partitions.find(p => p.code === "JP-47")!;
  let corrupt = true;
  await page.route(`**${artifact.path}`, route => corrupt ? route.fulfill({ contentType: "application/json", body: readFileSync(`public${artifact.path}`) }) : route.fallback());
  const detail = await openDetail(page);
  await expect(detail.getByRole("alert")).toContainText(messages.en.rcStationsError);
  await expect(detail.locator(".return-candidates, .return-navigation")).toHaveCount(0);
  corrupt = false; await detail.getByRole("button", { name: messages.en.ffRetry }).click();
  await expect(detail.locator(".return-candidates h4")).toHaveCount(3);
});
