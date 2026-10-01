import type { Locator } from "@playwright/test";
import { test, expect } from "./offline";
import { rentalFixtures, fixtures, openDetail, naha, locales } from "./rental-fixtures";

async function compactLayout(pagination: Locator) {
  const size = (await pagination.locator("select").boundingBox())!;
  const number = (await pagination.locator('input[name="page"]').boundingBox())!;
  const jump = (await pagination.locator('button[type="submit"]').boundingBox())!;
  expect(Math.abs(size.y - number.y)).toBeLessThan(2);
  expect(Math.abs(number.y - jump.y)).toBeLessThan(2);
  expect(size.x + size.width + 4).toBeLessThanOrEqual(number.x);
  const previous = (await pagination.locator(".rental-page-previous").boundingBox())!;
  const next = (await pagination.locator(".rental-page-next").boundingBox())!;
  const box = (await pagination.boundingBox())!;
  expect(Math.abs(previous.y - next.y)).toBeLessThan(2);
  expect(previous.y).toBeGreaterThanOrEqual(number.y + number.height);
  expect(Math.abs(previous.width - next.width)).toBeLessThan(2);
  expect(box.height).toBeLessThanOrEqual(150);
  for (const control of [size, number, jump, previous, next]) {
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
    expect(control.x).toBeGreaterThanOrEqual(box.x);
    expect(control.x + control.width).toBeLessThanOrEqual(box.x + box.width);
  }
  expect(await pagination.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  return { size, number, previous, next, box };
}

for (const locale of locales) for (const width of [320, 430]) {
  test(`${locale} ${width}px: compact pagination stays aligned on first, middle and last pages`, async ({ page }, info) => {
    await rentalFixtures(page); await page.setViewportSize({ width, height: 740 });
    await page.goto(`/${locale}/return-car/`);
    const pagination = page.locator("#rental-pagination");
    await expect(page.locator(".rental-card")).toHaveCount(25);
    await pagination.scrollIntoViewIfNeeded();
    const initial = await compactLayout(pagination);
    await expect(pagination.locator(".rental-page-previous")).toBeDisabled();
    const number = pagination.locator('input[name="page"]');
    await number.fill("42"); await number.press("Enter");
    await expect(number).toHaveValue("42");
    await expect(page.locator(".rental-cards")).toHaveAttribute("start", "1026");
    const middle = await compactLayout(pagination);
    expect(middle.box.height).toBe(initial.box.height);
    await expect(pagination.locator(".rental-page-previous")).toBeEnabled();
    await expect(pagination.locator(".rental-page-next")).toBeEnabled();
    await number.fill("999999"); await pagination.locator('button[type="submit"]').click();
    await expect(pagination.locator(".rental-page-next")).toBeDisabled();
    const last = await compactLayout(pagination);
    expect(last.box.height).toBe(initial.box.height);
    expect(last.number.width).toBe(initial.number.width);
    await pagination.locator("select").selectOption("100");
    await expect(page.locator(".rental-card")).toHaveCount(100);
    await expect(number).toHaveValue("1");
    await compactLayout(pagination);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("pagination-mobile.png") });
  });
}

for (const width of [320, 430]) test(`shared return-candidate pagination fits ${width}px without hiding controls`, async ({ page }, info) => {
  await fixtures(page); await page.setViewportSize({ width, height: 740 });
  await openDetail(page, naha, "zh-Hans");
  const pagination = page.locator("#return-pagination");
  await pagination.scrollIntoViewIfNeeded(); await compactLayout(pagination);
  await expect(pagination.locator(".rental-page-previous")).toBeDisabled();
  await expect(pagination.locator(".rental-page-next")).toBeDisabled();
  await expect(pagination.locator('input[name="page"]')).toBeDisabled();
  await page.screenshot({ path: info.outputPath("pagination-candidates.png") });
});


test("pagination follows the result column width on desktop", async ({ page }, info) => {
  await rentalFixtures(page);
  for (const width of [1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/zh-Hans/return-car/");
    await expect(page.locator(".rental-card")).toHaveCount(25);
    const pagination = page.locator("#rental-pagination");
    await pagination.scrollIntoViewIfNeeded();
    if (width === 1024) await compactLayout(pagination);
    else {
      const controls = await Promise.all(["select", 'input[name="page"]', 'button[type="submit"]', ".rental-page-previous", ".rental-page-next"].map(selector => pagination.locator(selector).boundingBox()));
      expect(controls.every(box => box && Math.abs(box.y - controls[0]!.y) < 2)).toBe(true);
      expect((await pagination.boundingBox())!.height).toBeLessThan(100);
      expect(await pagination.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`pagination-desktop-${width}.png`) });
  }
});
