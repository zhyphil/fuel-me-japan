# Fuel Japan — M0 Data Sources

## Official regional prices
Japan Agency for Natural Resources and Energy / METI petroleum-product price survey.
Purpose: prefectural benchmark only, never station-live price.
Refresh: scheduled checks around weekly publication; last-known-good retained on failure.

## Station POI
Primary database: OpenStreetMap.
Ingestion distribution: Geofabrik Japan/sub-region extracts.
Filter: `amenity=fuel`.
Useful optional tags: name, brand, operator, opening_hours, self_service, fuel:*, payment:*, address, coordinates.
Missing = UNKNOWN.

## gogo.gs
Outbound public station-page deep links only.
Store `gogoUrl`; do NOT scrape/cache/republish gogo prices in M0.

## Rental information
Use authoritative rental-company sources for return rules/locations and verified vehicle fuel mapping where permitted.
Never infer fuel from ambiguous model names.

## Navigation
External Google Maps / Apple Maps URL. No M0 routing engine.

## Required provenance
source, sourceUrl, fetchedAt, sourceUpdatedAt when available, refreshPolicy, license/terms reference, transformationVersion.
