import { test, expect } from "./offline";
import { fixtures, rentalFixtures, stationFixtures, stationRow, naha, openDetail, messages, observations, storageSnapshot, watchPageErrors } from "./rental-fixtures";

const rows = Array.from({ length: 113 }, (_, i) => stationRow(1000 + i, { lat: naha.lat + (i + 1) * .0005, lon: naha.lon }));

test("return candidates paginate all nearby stations with direct page entry and preserve explicit selection", async ({ page }) => {
  await rentalFixtures(page); await stationFixtures(page, { rows }); await page.setViewportSize({ width: 1280, height: 900 });
  const errors = watchPageErrors(page); const detail = await openDetail(page);
  const cards = detail.locator(".return-candidates > li"); const size = detail.locator("#return-page-size"); const number = detail.locator("#return-page-number");
  await expect(cards).toHaveCount(25); await expect(size).toHaveValue("25");
  await expect(size.locator("option")).toHaveText(["10", "25", "50", "100"]);
  const storage = await storageSnapshot(page);
  const initialHeight = await detail.locator(".return-candidate-browser").evaluate(node => node.getBoundingClientRect().height);
  await number.fill("5"); await number.press("Enter");
  await expect(cards).toHaveCount(13); await expect(cards.first()).toHaveAttribute("data-return-station-id", rows[100].id);
  await expect(number).toHaveValue("5"); await expect(number).toBeFocused();
  const map = detail.getByTestId("return-candidate-map");
  await expect.poll(() => map.locator("[data-map-key]").evaluateAll(nodes => nodes.flatMap(node => {
    const key = node.getAttribute("data-map-key")!;
    return key.startsWith("return-stations:") ? JSON.parse(key.slice("return-stations:".length)) as string[] : [key];
  }).sort())).toEqual(rows.slice(100).map(row => row.id).sort());
  await cards.first().getByRole("button", { name: `${messages.en.rcSelect}: ${rows[100].name}`, exact: true }).click();
  await expect(detail.getByText(messages.en.rcStep1, { exact: true })).toBeFocused();
  await expect(detail.getByTestId("return-candidate-map")).toHaveCount(0);
  await detail.getByRole("button", { name: messages.en.rcReselect, exact: true }).click();
  await expect(number).toHaveValue("5"); await expect(cards.first()).toHaveAttribute("data-return-station-id", rows[100].id);
  await size.selectOption("10"); await expect(number).toHaveValue("1"); await expect(cards).toHaveCount(10);
  for (const [input, expected] of [["999", "12"], ["0", "1"], ["abc", "1"]]) {
    await number.fill(input); await number.press("Enter"); await expect(number).toHaveValue(expected);
  }
  await size.selectOption("50"); await expect(cards).toHaveCount(50);
  await size.selectOption("100"); await expect(cards).toHaveCount(100);
  const list = detail.locator("#return-results-scroll");
  await list.evaluate(node => { node.scrollTop = 300; });
  await detail.locator("#return-pagination").getByRole("button", { name: messages.en.rdNext, exact: true }).click();
  await expect(cards).toHaveCount(13); await expect.poll(() => list.evaluate(node => node.scrollTop)).toBe(0);
  expect(await detail.locator(".return-candidate-browser").evaluate(node => node.getBoundingClientRect().height)).toBeCloseTo(initialHeight, 0);
  expect(await storageSnapshot(page)).toEqual(storage); expect((await observations(page)).geolocationCalls).toBe(0); expect(errors).toEqual([]);
});

test("candidate hover and keyboard focus preview the right map without changing the upper map or selecting a station", async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width: 1280, height: 900 }); const detail = await openDetail(page);
  const cards = detail.locator(".return-candidates > li"); const map = detail.getByTestId("return-candidate-map");
  await expect(map.locator(".map-pin").first()).toBeAttached();
  const upper = await detail.locator(".rental-detail-layout .leaflet-map-pane").getAttribute("style");
  const marker = map.locator('[data-map-key="osm:node:3"]');
  await cards.nth(1).hover(); await expect(marker).toHaveAttribute("aria-pressed", "true");
  const instance = await map.elementHandle();
  const centered = async () => marker.evaluate(node => {
    const pin = node.getBoundingClientRect(), canvas = node.closest(".return-map-surface")!.getBoundingClientRect();
    return Math.abs(pin.x + pin.width / 2 - canvas.x - canvas.width / 2) < 3 && Math.abs(pin.y + pin.height / 2 - canvas.y - canvas.height / 2) < 3;
  });
  await expect.poll(centered).toBe(true);
  await cards.nth(2).focus(); await expect(map.locator('[data-map-key="osm:node:4"]')).toHaveAttribute("aria-pressed", "true");
  await cards.first().dispatchEvent("pointerover", { pointerType: "touch" });
  await expect(map.locator('[data-map-key="osm:node:4"]')).toHaveAttribute("aria-pressed", "true");
  await cards.first().dispatchEvent("pointerover", { pointerType: "mouse" });
  await cards.nth(1).dispatchEvent("pointerover", { pointerType: "mouse" });
  await expect(marker).toHaveAttribute("aria-pressed", "true"); await expect.poll(centered).toBe(true);
  expect(await instance!.evaluate(node => node.isConnected)).toBe(true);
  await expect.poll(() => map.locator("img.leaflet-tile").evaluateAll(nodes => nodes.some(node => /\/16\//.test((node as HTMLImageElement).src)))).toBe(true);
  expect(await detail.locator(".rental-detail-layout .leaflet-map-pane").getAttribute("style")).toBe(upper);
  await marker.click(); await expect(cards.nth(1)).toBeFocused(); await expect(detail.locator(".return-navigation")).toHaveCount(0);
  await detail.locator("#return-fuel").selectOption("DIESEL");
  await expect(map.locator('[data-map-key="osm:node:3"]')).toHaveCount(0);
  await expect(map.locator('[aria-pressed="true"]')).toHaveCount(0);
  await detail.getByRole("button", { name: messages.en.rdCancelSearch, exact: true }).click();
  await expect(map).toHaveCount(0);
});

for (const width of [320, 390, 768, 1280]) test(`return browser columns align and fit ${width}px`, async ({ page }) => {
  await fixtures(page); await page.setViewportSize({ width, height: 900 }); const detail = await openDetail(page, naha, "zh-Hans");
  await expect(detail.locator(".return-candidates > li")).toHaveCount(3);
  const boxes = await detail.evaluate(node => {
    const rect = (selector: string) => { const r = node.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, width: r.width, y: r.y, height: r.height }; };
    return { upperLeft: rect(".rental-detail-layout > :first-child"), upperRight: rect(".rental-detail-info"), list: rect(".return-candidate-results"), map: rect(".return-candidate-map"), fits: node.scrollWidth <= node.clientWidth };
  });
  expect(boxes.fits).toBe(true); expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width > 740) {
    expect(boxes.list.x).toBeCloseTo(boxes.upperLeft.x, 0); expect(boxes.list.width).toBeCloseTo(boxes.upperLeft.width, 0);
    expect(boxes.map.x).toBeCloseTo(boxes.upperRight.x, 0); expect(boxes.map.width).toBeCloseTo(boxes.upperRight.width, 0);
    expect(boxes.map.height).toBeCloseTo(boxes.list.height, 0);
  } else {
    expect(boxes.list.width).toBeCloseTo(boxes.map.width, 0); expect(boxes.map.y).toBeLessThan(boxes.list.y);
  }
  const panel = detail.locator("#return-results-scroll"); await panel.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(detail.locator("#return-page-size")).toBeVisible();
});
