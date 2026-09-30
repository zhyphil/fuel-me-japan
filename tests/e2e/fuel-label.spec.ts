import { test, expect } from "./offline";

for (const mode of ["mouse", "touch"] as const) {
  test.describe(mode, () => {
    test.use({ viewport: { width: mode === "mouse" ? 1280 : 390, height: 844 }, isMobile: mode === "touch", hasTouch: mode === "touch" });
    test("fuel label text toggles exactly once and never closes its panel", async ({ page }) => {
      await page.goto("/zh-Hans/");
      const panel = page.locator("#display-fuel");
      await panel.locator("summary").click();
      const labels = panel.locator("label");
      const inputs = panel.locator('input[type="checkbox"]');
      const pressAt = async (x: number, y: number) => {
        if (mode === "touch") await page.touchscreen.tap(x, y);
        else {
          await page.mouse.move(x, y);
          await page.mouse.down();
          // Exercise a held label press, before the native click/focus activation.
          await expect(panel).toHaveAttribute("open", "");
          await page.waitForTimeout(150);
          await expect(panel).toHaveAttribute("open", "");
          await page.mouse.up();
        }
        await expect(panel).toHaveAttribute("open", "");
        await expect.poll(() => panel.evaluate(node => node.contains(document.activeElement))).toBe(true);
      };
      const selectText = async (index: number) => {
        const box = await labels.nth(index).boundingBox();
        expect(box).not.toBeNull();
        // Click the text area, not the input that getByLabel/check would target.
        await pressAt(box!.x + box!.width - 24, box!.y + box!.height / 2);
      };
      const help = await panel.locator("p").boundingBox();
      await pressAt(help!.x + help!.width / 2, help!.y + help!.height / 2);
      const group = await panel.locator("fieldset").boundingBox();
      await pressAt(group!.x + 3, group!.y + group!.height / 2);
      await selectText(2);
      await expect(inputs.nth(2)).toBeChecked();
      await expect(panel.locator("input:checked")).toHaveCount(2);
      await selectText(1);
      await expect(panel.locator("input:checked")).toHaveCount(3);
      const all = await panel.getByRole("button").boundingBox();
      await pressAt(all!.x + all!.width / 2, all!.y + all!.height / 2);
      await expect(panel.locator("input:checked")).toHaveCount(3);
      await selectText(0);
      await expect(inputs.nth(0)).not.toBeChecked();
      await selectText(1);
      await expect(panel.locator("input:checked")).toHaveCount(1);
      await expect(inputs.nth(2)).toBeDisabled();
      const last = await inputs.nth(2).boundingBox();
      await pressAt(last!.x + last!.width / 2, last!.y + last!.height / 2);
      await selectText(2);
      await expect(inputs.nth(2)).toBeChecked();
      await selectText(0);
      await expect(panel.locator("input:checked")).toHaveCount(2);
      await page.keyboard.press("Escape");
      await expect(panel).not.toHaveAttribute("open", "");
      await expect(panel.locator("summary")).toBeFocused();
      await expect(page.locator("#find-title")).toBeVisible();
    });
  });
}

test("fuel panel closes when keyboard focus actually leaves, and Escape restores summary focus", async ({ page }) => {
  await page.goto("/en/");
  const panel = page.locator("#display-fuel");
  const summary = panel.locator("summary");
  await summary.click();
  await panel.locator('input[value="DIESEL"]').focus();
  await page.keyboard.press("Tab");
  await expect(panel).not.toHaveAttribute("open", "");
  await summary.click();
  await panel.locator('input[value="DIESEL"]').focus();
  await page.keyboard.press("Escape");
  await expect(panel).not.toHaveAttribute("open", "");
  await expect(summary).toBeFocused();
});
