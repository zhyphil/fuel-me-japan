import { type Page } from "@playwright/test";
import { test, expect } from "./offline";
import type { Locale } from "../../src/i18n";
import { vehicleLocales as locales } from "../../src/lib/vehicle-sources";
import { fixtureArtifacts, vehicleFixture, fixtureMessages as messages } from "../fixtures/vehicles";
import { chooseFuels } from "./fuel-selection";

async function fixtures(page: Page, fixture = vehicleFixture()) {
  const { files } = fixtureArtifacts(fixture);
  await page.route("**/data/vehicles/**", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: files[new URL(route.request().url()).pathname] ?? "{}" }); });
}
async function open(page: Page, locale: Locale = "en") {
  await page.getByRole("button", { name: messages[locale].myFuelTitle, exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function selectVehicle(page: Page, fuel = "REGULAR", locale: Locale = "en") {
  const t = messages[locale], dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: t.myFuelMake, exact: true }).selectOption("Fictional Test Motors");
  await dialog.getByRole("combobox", { name: t.myFuelModel, exact: true }).selectOption("Imaginary Test Car");
  await dialog.getByRole("combobox", { name: t.myFuelVariant, exact: true }).selectOption(`Test ${fuel}`);
  await dialog.getByRole("combobox", { name: t.myFuelYear, exact: true }).selectOption("2021");
  await dialog.getByRole("button", { name: t.myFuelCheck, exact: true }).click();
}

for (const locale of locales) {
  for (const width of [320, 1280]) {
    test(`${locale} ${width}px: shipped empty coverage, neutral labels and keyboard closure`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const requests: string[] = [];
      page.on("request", (request) => { if (request.url().includes("/data/vehicles/")) requests.push(request.url()); });
      await page.goto(`/${locale}/`);
      await expect(page.locator(".leaflet-container")).toBeVisible();
      expect(requests).toEqual([]);
      const trigger = page.getByRole("button", { name: messages[locale].myFuelTitle, exact: true });
      await trigger.focus(); await trigger.press("Enter");
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(messages[locale].myFuelEmptyTitle)).toBeVisible();
      await expect(dialog.getByRole("combobox")).toHaveCount(1);
      await expect(dialog.getByRole("combobox", { name: messages[locale].myFuelPreference, exact: true })).toHaveValue("REGULAR");
      await expect(dialog.getByText(messages[locale].myFuelGuidance)).toBeVisible();
      for (const label of ["レギュラー", "ハイオク", "軽油"]) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await dialog.getByRole("button", { name: messages[locale].myFuelClose }).focus();
      await page.keyboard.press("Tab");
      // Native dialog keyboard focus must never enter the inert map.
      expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest("dialog") !== null)).toBe(true);
      await page.keyboard.press("Shift+Tab");
      await page.screenshot({ path: testInfo.outputPath(`my-fuel-${locale}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      expect(requests).toHaveLength(3);
    });
  }
  test(`${locale}: exact fictional result uses localized copy and Japanese fuel label`, async ({ page }) => {
    await fixtures(page); await page.goto(`/${locale}/`); await open(page, locale);
    await selectVehicle(page, "REGULAR", locale);
    const result = page.getByTestId("my-fuel-result");
    await expect(result.getByText(messages[locale].myFuelVerified, { exact: true })).toBeVisible();
    await expect(result.getByText("レギュラー", { exact: true })).toBeVisible();
    await expect(result.getByText(messages[locale].myFuelConfirm)).toBeVisible();
  });
}

test("three fictional fuels and UNKNOWN, selection invalidation, clear, focus trap and session reset", async ({ page }) => {
  await fixtures(page); await page.goto("/en/"); await open(page);
  for (const [fuel, japanese] of [["REGULAR", "レギュラー"], ["HIGH_OCTANE", "ハイオク"], ["DIESEL", "軽油"]]) {
    await selectVehicle(page, fuel);
    const result = page.getByTestId("my-fuel-result");
    await expect(result.getByText(japanese, { exact: true })).toBeVisible();
    await expect(result).toContainText("2021"); await expect(result).toContainText("2026-09-20");
    await expect(result.getByRole("link")).toHaveAttribute("href", "https://example.test/fictional-manual");
    await page.getByRole("combobox", { name: messages.en.myFuelYear, exact: true }).selectOption("");
    await expect(result).toHaveCount(0);
  }
  await selectVehicle(page, "UNKNOWN");
  await expect(page.getByTestId("my-fuel-result")).toContainText(messages.en.myFuelUnknown);
  await page.getByRole("button", { name: messages.en.myFuelClear, exact: true }).click();
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true })).toHaveValue("");
  await selectVehicle(page);
  await page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true }).selectOption("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelModel, exact: true })).toHaveValue("");
  await selectVehicle(page);
  const close = page.getByRole("button", { name: messages.en.myFuelClose });
  await close.focus(); await page.keyboard.press("Shift+Tab");
  // Chromium may visit browser chrome at the native dialog boundary. The inert map
  // must never receive focus, and the next reverse Tab returns to the last dialog link.
  const boundary = await page.evaluate(() => document.activeElement === document.body ? "browser" : document.activeElement?.closest("dialog") ? "dialog" : "background");
  expect(boundary).not.toBe("background");
  if (boundary === "browser") await page.keyboard.press("Shift+Tab");
  await expect(page.getByTestId("my-fuel-result").getByRole("link")).toBeFocused();
  await close.click(); await open(page);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true })).toHaveValue("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
});

test("explicit company scope and changing company immediately invalidates the result", async ({ page }) => {
  const f = vehicleFixture();
  f.mappings.records.forEach((row) => { row.rentalCompany = "Fictional Rental A"; });
  f.registry.sources[0].evidence.forEach((row) => { row.rentalCompany = "Fictional Rental A"; });
  await fixtures(page, f); await page.goto("/en/"); await open(page);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true }).locator("option")).toHaveCount(1);
  await page.getByRole("combobox", { name: messages.en.myFuelCompany, exact: true }).selectOption("Fictional Rental A");
  await selectVehicle(page);
  await expect(page.getByTestId("my-fuel-result")).toContainText(messages.en.myFuelVerified);
  await page.getByRole("combobox", { name: messages.en.myFuelCompany, exact: true }).selectOption("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true })).toHaveValue("");
});

test("error/retry is accessible; reloading clears VERIFIED before delayed data arrives", async ({ page }) => {
  const { files } = fixtureArtifacts();
  let mode: "error" | "ready" | "delayed" = "error";
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/data/vehicles/**", async (route) => {
    if (mode === "error") return route.fulfill({ status: 503, body: "offline test" });
    if (mode === "delayed") await delayed;
    await route.fulfill({ contentType: "application/json", body: files[new URL(route.request().url()).pathname] });
  });
  await page.goto("/en/"); await open(page);
  await expect(page.getByRole("alert")).toContainText(messages.en.myFuelError);
  mode = "ready"; await page.getByRole("button", { name: messages.en.myFuelRetry, exact: true }).click();
  await selectVehicle(page); await expect(page.getByTestId("my-fuel-result")).toContainText(messages.en.myFuelVerified);
  mode = "delayed"; await page.getByRole("button", { name: messages.en.myFuelReload }).click();
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  await expect(page.getByText(messages.en.myFuelLoading)).toBeVisible();
  release();
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true })).toHaveValue("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
});

test("late response from a closed session cannot replace a reopened session", async ({ page }) => {
  const { files } = fixtureArtifacts();
  let first = true, release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/data/vehicles/**", async (route) => {
    if (first) { first = false; await delayed; }
    await route.fulfill({ contentType: "application/json", body: files[new URL(route.request().url()).pathname] });
  });
  await page.goto("/en/"); await open(page);
  await expect(page.getByText(messages.en.myFuelLoading)).toBeVisible();
  await expect.poll(() => first).toBe(false);
  await page.keyboard.press("Escape"); await open(page); await selectVehicle(page, "DIESEL");
  release();
  await expect(page.getByTestId("my-fuel-result").getByText("軽油", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: messages.en.myFuelVariant, exact: true }).selectOption("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
});

test("map, list, fuel-price preference, storage and location remain independent", async ({ page, context }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "vehicleTestLocationCalls", { value: 0, writable: true });
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { (window as unknown as { vehicleTestLocationCalls: number }).vehicleTestLocationCalls++; } });
  });
  await fixtures(page); await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await chooseFuels(page, ["DIESEL"]);
  await page.getByRole("button", { name: messages.en.mapList, exact: true }).click();
  await page.locator("#list-mode-nearest").click();
  const map = await page.locator(".leaflet-container").elementHandle();
  const before = await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookie: document.cookie }));
  await open(page); await selectVehicle(page, "REGULAR");
  await expect(page.getByTestId("my-fuel-result")).toContainText("レギュラー");
  await page.keyboard.press("Escape");
  expect(await map!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect(page.locator("#list-mode-nearest")).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage }, url: location.href, cookie: document.cookie }))).toEqual(before);
  expect(await page.evaluate(() => (window as unknown as { vehicleTestLocationCalls: number }).vehicleTestLocationCalls)).toBe(0);
  expect(await context.cookies()).toEqual([]);
  await open(page);
  await expect(page.getByRole("combobox", { name: messages.en.myFuelMake, exact: true })).toHaveValue("");
  await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
});
