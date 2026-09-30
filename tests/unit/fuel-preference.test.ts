import { afterEach, describe, expect, it, vi } from "vitest";
import { FUEL_PREFERENCE_KEY, readFuelPreference, resetFuelPreference, saveFuelPreference } from "../../src/lib/fuel-preference";
afterEach(() => vi.unstubAllGlobals());
describe("explicit fuel preference", () => {
  it("defaults without writes, persists only an enum, and removes only its own key", () => {
    const data = new Map<string, string>([["unrelated", "keep"]]);
    const storage = { getItem: vi.fn((key: string) => data.get(key) ?? null), setItem: vi.fn((key: string, value: string) => data.set(key, value)), removeItem: vi.fn((key: string) => data.delete(key)) };
    vi.stubGlobal("window", { localStorage: storage });
    expect(readFuelPreference()).toBe("REGULAR"); expect(storage.setItem).not.toHaveBeenCalled();
    saveFuelPreference("DIESEL"); expect(storage.setItem).toHaveBeenCalledExactlyOnceWith(FUEL_PREFERENCE_KEY, "DIESEL");
    expect(readFuelPreference()).toBe("DIESEL");
    resetFuelPreference(); expect(readFuelPreference()).toBe("REGULAR"); expect(data.get("unrelated")).toBe("keep");
    data.set(FUEL_PREFERENCE_KEY, "diesel"); expect(readFuelPreference()).toBe("REGULAR");
  });
  it("tolerates unavailable window and storage access/read/write/removal failures", () => {
    vi.stubGlobal("window", undefined); expect(readFuelPreference()).toBe("REGULAR");
    vi.stubGlobal("window", { get localStorage() { throw Error("denied"); } });
    expect(readFuelPreference()).toBe("REGULAR"); expect(() => saveFuelPreference("HIGH_OCTANE")).not.toThrow(); expect(resetFuelPreference).not.toThrow();
    vi.stubGlobal("window", { localStorage: { getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() { throw Error(); } } });
    expect(readFuelPreference()).toBe("REGULAR"); expect(() => saveFuelPreference("DIESEL")).not.toThrow(); expect(resetFuelPreference).not.toThrow();
  });
});
