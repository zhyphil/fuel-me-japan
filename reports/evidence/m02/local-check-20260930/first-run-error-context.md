# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: my-fuel.spec.ts >> en: exact fictional result uses localized copy and Japanese fuel label
- Location: tests/e2e/my-fuel.spec.ts:54:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByRole('dialog').getByLabel('Make', { exact: true })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to content" [ref=e3] [cursor=pointer]:
    - /url: "#main"
  - banner [ref=e4]:
    - link "Fuel Me Japan" [ref=e5] [cursor=pointer]:
      - /url: /en/
    - button "My Fuel" [ref=e11] [cursor=pointer]
    - navigation "Language" [ref=e15]:
      - link "EN" [ref=e16] [cursor=pointer]:
        - /url: /en/
      - link "繁中" [ref=e17] [cursor=pointer]:
        - /url: /zh-Hant/
      - link "한국어" [ref=e18] [cursor=pointer]:
        - /url: /ko/
      - link "简中" [ref=e19] [cursor=pointer]:
        - /url: /zh-Hans/
      - link "ไทย" [ref=e20] [cursor=pointer]:
        - /url: /th/
  - main [ref=e21]:
    - region [ref=e22]:
      - generic [ref=e23]:
        - heading "Japan fuel station map" [level=1] [ref=e24]
        - button "Japan overview" [ref=e25] [cursor=pointer]
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: Prefecture
          - combobox "Prefecture" [ref=e29] [cursor=pointer]:
            - option "Choose a prefecture…" [selected]
            - option "北海道 / Hokkaido"
            - option "青森 / Aomori"
            - option "岩手 / Iwate"
            - option "宮城 / Miyagi"
            - option "秋田 / Akita"
            - option "山形 / Yamagata"
            - option "福島 / Fukushima"
            - option "茨城 / Ibaraki"
            - option "栃木 / Tochigi"
            - option "群馬 / Gunma"
            - option "埼玉 / Saitama"
            - option "千葉 / Chiba"
            - option "東京 / Tokyo"
            - option "神奈川 / Kanagawa"
            - option "新潟 / Niigata"
            - option "富山 / Toyama"
            - option "石川 / Ishikawa"
            - option "福井 / Fukui"
            - option "山梨 / Yamanashi"
            - option "長野 / Nagano"
            - option "岐阜 / Gifu"
            - option "静岡 / Shizuoka"
            - option "愛知 / Aichi"
            - option "三重 / Mie"
            - option "滋賀 / Shiga"
            - option "京都 / Kyoto"
            - option "大阪 / Osaka"
            - option "兵庫 / Hyogo"
            - option "奈良 / Nara"
            - option "和歌山 / Wakayama"
            - option "鳥取 / Tottori"
            - option "島根 / Shimane"
            - option "岡山 / Okayama"
            - option "広島 / Hiroshima"
            - option "山口 / Yamaguchi"
            - option "徳島 / Tokushima"
            - option "香川 / Kagawa"
            - option "愛媛 / Ehime"
            - option "高知 / Kochi"
            - option "福岡 / Fukuoka"
            - option "佐賀 / Saga"
            - option "長崎 / Nagasaki"
            - option "熊本 / Kumamoto"
            - option "大分 / Oita"
            - option "宮崎 / Miyazaki"
            - option "鹿児島 / Kagoshima"
            - option "沖縄 / Okinawa"
        - generic [ref=e30]:
          - generic [ref=e31]: Display fuel
          - group [ref=e32]:
            - generic "Display fuel Regular petrol / レギュラー" [ref=e33] [cursor=pointer]: Regular petrol / レギュラー
        - group "Results view" [ref=e35]:
          - button "Map" [pressed] [ref=e36] [cursor=pointer]
          - button "List" [ref=e37] [cursor=pointer]
      - generic [ref=e38]:
        - paragraph [ref=e39]:
          - text: "Data area:"
          - strong [ref=e40]: All Japan · regional summaries
        - button "Change area" [ref=e41] [cursor=pointer]
      - status [ref=e43]: 16,454 data records · choose a region
      - generic [ref=e45]:
        - generic [ref=e46]:
          - region "Fuel station map" [ref=e47]:
            - generic:
              - generic:
                - 'button "北海道 / Hokkaido: 1,148 data records. Load this region." [ref=e48] [cursor=pointer]':
                  - generic [aria-hidden] [ref=e49]: 1,148
                - button "44 regions, 14,864 recorded stations. Zoom in to choose a region." [ref=e50] [cursor=pointer]:
                  - generic [aria-hidden] [ref=e51]: 14,864
                - 'button "長崎 / Nagasaki: 147 data records. Load this region." [ref=e52] [cursor=pointer]':
                  - generic [aria-hidden] [ref=e53]: "147"
                - 'button "沖縄 / Okinawa: 295 data records. Load this region." [ref=e54] [cursor=pointer]':
                  - generic [aria-hidden] [ref=e55]: "295"
            - generic [ref=e56]:
              - button "Zoom in" [ref=e57] [cursor=pointer]: +
              - button "Zoom out" [ref=e58] [cursor=pointer]: −
          - generic [ref=e59]: Use arrow keys to pan and plus or minus to zoom. Tab to map points and press Enter to select. All regions and stations are also accessible in List view.
          - link "© OpenStreetMap contributors" [ref=e61] [cursor=pointer]:
            - /url: https://www.openstreetmap.org/copyright
        - button "Use my location" [ref=e62] [cursor=pointer]
        - generic [ref=e65]:
          - button "Filters" [disabled] [ref=e66]
          - generic [ref=e70]: Choose a region and wait for stations to load.
      - group [ref=e71]:
        - generic "Map, data and privacy" [ref=e72] [cursor=pointer]
  - dialog [ref=e73]:
    - banner [ref=e74]:
      - heading "My Fuel" [level=2] [ref=e75]
      - button "Close My Fuel" [active] [ref=e78] [cursor=pointer]
    - generic [ref=e81]:
      - paragraph [ref=e82]: Before filling, check your rental documents and the fuel-door label. If they disagree or you are unsure, ask the rental company before filling.
      - paragraph [ref=e83]: Vehicle choices are kept only while this panel is open and cleared when it closes. They do not change your map or displayed-price fuel choices.
      - status
      - generic [ref=e84]:
        - paragraph [ref=e85]: Match every detail exactly, including variant and model year (not registration year). If any detail is missing, different or uncertain, do not select a similar vehicle. Check the rental documents and fuel-door label.
        - generic [ref=e86]:
          - text: Rental company (optional)
          - combobox "Rental company (optional)" [ref=e87] [cursor=pointer]:
            - option "Not selected" [selected]
        - generic [ref=e88]:
          - text: Make
          - combobox "Make" [ref=e89] [cursor=pointer]:
            - option "Not listed / unsure" [selected]
            - option "Fictional Test Motors"
        - generic [ref=e90]:
          - text: Model
          - combobox "Model" [disabled] [ref=e91] [cursor=pointer]:
            - option "Not listed / unsure" [selected]
        - generic [ref=e92]:
          - text: Variant / powertrain
          - combobox "Variant / powertrain" [disabled] [ref=e93] [cursor=pointer]:
            - option "Not listed / unsure" [selected]
        - generic [ref=e94]:
          - text: Model year
          - combobox "Model year" [disabled] [ref=e95] [cursor=pointer]:
            - option "Not listed / unsure" [selected]
        - generic [ref=e96]:
          - button "Check exact vehicle" [disabled] [ref=e97]
          - button "Clear choices" [ref=e98] [cursor=pointer]
          - button "Reload data" [ref=e99] [cursor=pointer]
      - status
      - region [ref=e100]:
        - heading "Japanese pump labels" [level=3] [ref=e101]
        - paragraph [ref=e102]: Recognition guide only. These three labels do not identify the fuel your vehicle needs.
        - generic [ref=e103]:
          - generic [ref=e104]:
            - term [ref=e105]: レギュラー
            - definition [ref=e106]: Regular petrol
          - generic [ref=e107]:
            - term [ref=e108]: ハイオク
            - definition [ref=e109]: High-octane petrol
          - generic [ref=e110]:
            - term [ref=e111]: 軽油
            - definition [ref=e112]: Diesel
