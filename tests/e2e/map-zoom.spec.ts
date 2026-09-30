import { test, expect } from "./offline";
import type { Page } from "@playwright/test";

async function tileZoom(page: Page) {
  return page.locator(".leaflet-tile-container").evaluateAll((containers) => {
    for (const container of containers) {
      const image = container.querySelector<HTMLImageElement>("img.leaflet-tile");
      const level = image?.src.match(/\/(\d+)\/\d+\/\d+\.png$/)?.[1];
      if (level) {
        const matrix = new DOMMatrix(getComputedStyle(container).transform);
        return Number(level) + Math.log2(Math.hypot(matrix.a, matrix.b));
      }
    }
    return null;
  });
}
async function settle(page: Page) {
  // Wait for transforms to stop changing over consecutive animation frames.
  await page.evaluate(() => new Promise<void>((resolve, reject) => {
    const started = performance.now(); let previous = ""; let stable = 0;
    function sample() {
      const state = [...document.querySelectorAll(".leaflet-map-pane, .leaflet-tile-container")].map((el) => getComputedStyle(el).transform).join("|");
      stable = state === previous && !document.querySelector(".leaflet-zoom-anim") ? stable + 1 : 0;
      previous = state;
      if (stable >= 12) resolve();
      else if (performance.now() - started > 5000) reject(new Error("Map did not settle"));
      else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
}
async function load(page: Page) {
  await page.goto("/en/");
  await page.locator("#prefecture").selectOption("JP-13");
  await expect(page.locator(".map-status p")).toHaveText("818 matching records");
  await expect(page.locator(".map-pin").first()).toBeVisible();
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeAttached();
  await settle(page);
}

test("a second wheel pulse during animation is retained instead of swallowed", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await load(page);
  const surface = page.locator(".map-surface");
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const initial = (await tileZoom(page))!;
  await page.mouse.wheel(0, -60);
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await settle(page);
  const singleDelta = (await tileZoom(page))! - initial;
  await load(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const pairedInitial = (await tileZoom(page))!;
  await page.mouse.wheel(0, -60);
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await page.mouse.wheel(0, -60);
  await settle(page);
  const pairDelta = (await tileZoom(page))! - pairedInitial;
  const evidence = { initial, singleDelta, pairDelta, note: "固定视口与东京818条真实记录；离线瓦片；第二次等量输入发生在第一次动画中。" };
  await testInfo.attach("wheel-input", { body: JSON.stringify(evidence), contentType: "application/json" });
  console.log("ZOOM_WHEEL_EVIDENCE", JSON.stringify(evidence));
  expect(singleDelta).toBeGreaterThan(0);
  expect(pairDelta).toBeGreaterThan(singleDelta * 1.5);
});

test("small map pans retain existing marker elements instead of rebuilding the layer", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await load(page);
  await page.evaluate(() => {
    const markers = [...document.querySelectorAll<HTMLElement>(".fuel-marker")];
    const baseline = new Map(markers.map((el) => [el.querySelector<HTMLElement>("[data-map-key]")!.dataset.mapKey, el]));
    const counts = { added: 0, removed: 0 };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        counts.added += [...record.addedNodes].filter((el) => el instanceof Element && el.matches(".fuel-marker")).length;
        counts.removed += [...record.removedNodes].filter((el) => el instanceof Element && el.matches(".fuel-marker")).length;
      }
    });
    observer.observe(document.querySelector(".leaflet-marker-pane")!, { childList: true });
    Object.assign(window, { __mapProbe: { baseline, counts, observer } });
  });
  await page.locator(".map-surface").press("ArrowRight");
  await settle(page);
  const evidence = await page.evaluate(() => {
    const probe = (window as unknown as { __mapProbe: { baseline: Map<string, HTMLElement>; counts: { added: number; removed: number }; observer: MutationObserver } }).__mapProbe;
    probe.observer.disconnect();
    const current = [...document.querySelectorAll<HTMLElement>(".fuel-marker")];
    const comparable = current.filter((el) => probe.baseline.has(el.querySelector<HTMLElement>("[data-map-key]")!.dataset.mapKey!));
    const retained = comparable.filter((el) => probe.baseline.get(el.querySelector<HTMLElement>("[data-map-key]")!.dataset.mapKey!) === el).length;
    return { ...probe.counts, before: probe.baseline.size, after: current.length, comparable: comparable.length, retained, note: "相同地图标记身份在一次键盘平移后是否保留同一DOM元素。" };
  });
  await testInfo.attach("marker-reuse", { body: JSON.stringify(evidence), contentType: "application/json" });
  console.log("ZOOM_MARKER_EVIDENCE", JSON.stringify(evidence));
  expect(evidence.comparable).toBeGreaterThan(0);
  expect(evidence.retained).toBe(evidence.comparable);
});

test("rapid zoom buttons retain each click and queued reverse input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await load(page);
  const initial = (await tileZoom(page))!;
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  await zoomIn.press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await zoomIn.press("Enter"); await zoomIn.press("Enter");
  await settle(page);
  expect((await tileZoom(page))! - initial).toBeCloseTo(3, 3);
  const beforeReverse = (await tileZoom(page))!;
  await zoomIn.press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await zoomOut.press("Enter");
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(beforeReverse, 3);
});

