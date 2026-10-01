import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
import { locales } from "./rental-fixtures";

const labels = { en: "Privacy choices", "zh-Hant": "隱私選擇", ko: "개인정보 선택", "zh-Hans": "隐私选择", th: "ตัวเลือกความเป็นส่วนตัว" };
const adScript = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8063428584007009";

for (const locale of locales) test(`${locale}: visitor can reopen Google's consent message without starting ads`, async ({ page }) => {
  await page.route(adScript, route => route.fulfill({ contentType: "application/javascript", body: `
    let notify;
    window.googlefc = { callbackQueue: { push: item => item.CONSENT_API_READY?.() }, showRevocationMessage: () => {
      document.body.dataset.consentReopened = 'yes';
      notify?.({gdprApplies: true, listenerId: 7, eventStatus: 'cmpuishown'}, true);
    } };
    window.__tcfapi = (command, version, callback) => {
      if (command === 'addEventListener') { notify=callback; callback({gdprApplies: true, listenerId: 7, eventStatus: 'tcloaded'}, true); }
    };
  ` }));
  await page.goto(`/${locale}/about/`);
  await page.getByRole("button", { name: labels[locale], exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-consent-reopened", "yes");
  await expect(page.getByRole("button", { name: labels[locale], exact: true })).toBeEnabled();
  await expect(page.getByRole("status")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { adsbygoogle: { pauseAdRequests: number } }).adsbygoogle.pauseAdRequests)).toBe(1);
  await expect(page.locator(".ad-placement")).toHaveCount(0);
});

test("blocked consent service gives a useful message and does not trap the map or navigation", async ({ page }) => {
  await page.goto("/zh-Hans/");
  await page.locator(".map-notes > summary").click();
  await page.getByRole("button", { name: "隐私选择", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "暂时无法打开 Google 隐私设置" })).toBeVisible({ timeout: 8000 });
  await expect(page.getByRole("button", { name: "隐私选择", exact: true })).toBeEnabled();
  await page.locator("#return-car-link").click();
  await expect(page.locator(".rental-directory")).toBeVisible();
  await page.locator("#refuel-guide-link").click();
  await expect(page.locator(".refuel-guide-page")).toBeVisible();
});

test("a late consent callback after timeout cannot unexpectedly reopen a message", async ({ page }) => {
  await page.goto("/zh-Hans/about/");
  await page.getByRole("button", { name: "隐私选择", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("暂时无法打开", { timeout: 8000 });
  await page.evaluate(() => {
    const w = window as unknown as { googlefc: { callbackQueue: { CONSENT_API_READY(): void }[]; showRevocationMessage(): void } };
    w.googlefc.showRevocationMessage = () => { document.body.dataset.unexpectedConsent = "yes"; };
    w.googlefc.callbackQueue.forEach(callback => callback.CONSENT_API_READY());
  });
  await expect(page.locator("body")).not.toHaveAttribute("data-unexpected-consent", "yes");
});

test("consent bootstrap domain is allowed by production CSP while ad requests stay paused", async ({ page }) => {
  const csp = readFileSync("public/_headers", "utf8").split("\n").find(line => line.trim().startsWith("Content-Security-Policy:"))!.split("Content-Security-Policy:")[1].trim();
  await page.route("**/zh-Hans/about/", async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  await page.route(adScript, route => route.fulfill({ contentType: "application/javascript", body: `
    const script = document.createElement('script');
    script.src = 'https://fundingchoicesmessages.google.com/i/pub-8063428584007009?ers=1';
    document.head.append(script);
  ` }));
  await page.route("https://fundingchoicesmessages.google.com/**", route => route.fulfill({ contentType: "application/javascript", body: "document.body.dataset.cmpLoaded = 'yes';" }));
  await page.goto("/zh-Hans/about/");
  await expect(page.locator("body")).toHaveAttribute("data-cmp-loaded", "yes");
  expect(await page.evaluate(() => (window as unknown as { adsbygoogle: { pauseAdRequests: number } }).adsbygoogle.pauseAdRequests)).toBe(1);
});


test("European consent settings report when they do not apply and keep ads paused", async ({ page }) => {
  await page.route(adScript, route => route.fulfill({ contentType: "application/javascript", body: `
    window.googlefc = { callbackQueue: { push: item => item.CONSENT_API_READY?.() }, showRevocationMessage: () => { document.body.dataset.unexpectedConsent = 'yes'; } };
    window.__tcfapi = (command, version, callback) => { if (command === 'addEventListener') callback({gdprApplies: false, listenerId: 3}, true); };
  ` }));
  await page.goto("/en/about/");
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("does not apply to this visit");
  await expect(page.locator("body")).not.toHaveAttribute("data-unexpected-consent", "yes");
});

test("revocation events cannot recursively reopen the consent message", async ({ page }) => {
  await page.route(adScript, route => route.fulfill({ contentType: "application/javascript", body: `
    let notify;
    window.googlefc = { callbackQueue: { push: item => item.CONSENT_API_READY?.() }, showRevocationMessage: () => {
      document.body.dataset.consentCount = String(Number(document.body.dataset.consentCount || 0) + 1);
      notify?.({gdprApplies:true, listenerId:9, eventStatus:'tcloaded'}, true);
      notify?.({gdprApplies:true, listenerId:9, eventStatus:'cmpuishown'}, true);
    } };
    window.__tcfapi = (command, version, callback) => {
      if (command === 'addEventListener') { notify=callback; callback({gdprApplies: true, listenerId: 9}, true); }
      if (command === 'removeEventListener') document.body.dataset.listenerRemoved = 'yes';
    };
  ` }));
  await page.goto("/en/about/");
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-consent-count", "1");
  await expect(page.locator("body")).toHaveAttribute("data-listener-removed", "yes");
});

test("production guide has no ad preview, empty slot or ad request even with preview parameters", async ({ page }) => {
  await page.goto("/zh-Hans/refuel-guide/?previewAd=guide");
  await expect(page.locator(".refuel-guide-page")).toBeVisible();
  await expect(page.locator(".ad-placement, ins.adsbygoogle")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { adsbygoogle: { pauseAdRequests: number } }).adsbygoogle.pauseAdRequests)).toBe(1);
});

test("a ready Google API that does not show its window reports a retryable failure", async ({ page }) => {
  await page.route(adScript, route => route.fulfill({ contentType: "application/javascript", body: `
    window.googlefc = { callbackQueue: { push: item => item.CONSENT_API_READY?.() }, showRevocationMessage: () => {} };
    window.__tcfapi = (command, version, callback) => {
      if (command === 'addEventListener') callback({gdprApplies: true, listenerId: 12, eventStatus: 'tcloaded'}, true);
    };
  ` }));
  await page.goto("/en/about/");
  await page.getByRole("button", { name: "Privacy choices", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("temporarily unavailable", { timeout: 8000 });
  await expect(page.getByRole("button", { name: "Privacy choices", exact: true })).toBeEnabled();
});