```

# Test source

```ts
  1   | import { type Page } from "@playwright/test";
  2   | import { test, expect } from "./offline";
  3   | import type { Locale } from "../../src/i18n";
  4   | import { vehicleLocales as locales } from "../../src/lib/vehicle-sources";
  5   | import { fixtureArtifacts, vehicleFixture, fixtureMessages as messages } from "../fixtures/vehicles";
  6   | import { chooseFuels } from "./fuel-selection";
  7   | 
  8   | async function fixtures(page: Page, fixture = vehicleFixture()) {
  9   |   const { files } = fixtureArtifacts(fixture);
  10  |   await page.route("**/data/vehicles/**", async (route) => { await route.fulfill({ status: 200, contentType: "application/json", body: files[new URL(route.request().url()).pathname] ?? "{}" }); });
  11  | }
  12  | async function open(page: Page, locale: Locale = "en") {
  13  |   await page.getByRole("button", { name: messages[locale].myFuelTitle, exact: true }).click();
  14  |   await expect(page.getByRole("dialog")).toBeVisible();
  15  | }
  16  | async function selectVehicle(page: Page, fuel = "REGULAR", locale: Locale = "en") {
  17  |   const t = messages[locale], dialog = page.getByRole("dialog");
> 18  |   await dialog.getByLabel(t.myFuelMake, { exact: true }).selectOption("Fictional Test Motors");
      |                                                          ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  19  |   await dialog.getByLabel(t.myFuelModel, { exact: true }).selectOption("Imaginary Test Car");
  20  |   await dialog.getByLabel(t.myFuelVariant, { exact: true }).selectOption(`Test ${fuel}`);
  21  |   await dialog.getByLabel(t.myFuelYear, { exact: true }).selectOption("2021");
  22  |   await dialog.getByRole("button", { name: t.myFuelCheck, exact: true }).click();
  23  | }
  24  | 
  25  | for (const locale of locales) {
  26  |   for (const width of [320, 1280]) {
  27  |     test(`${locale} ${width}px: shipped empty coverage, neutral labels and keyboard closure`, async ({ page }, testInfo) => {
  28  |       await page.setViewportSize({ width, height: 844 });
  29  |       const requests: string[] = [];
  30  |       page.on("request", (request) => { if (request.url().includes("/data/vehicles/")) requests.push(request.url()); });
  31  |       await page.goto(`/${locale}/`);
  32  |       await expect(page.locator(".leaflet-container")).toBeVisible();
  33  |       expect(requests).toEqual([]);
  34  |       const trigger = page.getByRole("button", { name: messages[locale].myFuelTitle, exact: true });
  35  |       await trigger.focus(); await trigger.press("Enter");
  36  |       const dialog = page.getByRole("dialog");
  37  |       await expect(dialog.getByText(messages[locale].myFuelEmptyTitle)).toBeVisible();
  38  |       await expect(dialog.getByRole("combobox")).toHaveCount(0);
  39  |       await expect(dialog.getByText(messages[locale].myFuelGuidance)).toBeVisible();
  40  |       for (const label of ["レギュラー", "ハイオク", "軽油"]) await expect(dialog.getByText(label, { exact: true })).toBeVisible();
  41  |       expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
  42  |       expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  43  |       await dialog.getByRole("button", { name: messages[locale].myFuelClose }).focus();
  44  |       await page.keyboard.press("Tab");
  45  |       // A native dialog with one focusable control may briefly focus the document; it must never focus the inert map.
  46  |       expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest("dialog") !== null)).toBe(true);
  47  |       await page.keyboard.press("Shift+Tab");
  48  |       await page.screenshot({ path: testInfo.outputPath(`my-fuel-${locale}-${width}.png`) });
  49  |       await page.keyboard.press("Escape");
  50  |       await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
  51  |       expect(requests).toHaveLength(3);
  52  |     });
  53  |   }
  54  |   test(`${locale}: exact fictional result uses localized copy and Japanese fuel label`, async ({ page }) => {
  55  |     await fixtures(page); await page.goto(`/${locale}/`); await open(page, locale);
  56  |     await selectVehicle(page, "REGULAR", locale);
  57  |     const result = page.getByTestId("my-fuel-result");
  58  |     await expect(result.getByText(messages[locale].myFuelVerified, { exact: true })).toBeVisible();
  59  |     await expect(result.getByText("レギュラー", { exact: true })).toBeVisible();
  60  |     await expect(result.getByText(messages[locale].myFuelConfirm)).toBeVisible();
  61  |   });
  62  | }
  63  | 
  64  | test("three fictional fuels and UNKNOWN, selection invalidation, clear, focus trap and session reset", async ({ page }) => {
  65  |   await fixtures(page); await page.goto("/en/"); await open(page);
  66  |   for (const [fuel, japanese] of [["REGULAR", "レギュラー"], ["HIGH_OCTANE", "ハイオク"], ["DIESEL", "軽油"]]) {
  67  |     await selectVehicle(page, fuel);
  68  |     const result = page.getByTestId("my-fuel-result");
  69  |     await expect(result.getByText(japanese, { exact: true })).toBeVisible();
  70  |     await expect(result).toContainText("2021"); await expect(result).toContainText("2026-09-20");
  71  |     await expect(result.getByRole("link")).toHaveAttribute("href", "https://example.test/fictional-manual");
  72  |     await page.getByLabel(messages.en.myFuelYear, { exact: true }).selectOption("");
  73  |     await expect(result).toHaveCount(0);
  74  |   }
  75  |   await selectVehicle(page, "UNKNOWN");
  76  |   await expect(page.getByTestId("my-fuel-result")).toContainText(messages.en.myFuelUnknown);
  77  |   await page.getByRole("button", { name: messages.en.myFuelClear, exact: true }).click();
  78  |   await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  79  |   await expect(page.getByLabel(messages.en.myFuelMake, { exact: true })).toHaveValue("");
  80  |   await selectVehicle(page);
  81  |   await page.getByLabel(messages.en.myFuelMake, { exact: true }).selectOption("");
  82  |   await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  83  |   await expect(page.getByLabel(messages.en.myFuelModel, { exact: true })).toHaveValue("");
  84  |   await selectVehicle(page);
  85  |   const close = page.getByRole("button", { name: messages.en.myFuelClose });
  86  |   await close.focus(); await page.keyboard.press("Shift+Tab");
  87  |   expect(await page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  88  |   await close.click(); await open(page);
  89  |   await expect(page.getByLabel(messages.en.myFuelMake, { exact: true })).toHaveValue("");
  90  |   await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  91  | });
  92  | 
  93  | test("explicit company scope and changing company immediately invalidates the result", async ({ page }) => {
  94  |   const f = vehicleFixture();
  95  |   f.mappings.records.forEach((row) => { row.rentalCompany = "Fictional Rental A"; });
  96  |   f.registry.sources[0].evidence.forEach((row) => { row.rentalCompany = "Fictional Rental A"; });
  97  |   await fixtures(page, f); await page.goto("/en/"); await open(page);
  98  |   await expect(page.getByLabel(messages.en.myFuelMake, { exact: true }).locator("option")).toHaveCount(1);
  99  |   await page.getByLabel(messages.en.myFuelCompany).selectOption("Fictional Rental A");
  100 |   await selectVehicle(page);
  101 |   await expect(page.getByTestId("my-fuel-result")).toContainText(messages.en.myFuelVerified);
  102 |   await page.getByLabel(messages.en.myFuelCompany).selectOption("");
  103 |   await expect(page.getByTestId("my-fuel-result")).toHaveCount(0);
  104 |   await expect(page.getByLabel(messages.en.myFuelMake, { exact: true })).toHaveValue("");
  105 | });
  106 | 
  107 | test("error/retry is accessible; reloading clears VERIFIED before delayed data arrives", async ({ page }) => {
  108 |   const { files } = fixtureArtifacts();
  109 |   let mode: "error" | "ready" | "delayed" = "error";
  110 |   let release!: () => void;
  111 |   const delayed = new Promise<void>((resolve) => { release = resolve; });
  112 |   await page.route("**/data/vehicles/**", async (route) => {
  113 |     if (mode === "error") return route.fulfill({ status: 503, body: "offline test" });
  114 |     if (mode === "delayed") await delayed;
  115 |     await route.fulfill({ contentType: "application/json", body: files[new URL(route.request().url()).pathname] });
  116 |   });
  117 |   await page.goto("/en/"); await open(page);
  118 |   await expect(page.getByRole("alert")).toContainText(messages.en.myFuelError);
```