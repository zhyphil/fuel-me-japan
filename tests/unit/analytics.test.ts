import { describe, expect, it, vi } from "vitest";
import { createAnalytics, type EventName } from "../../src/lib/analytics";
import type { Locale } from "../../src/i18n";
describe("privacy-conscious analytics abstraction", () => {
  it("emits an allowlisted event through an injected adapter", () => {
    const adapter = vi.fn();
    createAnalytics(adapter).track("landing_view", { locale: "en" });
    expect(adapter).toHaveBeenCalledExactlyOnceWith({
      name: "landing_view",
      properties: { locale: "en" },
    });
  });
  it("drops precise coordinates, identifiers, URLs and nested extra payloads", () => {
    const adapter = vi.fn();
    const payload = {
      locale: "zh-Hant" as const,
      lat: 35.123456,
      lon: 139.123456,
      userId: "visitor",
      url: "?lat=35.123456",
      nested: { coordinates: [35.123456, 139.123456] },
    };
    createAnalytics(adapter).track("locale_selected", payload);
    expect(adapter.mock.calls).toEqual([
      [{ name: "locale_selected", properties: { locale: "zh-Hant" } }],
    ]);
  });
  it("rejects unknown runtime names and locales", () => {
    const adapter = vi.fn();
    const analytics = createAnalytics(adapter);
    analytics.track("35.123456" as EventName, { locale: "en" });
    analytics.track("landing_view", { locale: "35.123456" as Locale });
    expect(adapter).not.toHaveBeenCalled();
  });
  it("contains synchronous and asynchronous provider failures", async () => {
    expect(() =>
      createAnalytics(() => {
        throw new Error("offline");
      }).track("landing_view", { locale: "en" }),
    ).not.toThrow();
    createAnalytics(() => Promise.reject(new Error("offline"))).track(
      "landing_view",
      { locale: "en" },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  it("has a no-op default adapter", () => {
    expect(() =>
      createAnalytics().track("landing_view", { locale: "th" }),
    ).not.toThrow();
  });
});

it.each(["my_fuel_start", "my_fuel_success", "my_fuel_unknown"] as const)("%s only forwards locale, never vehicle or location", (name) => {
  const adapter = vi.fn();
  createAnalytics(adapter).track(name, { locale: "en", rentalCompany: "Fictional Rental", make: "Fictional", model: "Test", variant: "Test", modelYear: 2021, fuelType: "DIESEL", lat: 35.123, lon: 139.123, result: { vehicle: "Fictional" } } as { locale: "en" });
  expect(adapter).toHaveBeenCalledExactlyOnceWith({ name, properties: { locale: "en" } });
});

it.each(["refuel_guide_open", "refuel_guide_complete"] as const)("%s forwards only locale and ignores display preferences", (name) => {
  const adapter = vi.fn();
  createAnalytics(adapter).track(name, { locale: "zh-Hans", selectedFuels: ["DIESEL"], lat: 35, lon: 139 } as { locale: "zh-Hans" });
  expect(adapter).toHaveBeenCalledExactlyOnceWith({ name, properties: { locale: "zh-Hans" } });
});
