import { mkdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { test, expect } from "./offline";

// Exercise the real marker renderer with test-only prices, without touching
// production STATION_QUOTES or requesting any map tiles.
test("three price bands fit a compact map and changing their count preserves the coordinate, DOM and focus", async ({ page }) => {
  await page.route("**/multi-fuel-marker-fixture", (route) => route.fulfill({ contentType: "text/html", body: '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div class="map-workspace has-drawer has-price-stack" style="width:320px;height:400px"><div class="map-stage"><div class="fuel-map"><div id="fixture-map" class="map-surface"></div><div class="map-attribution"><a href="/">Map attribution</a></div></div></div><aside class="map-detail-panel">Test-only station detail</aside></div><button id="change-count">Change price count</button></body></html>' }));
  await page.goto("/multi-fuel-marker-fixture");
  await page.addStyleTag({ content: readFileSync("node_modules/leaflet/dist/leaflet.css", "utf8") + readFileSync("src/styles.css", "utf8") });
  await page.addScriptTag({ content: readFileSync("node_modules/leaflet/dist/leaflet.js", "utf8") });
  await page.addScriptTag({ type: "module", content: stripTypeScriptTypes(readFileSync("src/lib/map-markers.ts", "utf8")) + `
    const surface = document.getElementById("fixture-map");
    const map = L.map(surface, { zoomControl: false, attributionControl: false }).setView([35,139], 16);
    const center = map.project([35,139], 16).subtract([0, stationMarkerHeight(3) / 2]);
    map.setView(map.unproject(center, 16), 16, { animate: false });
    const markers = createMapMarkers(L, L.layerGroup().addTo(map), surface);
    const prices = [{ fuel: "REGULAR", text: "普通 180 円/L", tone: "high" }, { fuel: "HIGH_OCTANE", text: "高辛烷 195 円/L", tone: "medium" }, { fuel: "DIESEL", text: "柴油 130 円/L", tone: "low" }];
    const draw = (count) => markers.update([{ key: "station:fixture", dataKey: "fixture", ids: ["fixture"], lat: 35, lon: 139, text: "", label: "Test-only station", className: "map-pin-station", selected: false, station: { logo: "/brands/eneos-symbol.svg", prices: prices.slice(0, count) }, onClick() {} }]);
    document.getElementById("change-count").onclick = (event) => draw(Number(event.currentTarget.dataset.count));
    draw(3);
  ` });
  const pin = page.locator('[data-map-key="fixture"]');
  await expect(pin.locator(".station-price")).toHaveCount(3);
  const mapBox = (await page.locator("#fixture-map").boundingBox())!;
  expect(mapBox.height).toBeGreaterThanOrEqual(164);
  const before = (await pin.boundingBox())!;
  expect(before.height).toBeCloseTo(146, 2);
  expect(before.y).toBeGreaterThanOrEqual(mapBox.y);
  expect(before.y + before.height).toBeLessThanOrEqual(mapBox.y + mapBox.height);
  const logo = (await pin.locator(".map-brand").boundingBox())!;
  const bands = await pin.locator(".station-price").all();
  for (let index = 0; index < bands.length; index++) {
    const band = (await bands[index].boundingBox())!;
    expect(band.y + band.height).toBeLessThan(before.y + before.height);
    expect(band.height).toBeCloseTo(26, 2);
    expect(band.y).toBeGreaterThan(logo.y + logo.height - 3);
  }
  await pin.focus();
  await pin.evaluate((element) => element.setAttribute("data-identity", "retained"));
  for (const count of [1, 0, 2, 3]) {
    await page.locator("#change-count").evaluate((button, count) => { (button as HTMLElement).dataset.count = String(count); (button as HTMLButtonElement).click(); }, count);
    await expect(pin.locator(".station-price")).toHaveCount(count);
    await expect(pin).toHaveAttribute("data-identity", "retained");
    await expect(pin).toBeFocused();
    const box = (await pin.boundingBox())!;
    expect(box.x).toBeCloseTo(before.x, 2);
    expect(box.y + box.height).toBeCloseTo(before.y + before.height, 2);
  }
  mkdirSync("reports/evidence/m01/multi-fuel", { recursive: true });
  await page.locator("#fixture-map").screenshot({ path: "reports/evidence/m01/multi-fuel/three-price-bands-fixture.png" });
});
