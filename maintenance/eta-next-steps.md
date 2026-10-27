# ETA Calibration: Ordered Work Plan

Status date: 2026-10-26. No automatic model changes or promotion.

Release update (2026-10-27): mini-program development version 2026.10.27.1 uploaded successfully with departure-anchored timing and stable marker identity across selection changes. No review submission or production release was performed. Default and cloud prediction models remain v10. Web/mini parity checks pass for 20 vehicle states and 252 station queries; physical-device verification and a new prospective validation protocol remain pending. The historical notes below describe the preceding audit, not proof of improved prediction accuracy.

## 1. Runtime Semantics and Rollback

- Completed: 1,840 v10/v11 comparisons between frozen evaluator, local web runtime and local mini-program wrapper. Tested weekday 11:29:59, 11:30:00, 13:59:59, 14:00:00 and Saturday lunch. Includes every route stop occurrence.
- Confirmed risk: v11 changes downstream offsets by up to 90 seconds at the lunch boundaries. In a synthetic grid of 161 elapsed times (0 to 40 minutes, 15-second steps), 98 cases move backwards at 11:30 despite one second elapsing. This is a simulated mechanism check, not 98 observed vehicles. v10 has no profile offset jump.
- Completed after user continuation: restored v10 in cloud configuration version 12, verified by readback with non-ETA fields unchanged. Local web/mini defaults and the example cloud configuration also restored. Frozen v11 remains unchanged for offline comparison; any new mechanism needs a separately versioned candidate and freeze.
- Completed: rollback patch construction and cloud read-only dry run. Restoring model v10 must increase the configuration version (currently 11 to 12); never roll configuration version backwards.
- Not verified: a physical phone actually loading v11. Local source parity and a cloud readback do not establish the published client build, cached model or on-device state. Current source refreshes on page load/show, with a five-minute throttle and a 24-hour cache age; failures are silently caught.

Rollback preparation (does not write):

```sh
node scripts/publish_term_model.mjs BASELINE_ETA_PATCH_JSON NEW_PRIVATE_BACKUP_DIRECTORY
```

Only after an explicit rollback decision, use a fresh directory and add `--publish`. The existing publisher backs up current configuration, uses an optimistic version check, updates only ETA/version/timestamp fields, then reads back and compares all unrelated fields. Production rollback has now been executed and read back; a physical phone's loaded model/cache remains unverified.

Offline next candidate: anchor each scheduled trip's profile at its departure time, and use that anchor consistently for duration, position, station arrivals and next-stop ETA. This removes mid-trip bucket changes by construction, but shifts the interpretation from stop-time conditions to departure-time conditions. Do not infer missing departure times from old ETA or label a boarding-only residual comparison as actual client performance. New arrival queries must compute offsets per candidate departure rather than once outside the departure loop. Existing real-time GPS and departure-matching paths need separate integration tests before deployment.

Offline prototype test completed: seven departure anchors, 529 states and 522 adjacent comparisons; minute-spaced full-trip samples plus one-second samples within 30 seconds of the lunch boundaries. No backwards progress or fixed-offset jumps, and station-arrival calculations agree with vehicle ETA. This uses local runtime functions with an injected fixed anchor, not a production integration or accuracy test. Production runtime remains unchanged; cloud now uses v10.

Local integration completed subsequently (not uploaded): scheduled vehicles and station queries select profiles per departure; navigation carries the selected arrival's prediction anchor; broadcast matching carries the matched vehicle anchor. GPS boarding sessions use the boarding timestamp only as a profile anchor, not as an inferred scheduled departure. Integration tests cover 20 vehicle states and 252 stop queries across v10 and frozen v11 inputs, weekday lunch boundaries, Saturday, Hong Kong midnight and mini-program execution without Intl. Time inputs/ETA match across web and mini; coordinate-derived progress is allowed a small projection difference between WGS84 and GCJ-02.

Regression results: ETA, broadcast and temporary-transport tests pass. The wider mini-map refresh suite stops on an unrelated search-row layout assertion (47.5 vs 48 pixels); this UI code was not modified in the timing work, and the full suite is not claimed to pass. Physical-device checks remain pending. The earlier paired protocol is untouched: its full source-file geometry hash intentionally rejects this edited runtime file. Do not bypass that guard or reuse historical validation claims for this new runtime; prepare a separately reviewed release protocol before scoring/deploying the new mechanism.

## 2. Fresh Snapshot and Paired Validation

- Completed: read-only October 26 export with all collection counts verified. GPS cores (1,790) and chunks (1,803) are unchanged by ID and content; broadcasts increased from 2,222 to 2,225. All historical local supplements were retained.
- Implemented: frozen paired validation and exact-ID/track linkage. Reuse the original paired protocol; do not restart the freeze on each import.
- Implemented: all/affected cohorts, both with and without the pre-existing >80 km/h route-distance/time conflict flag. Report per-service-day summaries and latest observations. No confidence intervals while independent vehicle-run clusters are unverified.
- Completed: three new broadcasts (two route 8, one route 3), two eligible presence constraints and one ineligible under the existing presence rule (recorded station distance 115 m). Total presence records 3,809, eligible subset 2,866; these are not independent trips or arrival labels. No new GPS recordings, post-freeze paired observations or affected paired observations. Metrics remain null. Latest GPS recording starts October 15; latest main-term boarding-to-arrival validation observation remains October 6.

## 3. Identifiability Before Hierarchical Training

- Completed on the October 25 snapshot: segment selection waterfall 543 total -> 168 current-term/current-route -> 112 direct -> 84 eligible, from 44 passenger recordings.
- Completed: 43 eligible dwell observations out of 331 overall; 142 overall records are ride-end censored. These are different denominators, not mutually exclusive classes.
- Completed: 47 candidate station-zone-exit to next-zone-entry intervals across 25 recordings, 4 carrying flags. They are not verified pure driving intervals.
- Pending: inspect sampling/accuracy around entry and exit, overlapping station zones, turnarounds, ride-start/end censoring and low-motion clusters. Do not split driving and dwell unless the event definitions support it.
- Deferred: partial-pooling model training, uncertainty estimation and deployment until event quality and independent validation are defensible.

All private reports remain outside public repositories. Maintenance scripts do not add cloud calls or app package size at runtime.
