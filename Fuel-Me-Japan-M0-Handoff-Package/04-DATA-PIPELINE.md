# Fuel Japan — M0 Data Pipeline

## OSM
Geofabrik extract → checksum where available → filter amenity=fuel → resolve coordinates → normalize brands while retaining originals → preserve UNKNOWN → partition → validate → versioned static JSON → deploy.

Validation gates:
- Japan coordinate bounds
- stable ID uniqueness
- coordinates present
- valid enums
- non-empty output
- anomalous station-count changes block automatic promotion

## Official price
Scheduled fetch → detect survey/publication date → parse → validate expected coverage and numeric sanity → reject older replacement → version snapshot → promote latest only after PASS.
Failure = retain last-known-good.

## Suggested output
/public/data/prices/latest.json
/public/data/prices/archive/YYYY-MM-DD.json
/public/data/stations/<region>.json
/public/data/rental/locations.json
/public/data/vehicles/fuel-mapping.json

## Refresh
Official price: several checks around publication day, no-op if unchanged.
OSM: weekly M0 rebuild.
Rental/vehicle mappings: manual/versioned initially.
gogo mappings: versioned URLs only; zero price fetching.

Every build emits a provenance manifest.
