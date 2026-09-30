import { test, expect } from "./offline";
import { readFileSync } from "node:fs";
import { chooseFuels } from "./fuel-selection";
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";

test("the map opens a five-step refuelling guide and Escape restores its trigger", async ({ page }) => {
  await page.goto("/en/");
  const trigger = page.getByRole("button", { name: "Refuelling guide", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Refuelling guide", exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("ol > li")).toHaveCount(5);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"]) {
  for (const width of [320, 1280]) {
    test(`${locale} ${width}px: guide labels, safety, source links and accessible return to the same map`, async ({ page, browserName }) => {
      const t = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
      await page.setViewportSize({ width, height: 844 });
      await page.addInitScript(() => {
        Object.defineProperty(navigator.geolocation, "getCurrentPosition", { value: () => { throw Error("Guide requested location"); } });
      });
      const errors: string[] = [];
      const unwantedRequests: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => { if (/\/field-guides\/|\/data\/vehicles\/|fdma\.go\.jp|jaf\.or\.jp/.test(request.url())) unwantedRequests.push(request.url()); });
      await page.goto(`/${locale}/`);
      await expect(page.locator(".leaflet-container")).toBeVisible();
      await expect(page.getByRole("navigation")).toHaveCount(1);
      const map = await page.locator(".leaflet-container").elementHandle();
      const trigger = page.getByRole("button", { name: t.rgTitle, exact: true });
      await trigger.focus(); await trigger.press("Enter");
      const dialog = page.getByRole("dialog", { name: t.rgTitle, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("ol > li")).toHaveCount(5);
      await expect(dialog.getByRole("heading")).toHaveText([t.rgTitle, t.rgStep1Title, t.rgStep2Title, t.rgStep3Title, t.rgStep4Title, t.rgStep5Title, t.rgMisfuelTitle]);
      for (const key of ["rgPreferenceHelp", "rgStep1Body", "rgStep2Body", "rgStep3Body", "rgStep4Body", "rgStep5Body", "rgLightVehicle", "rgMisfuelBody", "rgAttribution"]) {
        await expect(dialog.getByText(t[key], { exact: true })).toBeVisible();
      }
      for (const label of ["レギュラー", "ハイオク", "軽油", "セルフ", "現金", "会員", "満タン"]) await expect(dialog.locator('dt[lang="ja"]').filter({ hasText: label })).toBeVisible();
      await expect(dialog.getByRole("link", { name: t.rgSourceJaf })).toHaveAttribute("href", "https://jaf.or.jp/");
      await expect(dialog.getByRole("link")).toHaveCount(4);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const close = dialog.getByRole("button", { name: t.rgClose });
      const complete = dialog.getByRole("button", { name: t.rgComplete });
      for (const button of [trigger, close, complete]) {
        const box = await button.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
      }
      await close.focus();
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      await expect(dialog.getByRole("link", { name: t.rgSourceSafety })).toBeFocused();
      await complete.focus();
      await page.keyboard.press(browserName === "webkit" ? "Alt+Tab" : "Tab");
      expect(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement?.closest("dialog"))).toBe(true);
      await complete.click();
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      expect(await map!.evaluate((node) => node.isConnected)).toBe(true);
      await trigger.click(); await close.click();
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      expect(unwantedRequests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("guide shows manual and multiple display preferences without changing them or the list", async ({ page }) => {
  const t = JSON.parse(readFileSync("src/locales/en.json", "utf8"));
  await page.goto("/en/");
  await page.getByRole("button", { name: t.myFuelTitle, exact: true }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption("DIESEL");
  await page.keyboard.press("Escape");
  const trigger = page.getByRole("button", { name: t.rgTitle, exact: true });
  await trigger.click();
  const preference = page.locator(".refuel-guide-preference");
  await expect(preference.getByText(t.rgPreference, { exact: true })).toBeVisible();
  await expect(preference.getByRole("listitem")).toHaveText([`${t.ffDiesel} / 軽油`]);
  await page.keyboard.press("Escape");
  await page.locator("#prefecture").selectOption("JP-01");
  await expect(page.locator("#station-search")).toBeVisible();
  await page.getByRole("button", { name: t.mapList, exact: true }).click();
  await page.locator("#station-search").fill("ENEOS");
  await chooseFuels(page, ["REGULAR", "DIESEL", "HIGH_OCTANE"]);
  const before = await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY);
  await trigger.click();
  await expect(preference.getByText(t.rgMultiple, { exact: true })).toBeVisible();
  await expect(preference.getByRole("listitem")).toHaveCount(3);
  await expect(preference.getByText(t.rgPreferenceHelp, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: t.rgComplete }).click();
  await expect(page.locator("#prefecture")).toHaveValue("JP-01");
  await expect(page.locator("#station-search")).toHaveValue("ENEOS");
  await expect(page.getByRole("button", { name: t.mapList, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#display-fuel input:checked")).toHaveCount(3);
  expect(await page.evaluate((key) => localStorage.getItem(key), FUEL_PREFERENCE_KEY)).toBe(before);
});
