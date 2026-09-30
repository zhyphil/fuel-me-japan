import { describe, expect, it } from "vitest";
import { stationMiniMapTiles } from "../../src/lib/station-mini-map";

describe("station thumbnail tile projection", () => {
  it("centres the station at the intersection of the four equatorial tiles", () => {
    expect(stationMiniMapTiles({ lat: 0, lon: 0 }, 156, 116)).toEqual([
      { z: 14, x: 8191, y: 8191, left: -178, top: -198 },
      { z: 14, x: 8192, y: 8191, left: 78, top: -198 },
      { z: 14, x: 8191, y: 8192, left: -178, top: 58 },
      { z: 14, x: 8192, y: 8192, left: 78, top: 58 },
    ]);
  });
  it("moves east and north correctly and only returns intersecting tiles", () => {
    const tiles = stationMiniMapTiles({ lat: 35.68, lon: 139.76 }, 280, 116);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(6);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThan(8192); expect(tile.y).toBeLessThan(8192);
      expect(tile.left).toBeLessThan(280); expect(tile.left + 256).toBeGreaterThan(0);
      expect(tile.top).toBeLessThan(116); expect(tile.top + 256).toBeGreaterThan(0);
    }
    const east = stationMiniMapTiles({ lat: 0, lon: 360 / 16384 }, 156, 116);
    expect(east[0]).toMatchObject({ x: 8192, y: 8191, left: -178, top: -198 });
  });
  it("clips world edges without wrapping or requesting invalid tiles", () => {
    for (const point of [{ lat: 90, lon: 180 }, { lat: -90, lon: -180 }]) {
      const tiles = stationMiniMapTiles(point, 156, 116);
      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles.every((tile) => tile.x >= 0 && tile.x < 16384 && tile.y >= 0 && tile.y < 16384)).toBe(true);
    }
  });
  it("does not request tiles for invalid coordinates or an unmeasured viewport", () => {
    for (const point of [{ lat: NaN, lon: 0 }, { lat: 0, lon: Infinity }, { lat: 91, lon: 0 }, { lat: 0, lon: -181 }]) expect(stationMiniMapTiles(point, 156, 116)).toEqual([]);
    for (const size of [0, -1, Infinity, 2049]) expect(stationMiniMapTiles({ lat: 0, lon: 0 }, size, 116)).toEqual([]);
  });
});
