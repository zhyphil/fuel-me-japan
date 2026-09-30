import { isDate, isHttps, isRecord, isSha256, isTimestamp, parseDataManifest, type DataManifest } from "./stations";
/** Pending candidates never authorize ingestion. Approved entries require matching proofs. */
export function validateRegistry(registry: unknown, rawManifest?: unknown): string[] {
  if (!isRecord(registry) || !Array.isArray(registry.sources) || !registry.sources.length) return ["A non-empty source registry is required."];
  const errors: string[] = [];
  if (registry.schemaVersion !== 1 || !["M0.0", "M0.1"].includes(String(registry.milestone))) errors.push("Invalid registry schema/milestone.");
  let manifest: DataManifest | undefined;
  if (rawManifest !== undefined) {
    try { manifest = parseDataManifest(rawManifest); } catch { errors.push("Invalid ingestion manifest."); }
  }
  const ids = new Set<string>();
  const active = new Set<string>();
  for (const entry of registry.sources) {
    if (!isRecord(entry)) { errors.push("Invalid source entry."); continue; }
    for (const key of ["id", "source", "owner", "sourceUrl", "purpose", "termsUrl", "license", "allowedUseAssessment", "attribution", "refreshPolicy", "transformationVersion"]) {
      if (typeof entry[key] !== "string" || !entry[key].trim()) errors.push(`Missing ${key}.`);
    }
    for (const key of ["sourceUrl", "termsUrl"]) if (!isHttps(entry[key])) errors.push(`Invalid ${key}.`);
    const id = String(entry.id);
    if (entry.source !== id) errors.push(`Source identifier mismatch: ${id}.`);
    if (ids.has(id)) errors.push(`Duplicate source: ${id}.`);
    ids.add(id);
    if (entry.productionEnabled === false && entry.status === "PENDING_REVIEW") {
      for (const key of ["reviewDate", "fetchedAt", "sourceUpdatedAt"]) if (entry[key] !== null) errors.push(`Pending source has unverified ${key}: ${id}.`);
      if (entry.transformationVersion !== "not-ingested" || entry.inputSha256 !== undefined || entry.manifestPath !== undefined) errors.push(`Pending source has ingestion proof: ${id}.`);
      continue;
    }
    if (entry.productionEnabled !== true || entry.status !== "APPROVED" || registry.milestone !== "M0.1" || !["osm", "geofabrik", "meti-prices"].includes(id)) { errors.push(`Unapproved production source: ${id}.`); continue; }
    active.add(id);
    if (!isDate(entry.reviewDate)) errors.push(`Missing/invalid reviewDate: ${id}.`);
    if (!isTimestamp(entry.fetchedAt)) errors.push(`Missing/invalid fetchedAt: ${id}.`);
    if (!(isTimestamp(entry.sourceUpdatedAt) || isDate(entry.sourceUpdatedAt))) errors.push(`Missing/invalid sourceUpdatedAt: ${id}.`);
    if (!isHttps(entry.licenseUrl) || !isHttps(entry.ingestedSourceUrl)) errors.push(`Missing/invalid license or ingestion URL: ${id}.`);
    if (!isSha256(entry.inputSha256) || entry.manifestPath !== "/data/manifest.json" || entry.transformationVersion === "not-ingested") errors.push(`Missing/invalid ingestion proof: ${id}.`);
    const proof = manifest?.sources.find((source) => source.sourceId === id);
    if (!proof) errors.push(`Approved source requires matching manifest: ${id}.`);
    else {
      for (const key of ["fetchedAt", "sourceUpdatedAt", "transformationVersion", "inputSha256"] as const) if (entry[key] !== proof[key]) errors.push(`Manifest ${key} mismatch: ${id}.`);
      if (entry.ingestedSourceUrl !== proof.sourceUrl) errors.push(`Manifest sourceUrl mismatch: ${id}.`);
    }
    if (isHttps(entry.ingestedSourceUrl)) {
      const url = new URL(entry.ingestedSourceUrl);
      if (id === "meti-prices" ? !/^https:\/\/www\.enecho\.meti\.go\.jp\/statistics\/petroleum_and_lpgas\/pl007\/xlsx\/\d{6}\.xlsx$/.test(url.href) : !/^https:\/\/download\.geofabrik\.de\/asia\/japan-\d{6}\.osm\.pbf$/.test(url.href)) errors.push(`Unreviewed ingestion URL: ${id}.`);
    }
    const license = id === "meti-prices" ? "https://www.digital.go.jp/resources/open_data/public_data_license_v1.0" : "https://opendatacommons.org/licenses/odbl/1-0/";
    if (entry.licenseUrl !== license) errors.push(`Unreviewed license: ${id}.`);
  }
  for (const proof of manifest?.sources ?? []) if (!active.has(proof.sourceId)) errors.push(`Ingested source is not approved: ${proof.sourceId}.`);
  return errors;
}
