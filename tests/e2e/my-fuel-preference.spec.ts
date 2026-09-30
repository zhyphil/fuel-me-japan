import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";

const labels = { en: "Fuel type", "zh-Hant": "用油品類", ko: "유종", "zh-Hans": "用油品类", th: "ประเภทเชื้อเพลิง" };
for (const [locale, label] of Object.entries(labels)) {
  test(`${locale}: manual fuel dropdown updates the map and survives reopening and reload`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    const t = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
    await page.goto(`/${locale}/`);
    await expect(page.locator(".leaflet-container")).toBeVisible();
    const map = await page.locator(".leaflet-container").elementHandle();
    const trigger = page.getByRole("button", { name: t.myFuelTitle, exact: true });
    await trigger.click();
    const select = page.getByRole("dialog").getByRole("combobox", { name: label, exact: true });
    await expect(select).toHaveValue("REGULAR");
    const bounds = await select.boundingBox();
    expect(bounds?.height).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
    expect(await select.locator("option").evaluateAll((options) => options.map((node) => (node as HTMLOptionElement).value))).toEqual(["REGULAR", "HIGH_OCTANE", "DIESEL"]);
    for (const [fuel, japanese] of [["HIGH_OCTANE", "ハイオク"], ["REGULAR", "レギュラー"], ["DIESEL", "軽油"]]) {
      await select.selectOption(fuel);
      await expect(select.locator("option:checked")).toContainText(japanese);
      await expect(page.locator("#display-fuel input:checked")).toHaveCount(1);
      await expect(page.locator(`#display-fuel input[value="${fuel}"]`)).toBeChecked();
      expect(await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe(JSON.stringify([fuel]));
      await expect(page.getByRole("dialog").locator("[role=status], [role=alert]")).toHaveCount(0);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
    expect(await map!.evaluate((node) => node.isConnected)).toBe(true);
    await trigger.click(); await expect(select).toHaveValue("DIESEL");
    await page.keyboard.press("Escape");
    await page.reload();
    await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
    await trigger.click(); await expect(select).toHaveValue("DIESEL");
  });
}

test("manual fuel replaces a multi-selection without resetting region, list mode or requesting location; reset stays in sync", async ({ page }) => {
  const t = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
  await page.addInitScript((key) => {
    localStorage.setItem(key, "DIESEL");
    Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { throw Error("Unexpected location request"); } });
  }, FUEL_PREFERENCE_KEY);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/");
  const trigger = page.getByRole("button", { name: t.myFuelTitle, exact: true });
  await trigger.click(); await expect(page.getByRole("combobox", { name: labels.en, exact: true })).toHaveValue("DIESEL");
  expect(await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe("DIESEL");
  await page.keyboard.press("Escape");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await chooseFuels(page, ["DIESEL", "REGULAR", "HIGH_OCTANE"]);
  await page.getByRole("button", { name: t.mapList, exact: true }).click();
  await page.locator("#list-mode-nearest").click();
  await trigger.click();
  await expect(page.getByRole("combobox", { name: labels.en, exact: true })).toHaveValue("");
  // Choosing the previous primary fuel must also collapse the multi-selection.
  await page.getByRole("combobox", { name: labels.en, exact: true }).selectOption("DIESEL");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(1);
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
  await page.getByRole("combobox", { name: labels.en, exact: true }).selectOption("HIGH_OCTANE");
  await page.keyboard.press("Escape");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(1);
  await expect(page.locator('#display-fuel input[value="HIGH_OCTANE"]')).toBeChecked();
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect(page.locator("#list-mode-nearest")).toHaveAttribute("aria-pressed", "true");
  await chooseFuels(page, ["HIGH_OCTANE", "DIESEL"]);
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(2);
  await page.locator(".map-notes > summary").click();
  await page.getByRole("button", { name: t.fpReset, exact: true }).click();
  await trigger.click(); await expect(page.getByRole("combobox", { name: labels.en, exact: true })).toHaveValue("REGULAR");
  expect(await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBeNull();
  expect(errors).toEqual([]);
});

test("manual fuel works when browser storage is unavailable", async ({ page }) => {
  const t = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { configurable: true, get() { throw Error("Storage blocked"); } }));
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/");
  const trigger = page.getByRole("button", { name: t.myFuelTitle, exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveCount(1);
  await page.getByRole("combobox", { name: labels.en, exact: true }).selectOption("DIESEL");
  await expect(page.getByRole("dialog").locator("[role=status], [role=alert]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
  await trigger.click(); await expect(page.getByRole("combobox", { name: labels.en, exact: true })).toHaveValue("DIESEL");
  expect(errors).toEqual([]);
});
