import { describe, expect, it, vi } from "vitest";
import { clusterStations, createMapClusterCache, filterMapClusters, mapMemberKey, occupiedCellsAnchor } from "../../src/lib/map-view";
import type { BBox } from "../../src/lib/stations";

const viewport = { min: { x: -1000, y: -1000 }, max: { x: 1000, y: 1000 } };
describe("regional map anchors", () => {
  it("returns null for empty coverage and the center for one occupied cell", () => {
    expect(occupiedCellsAnchor([])).toBeNull();
    expect(occupiedCellsAnchor([[139, 35, 140, 36]])).toEqual({ lon: 139.5, lat: 35.5 });
  });
  it("anchors in the largest connected occupied area instead of distant islands or the bbox center", () => {
    const mainland: BBox[] = [[139, 35, 139.5, 35.5], [139.5, 35, 140, 35.5], [140, 35, 140.5, 35.5]];
    const cells: BBox[] = [[142, 26, 142.5, 26.5], ...mainland];
    expect(occupiedCellsAnchor(cells)).toEqual({ lon: 139.75, lat: 35.25 });
    expect(occupiedCellsAnchor([...cells].reverse())).toEqual({ lon: 139.75, lat: 35.25 });
  });
  it("keeps the anchor on an occupied cell even for a concave connected region", () => {
    const cells: BBox[] = [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 3, 1], [0, 1, 1, 2], [0, 2, 1, 3]];
    const anchor = occupiedCellsAnchor(cells)!;
    expect(cells.some(([x1, y1, x2, y2]) => anchor.lon === (x1 + x2) / 2 && anchor.lat === (y1 + y2) / 2)).toBe(true);
  });
});
describe("map aggregation keeps every loaded matching record", () => {
  it("retains all 80 co-located records regardless of the 25-item list page", () => {
    const stations = Array.from({ length: 80 }, (_, id) => ({ id, lat: 35, lon: 139 }));
    const clusters = clusterStations(stations, () => ({ x: 4, y: 9 }), viewport);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toEqual(stations);
    expect(clusters[0]).toMatchObject({ x: 4, y: 9 });
  });
  it("preserves unique membership across positive, negative and exact grid boundaries", () => {
    const stations = [-65, -64, -1, 0, 63, 64, 65].map((x, id) => ({ id, lat: x, lon: x }));
    const clusters = clusterStations(stations, (station) => ({ x: station.lat, y: station.lon }), viewport);
    expect(clusters.flatMap((cluster) => cluster.members).map((station) => station.id).sort()).toEqual(stations.map((station) => station.id));
    expect(clusters.map((cluster) => cluster.key)).toEqual(["-2:-2", "-1:-1", "0:0", "1:1"]);
  });
  it("clips distant groups, keeps edge groups within one cell, and handles empty records", () => {
    const stations = [-64, 164, 300].map((x) => ({ lat: x, lon: 0 }));
    const bounds = { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } };
    expect(clusterStations(stations, (station) => ({ x: station.lat, y: 0 }), bounds).flatMap((cluster) => cluster.members)).toEqual(stations.slice(0, 2));
    expect(clusterStations([], () => ({ x: 0, y: 0 }), bounds)).toEqual([]);
  });
  it.each([0, -1, NaN, Infinity])("rejects invalid grid size %s", (size) => {
    expect(() => clusterStations([], () => ({ x: 0, y: 0 }), viewport, size)).toThrow("Invalid map grid size");
  });
});

describe("map aggregation cache", () => {
  it("pans only clip cached buckets without reprojecting records", () => {
    const data = [0, 100, 250].map((x) => ({ id: String(x), lat: x, lon: 0 }));
    const project = vi.fn((item: typeof data[number]) => ({ x: item.lat, y: item.lon }));
    const cache = createMapClusterCache<typeof data[number]>();
    const buckets = cache(data, 10.25, 84, project);
    const first = filterMapClusters(buckets, { min: { x: 0, y: 0 }, max: { x: 100, y: 100 } }, 84);
    const panned = filterMapClusters(cache(data, 10.25, 84, project), { min: { x: 200, y: 0 }, max: { x: 300, y: 100 } }, 84);
    expect(first.flatMap((group) => group.members)).toEqual(data.slice(0, 2));
    expect(panned.flatMap((group) => group.members)).toEqual(data.slice(2));
    expect(project).toHaveBeenCalledTimes(3);
  });
  it("invalidates for new data, actual fractional zoom or grid size", () => {
    const data = [{ lat: 35, lon: 139 }];
    const project = vi.fn(() => ({ x: 1, y: 2 }));
    const cache = createMapClusterCache<typeof data[number]>();
    const original = cache(data, 10, 116, project);
    expect(cache(data, 10, 116, project)).toBe(original);
    expect(cache(data, 10.25, 116, project)).not.toBe(original);
    const replaced = [...data]; cache(replaced, 10.25, 116, project); cache(replaced, 10.25, 84, project);
    expect(project).toHaveBeenCalledTimes(4);
  });
  it("identifies complete membership deterministically without delimiter collisions", () => {
    expect(mapMemberKey("stations", ["b", "a"])).toBe(mapMemberKey("stations", ["a", "b"]));
    expect(mapMemberKey("stations", ["a", "b"])).not.toBe(mapMemberKey("stations", ["a", "c"]));
    expect(mapMemberKey("stations", ["a,b", "c"])).not.toBe(mapMemberKey("stations", ["a", "b,c"]));
    expect(mapMemberKey("stations", ["a"])).not.toBe(mapMemberKey("regions", ["a"]));
  });
});
