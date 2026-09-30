import { readFileSync } from "node:fs";
import { test, expect } from "./offline";

const locales = ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const;

for (const locale of locales) {
  for (const width of [320, 1280]) {
    test(`${locale} ${width}px: manual-only fuel, Japanese labels and no vehicle requests`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 844 });
      const t = JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"));
      const requests: string[] = [];
      const errors: string[] = [];
      page.on("request", (request) => { if (request.url().includes("/data/vehicles/")) requests.push(request.url()); });
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(`/${locale}/`);
      await expect(page.locator(".leaflet-container")).toBeVisible();
      expect(requests).toEqual([]);
      const trigger = page.getByRole("button", { name: t.myFuelTitle, exact: true });
      await trigger.focus(); await trigger.press("Enter");
      const dialog = page.getByRole("dialog");
      const select = dialog.getByRole("combobox", { name: t.myFuelPreference, exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("combobox")).toHaveCount(1);
      await expect(select).toHaveValue("REGULAR");
      await expect(dialog.getByText(t.myFuelGuidance, { exact: true })).toBeVisible();
      await expect(dialog.getByText(t.myFuelPreferenceHelp, { exact: true })).toBeVisible();
      for (const label of ["レギュラー", "ハイオク", "軽油"]) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
      // The manual panel has no vehicle form, loading/error/empty state, or verification result.
      await expect.soft(dialog.getByRole("heading")).toHaveText([t.myFuelTitle, t.myFuelLabels]);
      await expect.soft(dialog.locator("form, [role=status], [role=alert]")).toHaveCount(0);
      expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const close = dialog.getByRole("button", { name: t.myFuelClose });
      await close.focus();
      await page.keyboard.press("Tab");
      await expect(select).toBeFocused();
      await page.keyboard.press("Tab");
      // Native dialog focus may visit browser chrome, but never the inert map.
      const boundary = await page.evaluate(() => document.activeElement === document.body ? "browser" : document.activeElement?.closest("dialog") ? "dialog" : "background");
      expect(boundary).not.toBe("background");
      await page.screenshot({ path: testInfo.outputPath(`my-fuel-${locale}-${width}.png`) });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
      await trigger.click(); await expect(select).toHaveValue("REGULAR");
      await close.click(); await expect(trigger).toBeFocused();
      expect(requests).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
