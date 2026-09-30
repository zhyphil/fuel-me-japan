import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const languageCases = [
  {
    locale: "en",
    label: "EN",
    heading: "Japan ahead.",
    title: "Fuel Me Japan — Refuel with confidence",
    task: "Find fuel near me",
  },
  {
    locale: "zh-Hant",
    label: "繁中",
    heading: "下一站，日本。",
    title: "Fuel Me Japan — 在日本安心加油",
    task: "尋找附近加油站",
  },
  {
    locale: "ko",
    label: "한국어",
    heading: "다음 목적지, 일본.",
    title: "Fuel Me Japan — 일본에서 안심하고 주유하기",
    task: "내 주변 주유소 찾기",
  },
  {
    locale: "zh-Hans",
    label: "简中",
    heading: "下一站，日本。",
    title: "Fuel Me Japan — 在日本安心加油",
    task: "寻找附近加油站",
  },
  {
    locale: "th",
    label: "ไทย",
    heading: "จุดหมายต่อไป ญี่ปุ่น",
    title: "Fuel Me Japan — เติมน้ำมันในญี่ปุ่นอย่างมั่นใจ",
    task: "หาปั๊มน้ำมันใกล้ฉัน",
  },
];
for (const language of languageCases) {
  test(`mobile switching and reload: ${language.locale}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto("/");
    await page
      .getByRole("navigation")
      .getByRole("link", { name: language.label, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${language.locale}/$`));
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    await expect(page).toHaveTitle(language.title);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      `https://fuel-me-japan.com/${language.locale}/`,
    );
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex,\s*nofollow/,
    );
    for (const alternate of languageCases) {
      await expect(
        page.locator(`link[rel="alternate"][hreflang="${alternate.locale}"]`),
      ).toHaveAttribute("href", `https://fuel-me-japan.com/${alternate.locale}/`);
    }
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]'),
    ).toHaveAttribute("href", "https://fuel-me-japan.com/en/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      language.heading,
    );
    await expect(
      page.getByRole("heading", { name: language.task, exact: true }),
    ).toBeVisible();
    await expect(page.locator(".task-grid article")).toHaveCount(4);
    await expect(page.locator(".task-grid button")).toHaveCount(1);
    await expect(page.locator(".task-grid article:not(:has(button))")).toHaveCount(3);
    await expect(page.getByText(JSON.parse(readFileSync(`src/locales/${language.locale}.json`, "utf8")).preview, { exact: true })).toBeVisible();
    await expect(
      page.getByRole("navigation").locator('[aria-current="page"]'),
    ).toHaveText(language.label);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", language.locale);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      for (const link of await page
        .getByRole("navigation")
        .getByRole("link")
        .all()) {
        const size = await link.boundingBox();
        expect(size?.height).toBeGreaterThanOrEqual(44);
        expect(size?.width).toBeGreaterThanOrEqual(44);
      }
    }
    expect(errors).toEqual([]);
  });
}
test("localized static HTML is useful without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    `${process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:4173"}/ko/`,
  );
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "다음 목적지, 일본.",
  );
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /일본/,
  );
  await page.getByRole("link", { name: "ไทย", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "จุดหมายต่อไป ญี่ปุ่น",
  );
  await context.close();
});
test("home and opening M0.1 do not request location, persist it, fetch data or send analytics", async ({
  page,
  context,
}) => {
  const requests: string[] = [];
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: () => {
          throw new Error("Unexpected geolocation request");
        },
        watchPosition: () => {
          throw new Error("Unexpected geolocation watch");
        },
      },
    });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (["fetch", "xhr", "ping"].includes(request.resourceType()))
      requests.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByText("Find Fuel preview", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".task-grid article")).toHaveCount(4);
  await expect(page.locator(".task-grid button")).toHaveCount(1);
  await expect(page.locator(".task-grid article:not(:has(button))")).toHaveCount(3);
  await expect(page.locator(".task-grid .task-status").filter({ hasText: "Coming later" })).toHaveCount(3);
  await page.getByRole("button", { name: "Find fuel near me", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Find fuel near me", level: 2 })).toBeVisible();
  await page.getByRole("link", { name: "繁中", exact: true }).click();
  expect(requests).toEqual([]);
  expect(await context.cookies()).toEqual([]);
  expect(
    await page.evaluate(() => ({
      local: localStorage.length,
      session: sessionStorage.length,
    })),
  ).toEqual({ local: 0, session: 0 });
  expect(errors).toEqual([]);
});
test("shipped registry and build provenance match the M0.1 ingestion manifest", async ({ request }) => {
  const registryResponse = await request.get("/data/source-registry.json");
  expect(registryResponse.ok()).toBe(true);
  const registry = await registryResponse.json();
  expect(registry.sources).toHaveLength(5);
  for (const source of registry.sources) {
    const approved = ["osm", "geofabrik", "meti-prices"].includes(source.id);
    expect(source.productionEnabled).toBe(approved);
    expect(source.status).toBe(approved ? "APPROVED" : "PENDING_REVIEW");
    if (approved) expect(source.fetchedAt).toBeTruthy();
    else expect(source.fetchedAt).toBeNull();
  }
  const manifestResponse = await request.get("/data/manifest.json");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  const provenanceResponse = await request.get("/build-provenance.json");
  expect(provenanceResponse.ok()).toBe(true);
  const provenance = await provenanceResponse.json();
  expect(provenance.milestone).toBe("M0.1");
  expect(provenance.ingestedSources).toEqual(manifest.sources);
  expect(provenance.stationCount).toBe(manifest.stations.count);
  expect(provenance.priceRecordCount).toBe(141);
  expect(provenance.surveyDate).toBe(manifest.prices.surveyDate);
  expect(provenance.sourceRegistry).toEqual(manifest.sourceRegistry);
});
test("desktop layout and keyboard navigation remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/en/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("heading", { level: 1 }).click();
  await page.screenshot({
    path: "test-results/foundation-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/foundation-mobile.png",
    fullPage: true,
  });
});
