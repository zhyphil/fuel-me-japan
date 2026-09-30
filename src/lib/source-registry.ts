export function validateRegistry(registry: unknown): string[] {
  if (
    !registry ||
    typeof registry !== "object" ||
    !("sources" in registry) ||
    !Array.isArray(registry.sources) ||
    !registry.sources.length
  )
    return ["A non-empty source registry is required."];
  const errors: string[] = [];
  const ids = new Set<string>();
  for (const raw of registry.sources) {
    if (!raw || typeof raw !== "object") {
      errors.push("Invalid source entry.");
      continue;
    }
    const entry = raw as Record<string, unknown>;
    for (const key of [
      "id",
      "source",
      "owner",
      "sourceUrl",
      "purpose",
      "termsUrl",
      "license",
      "allowedUseAssessment",
      "attribution",
      "refreshPolicy",
      "transformationVersion",
    ]) {
      if (typeof entry[key] !== "string" || !(entry[key] as string).trim())
        errors.push(`Missing ${key}.`);
    }
    for (const key of ["sourceUrl", "termsUrl"]) {
      try {
        if (new URL(String(entry[key])).protocol !== "https:")
          errors.push(`Invalid ${key}.`);
      } catch {
        errors.push(`Invalid ${key}.`);
      }
    }
    const id = String(entry.id);
    if (ids.has(id)) errors.push(`Duplicate source: ${id}.`);
    ids.add(id);
    // Foundation is a registry of candidates, never an authorization to ingest.
    if (entry.productionEnabled !== false || entry.status !== "PENDING_REVIEW")
      errors.push(`M0.0 cannot activate ${id}.`);
    for (const key of ["reviewDate", "fetchedAt", "sourceUpdatedAt"])
      if (entry[key] !== null)
        errors.push(`M0.0 has no verified ${key} for ${id}.`);
  }
  return errors;
}
