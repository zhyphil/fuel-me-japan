# Fuel Japan — M0 Technical Architecture

Static-first; no backend/database without measured need.

Suggested: TypeScript + React static framework or Astro + Cloudflare Pages + static JSON + Browser Geolocation + client Haversine + privacy-conscious analytics.

Runtime: browser → static assets → regional JSON → local filtering/sorting.

No end-user runtime dependency on public Overpass.

Data job: scheduled CI/Worker → fetch/parse/validate → artifacts → deploy.

Navigation is external. M0 never claims driving ETA/distance.

Performance: partition POI; do not ship all Japan POIs to every visitor.

Resilience: ingest failure cannot break production; previous valid datasets remain. External gogo failure cannot block station discovery.

Privacy: location requested only after explicit action; no default precise-location persistence; never put raw precise coordinates in analytics.
