import { mkdirSync } from "node:fs";
import type { Page } from "@playwright/test";
import { test, expect } from "./offline";
import { messages, rentalFixtures, rentalManifest, watchPageErrors } from "./rental-fixtures";

function gate() { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
const frameSelectors = [".rental-intro", ".rental-filters", "#rental-region", "#rental-company", "#rental-query", ".rental-query-actions", ".rental-counters"];
async function frame(page: Page) {
  return Promise.all(frameSelectors.map(async selector => {
    const box = await page.locator(selector).boundingBox(); expect(box, selector).not.toBeNull();
    // Compare document positions: clicking a retry button may scroll it into view.
    const scroll = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
    return { ...box!, x: box!.x + scroll.x, y: box!.y + scroll.y };
  }));
}
async function stableFrame(page: Page, before: Awaited<ReturnType<typeof frame>>) {
  const after = await frame(page);
  after.forEach((box, i) => { for (const key of ["x", "y", "width", "height"] as const) expect(Math.abs(box[key] - before[i][key]), `${frameSelectors[i]} ${key}`).toBeLessThan(1); });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const locale of ["en", "zh-Hant", "ko", "zh-Hans", "th"] as const) for (const width of [390, 1280]) test(`${locale}: ${width}px rental header and search stay stable through static, code and data loading`, async ({ page }, info) => {
  await rentalFixtures(page); await page.setViewportSize({ width, height: 844 });
  const entry = gate(), chunk = gate(), index = gate();
  const chunkSeen = gate(), indexSeen = gate(); const errors = watchPageErrors(page); const t = messages[locale];
  await page.route(/\/assets\/index-[^/]+\.js$/, async route => { await entry.promise; await route.fallback(); });
  await page.route(/\/assets\/RentalBusiness-[^/]+\.js$/, async route => { chunkSeen.release(); await chunk.promise; await route.fallback(); });
  await page.route(`**${rentalManifest.index.url}`, async route => { indexSeen.release(); await index.promise; await route.fallback(); });
  try {
    await page.goto(`/${locale}/return-car/`, { waitUntil: "commit" });
    await expect(page.locator(".rental-filters")).toBeVisible();
    await expect(page.locator(".rental-intro")).toContainText(t.rdEyebrow);
    await expect(page.locator(".rental-intro")).toContainText(t.rdCandidateHelp);
    await expect(page.locator(".rental-loading-spinner")).toBeVisible();
    await expect(page.getByText(t.rdLoadingPlaceholder, { exact: true })).toBeVisible();
    const before = await frame(page);
    for (const selector of ["#rental-region", "#rental-company", "#rental-query", ".rental-counters input"]) await expect(page.locator(selector)).toBeDisabled();
    await expect(page.getByRole("button", { name: t.rdSearch, exact: true })).toBeDisabled();
    await expect(page.getByRole("link", { name: t.rdReset, exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(page.locator(".rental-results-count")).not.toHaveText(t.rdResults.replace("{count}", "0"));
    entry.release(); await chunkSeen.promise;
    await stableFrame(page, before);
    await expect(page.locator(".rental-loading-spinner")).toBeVisible();
    chunk.release(); await indexSeen.promise;
    await stableFrame(page, before);
    await expect(page.getByText(t.rdLoadingPlaceholder, { exact: true })).toBeVisible();
    const evidence = `reports/evidence/rental-loading/${info.project.name || "chromium"}`;
    mkdirSync(evidence, { recursive: true });
    await page.screenshot({ path: `${evidence}/loading-${locale}-${width}.png`, fullPage: true, scale: "css" });
    index.release();
    await expect(page.locator(".rental-card")).toHaveCount(25);
    await expect(page.locator(".rental-loading-spinner")).toHaveCount(0);
    await expect(page.locator("#rental-query")).toBeEnabled();
    await stableFrame(page, before);
    await page.locator("#rental-query").fill("no-rental-with-this-name-999999");
    await page.getByRole("button", { name: t.rdSearch, exact: true }).click();
    await expect(page.locator(".rental-results-count")).toHaveText(t.rdResults.replace("{count}", "0"));
    await expect(page.getByText(t.rdEmpty, { exact: true })).toBeVisible();
    await expect(page.locator(".rental-loading-spinner")).toHaveCount(0);
    await expect(page.getByText(t.rdLoadingPlaceholder, { exact: true })).toHaveCount(0);
    await stableFrame(page, before);
    await page.screenshot({ path: `${evidence}/empty-${locale}-${width}.png`, fullPage: true, scale: "css" });
    expect(errors).toEqual([]);
  } finally { entry.release(); chunk.release(); index.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("directory load failure and retry keep the search frame and never claim zero matches", async ({ page }) => {
  await rentalFixtures(page); await page.setViewportSize({ width: 1280, height: 844 });
  let fail = true; const retry = gate(), retrySeen = gate(); const t = messages.en;
  await page.route(`**${rentalManifest.index.url}`, async route => {
    if (fail) return route.fulfill({ status: 503, body: "Offline failure" });
    retrySeen.release(); await retry.promise; await route.fallback();
  });
  try {
    await page.goto("/en/return-car/?region=JP-47&company=times&q=OKA");
    await expect(page.getByRole("alert")).toContainText(t.rcError);
    await expect(page.locator(".rental-filters")).toBeVisible();
    const before = await frame(page);
    await expect(page.locator("#rental-region")).toHaveValue("JP-47");
    await expect(page.locator("#rental-query")).toHaveValue("OKA");
    await expect(page.getByText(t.rdEmpty, { exact: true })).toHaveCount(0);
    await expect(page.locator(".rental-results-count")).not.toHaveText(t.rdResults.replace("{count}", "0"));
    fail = false; await page.getByRole("button", { name: t.ffRetry, exact: true }).click(); await retrySeen.promise;
    await expect(page.locator(".rental-loading-spinner")).toBeVisible(); await stableFrame(page, before);
    retry.release(); await expect(page.locator(".rental-card")).toHaveCount(1);
    await expect(page.locator("#rental-company")).toHaveValue("times");
    await stableFrame(page, before);
  } finally { retry.release(); await page.unrouteAll({ behavior: "wait" }); }
});

test("reduced motion keeps the loading symbol visible without animation", async ({ page }) => {
  await rentalFixtures(page); await page.emulateMedia({ reducedMotion: "reduce" });
  const index = gate(); await page.route(`**${rentalManifest.index.url}`, async route => { await index.promise; await route.fallback(); });
  try {
    await page.goto("/en/return-car/");
    await expect(page.locator(".rental-loading-spinner")).toBeVisible();
    expect(await page.locator(".rental-loading-spinner").evaluate(node => getComputedStyle(node).animationName)).toBe("none");
  } finally { index.release(); await page.unrouteAll({ behavior: "wait" }); }
});
