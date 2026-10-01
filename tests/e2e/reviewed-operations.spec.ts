import { test, expect } from "./offline";
import { fixtures, openDetail, rentalIndex, rentalLocation, observations, stationFixtures, rentalFixtures, locales, messages } from "./rental-fixtures";
import { stationReviews } from "../../src/lib/station-review";
const rows = rentalIndex.records.filter(row => rentalLocation(row).official?.operations);
for (const locale of locales) test(`reviewed airport hours and correct return lead times ${locale}`, async ({page}) => {
  await fixtures(page);
  for (const row of rows) {
    const detail = await openDetail(page, row, locale);
    const ops = rentalLocation(row).official!.operations!;
    for (const line of messages[locale][ops.hoursKey].split("\n")) await expect(detail.getByTestId("rental-hours")).toContainText(line);
    const lead = detail.getByTestId("rental-return-lead");
    await expect(lead).toContainText(ops.returnLeadMinutes === null ? messages[locale].ffUnknown : messages[locale].rdReturnLeadMinutes.replace("{minutes}", String(ops.returnLeadMinutes)));
    const location = rentalLocation(row);
    await expect(detail.locator(".rental-official-notes")).toContainText(messages[locale].rcChecked.replace("{date}", location.official!.checkedAt));
    if (location.returnRule) await expect(detail.locator(".return-car-rules")).toContainText(messages[locale].rdRuleChecked.replace("{date}", location.returnRule.checkedAt));
    expect((await observations(page)).geolocationCalls).toBe(0);
  }
});
for (const locale of locales) test(`station exceptions, original evidence and navigation remain intact ${locale}`, async ({page}) => {
  await rentalFixtures(page);
  const review = stationReviews.find(row => row.osm.id === "osm:node:5694016271")!;
  await stationFixtures(page, {rows: [review.osm]});
  const row = rentalIndex.records.find(row => row.id === "times-new-chitose-airport")!;
  await openDetail(page, row, locale);
  await page.locator("#return-fuel").selectOption("REGULAR");
  const card = page.locator(".return-station-summary").filter({hasText: "エアカーゴSS"});
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(messages[locale]["station.hours.air-cargo"]);
  await expect(card.getByTestId("station-reviewed").getByRole("link",{name: messages[locale].stationOfficialSource})).toHaveAttribute("href", review.url);
  await card.getByText(messages[locale].stationOsmOriginal, {exact:true}).click();
  await expect(card.getByTestId("station-reviewed")).toContainText("08:00-19:00");
  await expect(card.getByTestId("station-reviewed")).toContainText(review.osm.sourceUpdatedAt);
  await card.getByRole("button",{name: `${messages[locale].rcSelect}: エアカーゴSS`, exact:true}).click();
  await expect(page.locator(".return-navigation")).toBeVisible();
  expect((await observations(page)).geolocationCalls).toBe(0);
});

test("branch details and company rules show their independent source check dates", async ({page}) => {
  await fixtures(page);
  const row = rentalIndex.records.find(row => row.id === "times-naha-airport")!;
  const location = rentalLocation(row);
  expect(location.official!.checkedAt).toBe("2026-10-01");
  expect(location.returnRule!.checkedAt).toBe("2026-09-30");
  const detail = await openDetail(page, row, "en");
  await expect(detail.locator(".rental-official-notes")).toContainText("Branch details checked: 2026-10-01");
  await expect(detail.locator(".return-car-rules")).toContainText("Company refuelling rules checked: 2026-09-30");
});
