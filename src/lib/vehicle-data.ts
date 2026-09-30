import { sha256, validateVehicleData, type VehicleData } from "./vehicle-fuel";
import { hash, object, requireVehicle, token } from "./vehicle-sources";
export interface VehicleArtifact { path: string; bytes: number; sha256: string; version: string }
export interface VehicleManifest { schemaVersion: 1; version: string; registry: VehicleArtifact; mappings: VehicleArtifact }
export function parseVehicleManifest(value: unknown): VehicleManifest {
  const root = object(value, ["schemaVersion", "version", "registry", "mappings"]);
  requireVehicle(root.schemaVersion === 1, "manifest schema"); token(root.version);
  for (const kind of ["registry", "mappings"] as const) {
    const artifact = object(root[kind], ["path", "bytes", "sha256", "version"]);
    requireVehicle(artifact.version === root.version && artifact.path === `/data/vehicles/${kind}-${root.version}.json`, "unsafe artifact path/version");
    requireVehicle(Number.isSafeInteger(artifact.bytes) && Number(artifact.bytes) > 0 && Number(artifact.bytes) <= 2_000_000, "artifact size"); hash(artifact.sha256);
  }
  return root as unknown as VehicleManifest;
}
export async function decodeVehicleArtifact(bytes: Uint8Array, artifact: VehicleArtifact): Promise<unknown> {
  requireVehicle(bytes.byteLength === artifact.bytes && await sha256(bytes) === artifact.sha256, "artifact checksum mismatch");
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
}
// No cache or shared promise: each dialog session/retry owns its request and cancellation.
export async function loadVehicleData(signal: AbortSignal): Promise<VehicleData> {
  async function fetchBytes(path: string, maxBytes: number): Promise<Uint8Array> {
    const response = await fetch(path, { signal, mode: "same-origin", credentials: "omit", redirect: "error", cache: "no-store", referrerPolicy: "no-referrer" });
    requireVehicle(response.ok && !response.redirected, "artifact request failed");
    const bytes = new Uint8Array(await response.arrayBuffer());
    requireVehicle(bytes.byteLength <= maxBytes, "artifact too large");
    return bytes;
  }
  const manifest = parseVehicleManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await fetchBytes("/data/vehicles/manifest.json", 16384))));
  const [registry, mappings] = await Promise.all([manifest.registry, manifest.mappings].map(async (artifact) => decodeVehicleArtifact(await fetchBytes(artifact.path, artifact.bytes), artifact)));
  const data = await validateVehicleData(registry, mappings, manifest.version);
  signal.throwIfAborted(); return data;
}
