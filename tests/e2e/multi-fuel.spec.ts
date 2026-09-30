import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";
import type { FuelType } from "../../src/lib/stations";
const fuels: FuelType[] = ["REGULAR", "HIGH_OCTANE", "DIESEL"];

for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"]) {
  test(`all seven fuel combinations remain usable at 320px in ${locale}`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto(`/${locale}/`);
    const t = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
    for (let mask = 1; mask < 8; mask++) {
      const wanted = fuels.filter((_, index) => mask & (1 << index));
      await chooseFuels(page, wanted);
      const checked = page.locator("#display-fuel input:checked");
      await expect(checked).toHaveCount(wanted.length);
      for (const fuel of wanted) await expect(page.locator(`#display-fuel input[value="${fuel}"]`)).toBeChecked();
      expect(JSON.parse((await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)) ?? '["REGULAR"]')).toEqual(expect.arrayContaining(wanted));
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator("#display-fuel summary").click();
    await expect(page.getByRole("button", { name: t.mfSelectAll, exact: true })).toBeDisabled();
    await chooseFuels(page, ["DIESEL"]);
    await page.locator("#display-fuel summary").click();
    await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeDisabled();
    await page.getByRole("button", { name: t.mfSelectAll, exact: true }).click();
    await expect(page.locator("#display-fuel input:checked")).toHaveCount(3);
    await expect(page.locator("#display-fuel summary")).toContainText(t.mfAll);
    await page.locator("#display-fuel summary").press("Escape");
    await expect(page.locator("#display-fuel summary")).toBeFocused();
    await expect(page.locator("#display-fuel")).not.toHaveAttribute("open", "");
    await page.reload();
    await expect(page.locator("#display-fuel input:checked")).toHaveCount(3);
  });
}

test("old diesel preference migrates without a write, multiple fuels survive locale switch and ranking always belongs to the selection", async ({ page }) => {
  await page.addInitScript((key) => {
    if (!sessionStorage.getItem("seeded-fuels")) { localStorage.setItem(key, "DIESEL"); sessionStorage.setItem("seeded-fuels", "yes"); }
  }, FUEL_PREFERENCE_KEY);
  await page.goto("/en/");
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
  expect(await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe("DIESEL");
  await chooseFuels(page, ["DIESEL", "REGULAR"]);
  await page.locator("#prefecture").selectOption("JP-01");
  await page.getByRole("button", { name: "List", exact: true }).click();
  await expect(page.locator("#price-sort-fuel")).toHaveValue("DIESEL");
  await page.locator("#price-sort-fuel").selectOption("REGULAR");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(2);
  await chooseFuels(page, ["DIESEL", "HIGH_OCTANE"]);
  await expect(page.locator("#price-sort-fuel")).toHaveValue("DIESEL");
  await expect(page.locator('.station-card .station-price, .map-pin-station .station-price')).toHaveCount(0);
  await page.locator(".locale-trigger").click();
  await page.locator('.locale-switcher a[lang="zh-Hans"]').click();
  await expect(page.locator('#display-fuel input[value="DIESEL"]')).toBeChecked();
  await expect(page.locator('#display-fuel input[value="HIGH_OCTANE"]')).toBeChecked();
  await expect(page.locator('#display-fuel input[value="REGULAR"]')).not.toBeChecked();
});

test("checkboxes support keyboard interaction and close on outside click", async ({ page }) => {
  await page.goto("/en/");
  const summary = page.locator("#display-fuel summary");
  await summary.focus(); await page.keyboard.press("Enter");
  await page.locator('#display-fuel input[value="DIESEL"]').focus(); await page.keyboard.press("Space");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(2);
  await page.locator("#find-title").click();
  await expect(page.locator("#display-fuel")).not.toHaveAttribute("open", "");
});
