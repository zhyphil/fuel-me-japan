import type { BBox, Coordinates } from "./stations";

/** A display anchor, not an administrative centroid or an inferred station. */
export function occupiedCellsAnchor(cells: readonly BBox[]): Coordinates | null {
  if (!cells.length) return null;
  const remaining = new Set(cells.map((_, index) => index));
  let largest: number[] = [];
  const touches = (a: BBox, b: BBox) => a[0] <= b[2] + 1e-8 && a[2] >= b[0] - 1e-8 && a[1] <= b[3] + 1e-8 && a[3] >= b[1] - 1e-8;
  while (remaining.size) {
    const start = remaining.values().next().value!;
    const component = [start];
    remaining.delete(start);
    for (let cursor = 0; cursor < component.length; cursor++) {
      for (const candidate of remaining) {
        if (touches(cells[component[cursor]], cells[candidate])) {
          remaining.delete(candidate);
          component.push(candidate);
        }
      }
    }
    if (component.length > largest.length) largest = component;
  }
  const centers = largest.map((index) => ({ lon: (cells[index][0] + cells[index][2]) / 2, lat: (cells[index][1] + cells[index][3]) / 2 }));
  const mean = centers.reduce((sum, point) => ({ lat: sum.lat + point.lat / centers.length, lon: sum.lon + point.lon / centers.length }), { lat: 0, lon: 0 });
  const distance = (point: Coordinates) => (point.lat - mean.lat) ** 2 + ((point.lon - mean.lon) * Math.cos(mean.lat * Math.PI / 180)) ** 2;
  // Select an occupied cell's center, rather than a mean that might land in a gap.
  return centers.reduce((best, point) => distance(point) < distance(best) ? point : best);
}

export interface PixelPoint { x: number; y: number }
export interface MapCluster<T> { key: string; x: number; y: number; members: T[] }

/** All loaded, filtered records participate; list pagination is deliberately absent. */
export function buildMapClusters<T extends Coordinates>(
  stations: readonly T[],
  project: (station: T) => PixelPoint,
  cellSize = 64,
): MapCluster<T>[] {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw new Error("Invalid map grid size");
  const buckets = new Map<string, MapCluster<T>>();
  for (const station of stations) {
    const point = project(station);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    const bucket = buckets.get(key);
    if (bucket) { bucket.members.push(station); bucket.x += point.x; bucket.y += point.y; }
    else buckets.set(key, { key, x: point.x, y: point.y, members: [station] });
  }
  return [...buckets.values()].map((bucket) => ({ ...bucket, x: bucket.x / bucket.members.length, y: bucket.y / bucket.members.length }));
}

export function filterMapClusters<T>(clusters: readonly MapCluster<T>[], viewport: { min: PixelPoint; max: PixelPoint }, cellSize = 64): MapCluster<T>[] {
  return clusters.filter((bucket) => bucket.x >= viewport.min.x - cellSize && bucket.x <= viewport.max.x + cellSize && bucket.y >= viewport.min.y - cellSize && bucket.y <= viewport.max.y + cellSize);
}

/** Compatibility wrapper; callers that pan should retain the unfiltered aggregation. */
export function clusterStations<T extends Coordinates>(stations: readonly T[], project: (station: T) => PixelPoint, viewport: { min: PixelPoint; max: PixelPoint }, cellSize = 64): MapCluster<T>[] {
  return filterMapClusters(buildMapClusters(stations, project, cellSize), viewport, cellSize);
}

/** One current data/zoom/grid combination per map; panning only clips these buckets. */
export function createMapClusterCache<T extends Coordinates>() {
  let previous: readonly T[] | undefined;
  let zoom: number | undefined;
  let grid: number | undefined;
  let clusters: MapCluster<T>[] = [];
  return (data: readonly T[], actualZoom: number, cellSize: number, project: (item: T) => PixelPoint) => {
    if (data !== previous || actualZoom !== zoom || cellSize !== grid) {
      clusters = buildMapClusters(data, project, cellSize);
      previous = data; zoom = actualZoom; grid = cellSize;
    }
    return clusters;
  };
}

/** Full sorted membership avoids grid-key collisions across splits and merges. */
export function mapMemberKey(kind: string, ids: readonly string[]): string {
  return `${kind}:${JSON.stringify([...ids].sort())}`;
}
