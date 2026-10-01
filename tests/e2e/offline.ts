import { test as base, expect, type BrowserContext } from "@playwright/test";
import { readFileSync } from "node:fs";

// Synthetic solid-grey 256px PNG, not a real map or evidence of OSM availability.
export const offlineTile = readFileSync("tests/e2e/fixtures/offline-tile.png");
export async function interceptExternal(context: BrowserContext) {
  await context.route(/https?:\/\//, async (route) => {
    const host = new URL(route.request().url()).hostname;
    if (host === "127.0.0.1" || host === "localhost") await route.continue();
    else if (host === "tile.openstreetmap.org") await route.fulfill({ status: 200, contentType: "image/png", body: offlineTile });
    else if (host === "pagead2.googlesyndication.com") await route.fulfill({ status: 200, contentType: "application/javascript", body: "/* Offline AdSense boundary: no advertising or tracking. */" });
    else await route.fulfill({ status: 200, contentType: "text/plain", body: "Offline external navigation interception" });
  });
}
export const test = base.extend<{ offlineNetwork: void }>({
  offlineNetwork: [async ({ context }, use) => { await interceptExternal(context); await use(); }, { auto: true }],
});
export { expect };