test("reversing the wheel during its animation cancels the previous equal input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await load(page);
  const box = (await page.locator(".map-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const initial = (await tileZoom(page))!;
  await page.mouse.wheel(0, -60);
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await page.mouse.wheel(0, 60);
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(initial, 3);
});

test("returning to overview during zoom discards queued wheel input", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await load(page);
  await page.getByRole("button", { name: "Japan overview", exact: true }).click();
  await settle(page);
  const overviewZoom = (await tileZoom(page))!;
  await page.locator("#prefecture").selectOption("JP-13");
  await expect(page.locator(".map-status p")).toHaveText("818 matching records");
  await settle(page);
  const box = (await page.locator(".map-surface").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -60);
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await page.mouse.wheel(0, -60);
  await page.getByRole("button", { name: "Japan overview", exact: true }).click();
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(overviewZoom, 3);
  await expect(page.locator(".map-pin-station, .map-pin-cluster")).toHaveCount(0);
  await expect(page.locator("#prefecture")).toHaveValue("");
});

test("cluster zoom respects reduced motion and updates that preference without reloading", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1280, height: 900 }); await load(page);
  const initial = (await tileZoom(page))!;
  await page.evaluate(() => {
    const probe = { sawAnimation: false };
    const observer = new MutationObserver((records) => {
      probe.sawAnimation ||= records.some((r) => r.oldValue?.includes("leaflet-zoom-anim")) || Boolean(document.querySelector(".leaflet-zoom-anim"));
    });
    observer.observe(document.querySelector(".leaflet-map-pane")!, { attributes: true, attributeFilter: ["class"], attributeOldValue: true });
    Object.assign(window, { __motionProbe: { probe, observer } });
  });
  const groups = await page.locator(".map-pin-cluster").allTextContents();
  const largest = groups.map((text, index) => ({ index, size: Number(text.replaceAll(",", "")) })).sort((a, b) => b.size - a.size)[0];
  await page.locator(".map-pin-cluster").nth(largest.index).press("Enter");
  await settle(page);
  expect((await tileZoom(page))! - initial).toBeCloseTo(2, 3);
  const sawAnimation = await page.evaluate(() => {
    const { probe, observer } = (window as unknown as { __motionProbe: { probe: { sawAnimation: boolean }; observer: MutationObserver } }).__motionProbe;
    observer.disconnect(); return probe.sawAnimation;
  });
  expect(sawAnimation).toBe(false);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "Zoom in", exact: true }).press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await settle(page);
});

test("native two-finger pinch still zooms the mobile map", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await load(page);
  const box = (await page.locator(".map-surface").boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  const initial = (await tileZoom(page))!;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x - 25, y, id: 1 }, { x: x + 25, y, id: 2 }] });
  for (const spread of [35, 45, 55, 65, 75]) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - spread, y, id: 1 }, { x: x + spread, y, id: 2 }] });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await settle(page);
  expect((await tileZoom(page))! - initial).toBeGreaterThan(0.5);
  await expect(page.locator(".map-status p")).toHaveText("818 matching records");
  await cdp.detach();
});

test("queued controls clamp at both zoom limits and can reverse away from them", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 }); await load(page);
  const zoomIn = page.getByRole("button", { name: "Zoom in", exact: true });
  const zoomOut = page.getByRole("button", { name: "Zoom out", exact: true });
  for (let index = 0; index < 20; index++) await zoomIn.press("Enter");
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(19, 3);
  await expect(zoomIn).toHaveAttribute("aria-disabled", "true");
  await zoomOut.press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await zoomIn.press("Enter"); await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(19, 3);
  for (let index = 0; index < 22; index++) await zoomOut.press("Enter");
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(2, 3);
  await expect(zoomOut).toHaveAttribute("aria-disabled", "true");
  await zoomIn.press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await zoomOut.press("Enter"); await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(2, 3);
  await zoomIn.press("Enter"); await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(3, 3);
});


test("an old cluster cannot override returning to overview during animation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/");
  await expect(page.locator(".map-pin-region-group").first()).toBeVisible();
  await settle(page);
  const overviewZoom = (await tileZoom(page))!;
  await load(page);
  const cluster = page.locator(".map-pin-cluster").first();
  await cluster.press("Enter");
  await expect(page.locator(".leaflet-zoom-anim")).toBeAttached();
  await page.getByRole("button", { name: "Japan overview", exact: true }).press("Enter");
  // The old button is still mounted until the in-flight animation finishes.
  await cluster.press("Enter");
  await settle(page);
  expect(await tileZoom(page)).toBeCloseTo(overviewZoom, 3);
  await expect(page.locator(".map-pin-station, .map-pin-cluster")).toHaveCount(0);
  await expect(page.locator(".map-pin-region, .map-pin-region-group").first()).toBeVisible();
});
