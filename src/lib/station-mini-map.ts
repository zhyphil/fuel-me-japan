import type { Coordinates } from "./stations";

export interface MiniMapTile { x: number; y: number; z: number; left: number; top: number }
// A fixed neighbourhood scale: these previews do not instantiate interactive maps.
const zoom = 14;
const tileSize = 256;
const tilesPerSide = 2 ** zoom;

export function stationMiniMapTiles({ lat, lon }: Coordinates, width: number, height: number): MiniMapTile[] {
  if (![lat, lon, width, height].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || width <= 0 || height <= 0 || width > 2048 || height > 2048) return [];
  const radians = Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI / 180;
  const centerX = (lon + 180) / 360 * tilesPerSide * tileSize;
  const centerY = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * tilesPerSide * tileSize;
  const left = centerX - width / 2;
  const top = centerY - height / 2;
  const tiles: MiniMapTile[] = [];
  // Only intersecting tiles, without a buffer or adjacent-neighbour prefetch.
  for (let y = Math.max(0, Math.floor(top / tileSize)); y < Math.min(tilesPerSide, Math.ceil((top + height) / tileSize)); y++) {
    for (let x = Math.max(0, Math.floor(left / tileSize)); x < Math.min(tilesPerSide, Math.ceil((left + width) / tileSize)); x++) {
      tiles.push({ x, y, z: zoom, left: x * tileSize - left, top: y * tileSize - top });
    }
  }
  return tiles;
}
