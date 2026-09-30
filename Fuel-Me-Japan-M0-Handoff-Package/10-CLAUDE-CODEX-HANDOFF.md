# Fuel Japan — Claude/Codex Execution Brief

Implement the attached M0 specifications exactly.

Priority order:
1. Read 00 through 09 before modifying code.
2. Treat M0 scope and OUT list as authoritative.
3. Build M0.0 then M0.1. Do not begin later milestones until current acceptance criteria pass.
4. Do not introduce a backend/database, authentication, AI, routing engine or live-price scraping.
5. Data provenance and UNKNOWN handling are product requirements, not optional cleanup.
6. gogo.gs is outbound-link-only in M0.
7. OSM attribution and source registry must ship with M0.1.
8. UI locales are exactly en, zh-Hant, ko, zh-Hans, th.
9. Japanese safety labels remain visible regardless of locale.
10. Do not guess vehicle fuel type.

For each milestone, produce:
- implementation
- tests
- build/lint/typecheck results
- data-source/provenance changes
- concise completion report
- explicit list of acceptance criteria and PASS/FAIL

If a required external source cannot be parsed reliably or its usage rights are unclear, STOP that data integration and report the blocker. Do not replace it with scraping or an unapproved source.

After M0.4, stop feature development and hand back for traffic validation.
