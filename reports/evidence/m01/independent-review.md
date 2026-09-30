> 🧐 **Reality Checker** | Step 1/1 | 234.1s

---

M0.1 review: **one P2 importer validation gap remains**. Current snapshot data and local Find Fuel behavior are supported by the available evidence.

- **P2 — Manual OSM import can omit the publisher checksum.** [common.py:43](</Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/scripts/importer/common.py:43>) checks MD5 only when supplied; [pipeline.py:56](</Users/haoyuzuo/.codex/worktrees/fuel-find/Fuel Me Japan/scripts/importer/pipeline.py:56>) does not require it. Removing `md5` from otherwise valid metadata silently bypasses the available Geofabrik checksum, contrary to the documented input contract. Require valid publisher MD5 for OSM imports and add missing/mismatched-checksum cases to the existing tests. **This does not invalidate the current snapshot:** its original acquisition evidence includes the matching publisher checksum.

Independently verified through read-only inspection:

- All **141 prices and dates match the original workbook’s D/F/H columns**.
- All **47 partition counts match the parent’s independent geometry results**; all **51 referenced artifacts match their hashes and byte counts**.
- Frozen specifications and historical M0.0 reports are unchanged.
- Existing final evidence records **32 unit, 28 Chromium and 15 importer tests passing**. Relevant source changes precede those records.
- Inspected screenshots across all five locales plus desktop; no visible blocking layout defect found. Code and tests support explicit geolocation, stale-callback guards, manual search without fabricated distances, destination-only navigation, and UNKNOWN handling.

Remaining evidence limits are correctly disclosed: automated official acquisition returns **HTTP 403**; scheduled GitHub execution, an M0.1 deployment, Safari/real-device behavior, actual map handoff, and native-language safety review remain unverified.

Recommendation: fix the checksum gate, record targeted verification, then close **local M0.1 acceptance only** and stop for user review. No writes, test/build execution, browser launches, or live requests were performed in this review.

## Parent resolution, 2026-09-30

The P2 finding was reproduced: absent MD5 was accepted. `verified_input` now requires a valid 32-character publisher MD5 for Geofabrik input, compares it case-insensitively, and rejects missing, malformed or mismatched values. The regression first failed and then passed; all 16 importer/discovery tests pass. The original real PBF and publisher checksum were rechecked by a successful unchanged-input import; the published candidate manifest stayed unchanged. The independent reviewer did not rerun this fix; the parent performed the targeted verification. No other actionable findings were raised. Local M0.1 acceptance is closed; production/scheduled execution/official HTTP403 limits remain as reported.
