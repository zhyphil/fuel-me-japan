import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
const messages = Object.fromEntries(["en", "zh-Hant", "ko", "zh-Hans", "th"].map((locale) => [locale, JSON.parse(readFileSync(`src/locales/${locale}.json`, "utf8"))])) as Record<string, Record<string, string>>;
import { FUEL_PREFERENCE_KEY } from "../../src/lib/fuel-preference";
import { stationBrand } from "../../src/lib/station-brand";
import type { DataManifest, StationFile } from "../../src/lib/stations";
const manifest: DataManifest = JSON.parse(readFileSync("public/data/manifest.json", "utf8"));
const partition = manifest.stations.partitions.find((p) => p.code === "JP-01")!;
const { stations }: StationFile = JSON.parse(readFileSync(`public${partition.path}`, "utf8"));
const en = messages.en;
const unique = (logo: string) => stations.find((s) => stationBrand(s).logo === logo && s.address && stations.filter((other) => other.address?.includes(s.address!)).length === 1)!;

test("explicit enum preference survives language and refresh; reset preserves unrelated storage", async ({ page }) => {
  await page.goto("/en/");
  await expect(page.locator("#display-fuel")).toHaveValue("REGULAR");
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.locator("#display-fuel").selectOption("DIESEL");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ [FUEL_PREFERENCE_KEY]: "DIESEL" });
  await page.locator('.locale-switcher a[lang="zh-Hans"]').click();
  await expect(page.locator("#display-fuel")).toHaveValue("DIESEL");
  await expect(page.locator('#display-fuel option[value="DIESEL"]')).toHaveText(`${messages["zh-Hans"].ffDiesel} / 軽油`);
  await page.reload(); await expect(page.locator("#display-fuel")).toHaveValue("DIESEL");
  await page.evaluate(() => localStorage.setItem("unrelated", "keep"));
  await page.locator(".map-notes > summary").click();
  await page.getByRole("button", { name: messages["zh-Hans"].fpReset, exact: true }).click();
  await expect(page.locator("#display-fuel")).toHaveValue("REGULAR");
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({ unrelated: "keep" });
});

test("real station hides missing price without an empty band; fuel change preserves viewport with no data or location requests", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { __locationRequests: 0 });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: () => { (window as unknown as { __locationRequests: number }).__locationRequests++; } } });
  });
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-01");
  const station = unique("/brands/eneos-symbol.svg");
  expect(station).toBeTruthy();
  await page.locator("#station-search").fill(station.address!);
  const pin = page.locator(`button[data-map-key="${station.id}"]`);
  await expect(pin.locator(".station-price")).toHaveCount(0);
  await expect(pin).not.toHaveAttribute("aria-label", new RegExp(en.fpUnknown));
  expect((await pin.boundingBox())!.height).toBe(94);
  await expect(pin).not.toContainText(/\d+\s*(JPY|円|¥)/);
  const before = await pin.boundingBox();
  const requests: string[] = [];
  page.on("request", (request) => { if (request.url().includes("/data/")) requests.push(request.url()); });
  await page.locator("#display-fuel").selectOption("DIESEL");
  await expect(pin).toHaveAttribute("aria-label", /軽油/);
  expect(await pin.boundingBox()).toEqual(before);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __locationRequests: number }).__locationRequests)).toBe(0);
  await page.locator("#display-fuel").selectOption("REGULAR");
  await pin.focus(); await page.keyboard.press("Enter");
  await expect(page.locator(".selected-fuel-price")).toHaveCount(0);
  await page.keyboard.press("Escape"); await expect(pin).toBeFocused();
  await page.getByRole("button", { name: en.mapList, exact: true }).click();
  await expect(page.locator(".station-card .station-price")).toHaveCount(0);
  const noLogo = stations.find((s) => s.originalBrand && !stationBrand(s).logo && s.address && stations.filter((other) => other.address?.includes(s.address!)).length === 1)!;
  expect(noLogo).toBeTruthy();
  await page.getByRole("button", { name: en.mapView, exact: true }).click();
  await page.locator("#station-search").fill(noLogo.address!);
  const fallback = page.locator(`button[data-map-key="${noLogo.id}"]`);
  await expect(fallback.locator(".map-brand")).toHaveText("");
  await expect(fallback.locator("img")).toHaveAttribute("src", "/brands/fuel-pump.svg");
  await expect.poll(() => fallback.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
});

for (const logo of ["/brands/eneos-symbol.svg", "/brands/cosmo-symbol.svg"]) {
  test(`local brand asset ${logo} loads and failed image falls back to a pump icon at 320px`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 844 });
    await page.goto("/en/");
    await page.locator("#prefecture").selectOption("JP-01");
    const station = unique(logo); expect(station).toBeTruthy();
    await page.locator("#station-search").fill(station.address!);
    const pin = page.locator(`button[data-map-key="${station.id}"]`);
    await expect(pin).toBeVisible();
    await expect.poll(() => pin.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await pin.locator("img").getAttribute("src")).toBe(logo);
    await expect(pin.locator(".map-brand")).toHaveText("");
    const ratio = await pin.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth / img.naturalHeight);
    expect(ratio).toBeGreaterThan(0.98); expect(ratio).toBeLessThan(1.02);
    const logoFits = await pin.locator("img").evaluate((img) => {
      const image = img.getBoundingClientRect();
      const frame = img.parentElement!.getBoundingClientRect();
      return image.left >= frame.left && image.right <= frame.right && image.top >= frame.top && image.bottom <= frame.bottom;
    });
    expect(logoFits, "The complete brand logo must fit inside its marker without cropping").toBe(true);
    const brandAboveShape = await pin.evaluate((button) => {
      const brand = getComputedStyle(button.querySelector(".map-brand")!);
      const shape = getComputedStyle(button.querySelector(".map-pin-shape")!);
      return Number(brand.zIndex) > Number(shape.zIndex);
    });
    expect(brandAboveShape, "The droplet background must not cover its brand").toBe(true);
    await page.route(`**${logo}`, (route) => route.abort());
    await page.reload();
    await page.locator("#prefecture").selectOption("JP-01");
    await page.locator("#station-search").fill(station.address!);
    await expect(pin.locator(".map-brand")).toHaveText("");
    await expect(pin.locator("img")).toHaveAttribute("src", "/brands/fuel-pump.svg");
    await expect.poll(() => pin.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await pin.focus(); await page.keyboard.press("Enter");
    await expect(page.locator("#station-title")).toBeFocused();
    await expect(page.locator(".selected-fuel-price")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("invalid and blocked storage keep selection usable without auto-location", async ({ page }) => {
  await page.addInitScript((key) => localStorage.setItem(key, "invalid"), FUEL_PREFERENCE_KEY);
  await page.goto("/en/"); await expect(page.locator("#display-fuel")).toHaveValue("REGULAR");
  await page.evaluate(() => Object.defineProperty(window, "localStorage", { configurable: true, get() { throw Error("blocked"); } }));
  await page.locator("#display-fuel").selectOption("HIGH_OCTANE");
  await expect(page.locator("#display-fuel")).toHaveValue("HIGH_OCTANE");
  await page.locator(".map-notes > summary").click();
  await page.getByRole("button", { name: en.fpReset, exact: true }).click();
  await expect(page.locator("#display-fuel")).toHaveValue("REGULAR");
});
