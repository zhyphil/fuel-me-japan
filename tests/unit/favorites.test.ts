import { afterEach, describe, expect, it, vi } from "vitest";
import { FAVORITES_KEY, FAVORITES_LIMIT, parseFavorites, readFavorites, saveFavorites, type Favorite } from "../../src/lib/favorites";

const entry: Favorite = { id: "osm:node:123", partition: "JP-01" };
const stored = (entries: unknown[], patch = {}) => JSON.stringify({ version: 1, entries, ...patch });
afterEach(() => vi.unstubAllGlobals());
describe("local favorites schema", () => {
  it("reads only versioned typed OSM IDs and partition codes and deduplicates in saved order", () => {
    expect(parseFavorites(null)).toEqual([]);
    expect(parseFavorites(stored([entry, { ...entry, partition: "JP-02" }, { id: "osm:way:123", partition: "UNKNOWN" }, { id: "osm:relation:123", partition: "JP-47" }]))).toEqual([entry, { id: "osm:way:123", partition: "UNKNOWN" }, { id: "osm:relation:123", partition: "JP-47" }]);
  });
  it.each(["{}", "garbage", "null", "[]", stored([entry], { version: 2 }), stored([entry], { url: "/path" }), stored([{ ...entry, lat: 35 }]), stored([{ ...entry, name: "name" }]), stored([{ ...entry, path: "/data/x" }]), stored([{ id: "osm:node:01", partition: "JP-01" }]), stored([{ id: "osm:node:0", partition: "JP-01" }]), stored([{ id: "osm:node:9007199254740992", partition: "JP-01" }]), stored([{ id: "123", partition: "JP-01" }]), stored([{ ...entry, partition: "JP-99" }]), stored([{ ...entry, partition: "../JP-01" }]), stored([{ ...entry, partition: "https://evil.example" }]), stored([null]), " ".repeat(24_001)])("rejects corrupt or untrusted schema %s", (raw) => {
    expect(() => parseFavorites(raw)).toThrow();
  });
  it("bounds the entry count", () => {
    const entries = Array.from({ length: FAVORITES_LIMIT }, (_, index) => ({ id: `osm:node:${index + 1}`, partition: "JP-01" }));
    expect(parseFavorites(stored(entries))).toHaveLength(200);
    expect(() => parseFavorites(stored([...entries, entry]))).toThrow();
  });
  it("never stores full station objects or writes during initial read", () => {
    const setItem = vi.fn(); const getItem = vi.fn(() => stored([entry]));
    vi.stubGlobal("window", { localStorage: { getItem, setItem } });
    expect(readFavorites()).toEqual({ entries: [entry], notice: null });
    expect(setItem).not.toHaveBeenCalled();
    expect(saveFavorites([{ ...entry, lat: 35, name: "private" } as Favorite])).toBe(true);
    expect(setItem).toHaveBeenCalledExactlyOnceWith(FAVORITES_KEY, stored([entry]));
  });
  it("reports corrupt data without replacing it on read", () => {
    const setItem = vi.fn(); vi.stubGlobal("window", { localStorage: { getItem: () => "bad", setItem } });
    expect(readFavorites()).toEqual({ entries: [], notice: "corrupt" }); expect(setItem).not.toHaveBeenCalled();
  });
  it("reports blocked reads, storage getter and quota writes honestly", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    expect(readFavorites()).toEqual({ entries: [], notice: "storage" }); expect(saveFavorites([entry])).toBe(false);
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("quota"); } } });
    expect(readFavorites()).toEqual({ entries: [], notice: null }); expect(saveFavorites([entry])).toBe(false);
  });
});
