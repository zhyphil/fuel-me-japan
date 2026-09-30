import { afterEach, describe, expect, it, vi } from "vitest";
import { FUEL_PREFERENCE_KEY, readFuelPreference, resetFuelPreference, saveFuelPreference } from "../../src/lib/fuel-preference";
afterEach(() => vi.unstubAllGlobals());
describe("explicit fuel preference", () => {
  it("defaults without writes, persists only an enum, and removes only its own key", () => {
    const data = new Map<string, string>([["unrelated", "keep"]]);
    const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => data.set(key, value)), removeItem: vi.fn((key: string) => data.delete(key)) };
    vi.stubGlobal("window", { localStorage: storage });
    expect(readFuelPreference()).toEqual(["REGULAR"]); expect(storage.setItem).not.toHaveBeenCalled();
    saveFuelPreference(["DIESEL"]); expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(FUEL_PREFERENCE_KEY, JSON.stringify(["DIESEL"]));
    expect(readFuelPreference()).toEqual(["DIESEL"]);
    resetFuelPreference(); expect(readFuelPreference()).toEqual(["REGULAR"]); expect(data.get("unrelated")).toBe("keep");
    data.set(FUEL_PREFERENCE_KEY, "diesel"); expect(readFuelPreference()).toEqual(["REGULAR"]);
  });
  it("tolerates unavailable window and storage access/read/write/removal failures", () => {
    vi.stubGlobal("window", undefined); expect(readFuelPreference()).toEqual(["REGULAR"]);
    vi.stubGlobal("window", { get localStorage() { throw Error("denied"); } });
    expect(readFuelPreference()).toEqual(["REGULAR"]); expect(() => saveFuelPreference(["HIGH_OCTANE"])).not.toThrow(); expect(resetFuelPreference).not.toThrow();
    vi.stubGlobal("window", { localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } } });
    expect(readFuelPreference()).toEqual(["REGULAR"]); expect(() => saveFuelPreference(["DIESEL"])).not.toThrow(); expect(resetFuelPreference).not.toThrow();
  });
});


describe("multiple fuel preferences", () => {
  it("keeps one, two or three ordered fuels and reads the previous single-fuel format without writes", () => {
    let stored: string | null = "DIESEL";
    const setItem = vi.fn((_key: string, value: string) => { stored = value; });
    vi.stubGlobal("window", { localStorage: { getItem: () => stored, setItem } });
    expect(readFuelPreference()).toEqual(["DIESEL"]);
    expect(setItem).not.toHaveBeenCalled();
    saveFuelPreference(["DIESEL", "HIGH_OCTANE"]);
    expect(readFuelPreference()).toEqual(["DIESEL", "HIGH_OCTANE"]);
    saveFuelPreference(["DIESEL", "HIGH_OCTANE", "REGULAR"]);
    expect(readFuelPreference()).toEqual(["DIESEL", "HIGH_OCTANE", "REGULAR"]);
    for (const corrupt of ['[]', '["DIESEL","DIESEL"]', '["REGULAR","bad"]', '{}', 'null']) {
      stored = corrupt; expect(readFuelPreference()).toEqual(["REGULAR"]);
    }
  });
});
