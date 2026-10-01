import { readFileSync } from "node:fs";
import { test, expect } from "./offline";
import { locales, messages } from "./rental-fixtures";

const adScript = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8063428584007009";

test("the delivered static pages each include one async publisher script in the head", async ({ request }) => {
  for (const path of ["/", ...locales.flatMap(locale => ["", "about/", "refuel-guide/", "return-car/"].map(suffix => `/${locale}/${suffix}`))]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    const head = html.split("</head>")[0];
    expect(head.split(adScript)).toHaveLength(2);
    const tag = head.match(/<script[^>]*src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^>]*>/)?.[0];
    expect(tag).toMatch(/\basync\b/);
    expect(tag).toContain('crossorigin="anonymous"');
  }
});

for (const locale of locales) test(`${locale}: production policy permits the tag once and keeps ad requests paused before it executes`, async ({ page }) => {
  const csp = readFileSync("public/_headers", "utf8").split("\n").find(line => line.trim().startsWith("Content-Security-Policy:"))!.split("Content-Security-Policy:")[1].trim();
  await page.route(`**/${locale}/about/`, async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "content-security-policy": csp } });
  });
  let loads = 0;
  await page.route(adScript, async route => {
    loads++;
    await route.fulfill({ contentType: "application/javascript", body: "window.__adsenseObserved = window.adsbygoogle?.pauseAdRequests;" });
  });
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { __adCspViolations: violations });
    document.addEventListener("securitypolicyviolation", event => violations.push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  await page.goto(`/${locale}/about/`);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __adsenseObserved: number }).__adsenseObserved)).toBe(1);
  await expect(page.locator('a[href="https://policies.google.com/technologies/partner-sites"]')).toBeVisible();
  await page.locator("#refuel-guide-link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages[locale].rgTitle);
  expect(loads).toBe(1);
  expect(await page.evaluate(() => (window as unknown as { __adCspViolations: string[] }).__adCspViolations)).toEqual([]);
});

test("blocked advertising script does not block the map, language menu or navigation", async ({ page }) => {
  await page.route(adScript, route => route.abort("blockedbyclient"));
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/zh-Hans/");
  await expect(page.locator(".map-surface.leaflet-container")).toBeVisible();
  await page.locator(".locale-trigger").click();
  await page.locator('.locale-menu a[lang="en"]').click();
  await expect(page).toHaveURL("/en/");
  await page.locator("#about-link").click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(messages.en.aboutTitle);
  expect(errors).toEqual([]);
});
