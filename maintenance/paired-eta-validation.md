# Paired ETA Validation

This local-only workflow compares frozen v10 and v11 predictions with new observed boarding-to-stop-zone intervals. It does not train, publish, or automatically revert models. It adds no client or cloud load.

## Freeze Once

Run from the web repository. Keep all inputs and outputs outside application repositories:

```sh
node scripts/validate_dwell_trial.mjs DATASET_JSON RAW_SNAPSHOT_DIRECTORY NEW_PRIVATE_OUTPUT
```

The initial snapshot directory must contain `ride_gps_sessions.json`, `ride_gps_sample_chunks.json`, and the reviewed `term-model-release/prediction-model.json` v10 baseline. The current local model must be v11. The generated `paired-protocol.json` freezes both model objects, the client prediction runtime, route geometry hashes, known recording IDs and exact-track fingerprints. Preserve this file; do not re-freeze for each new batch.

## Score New Snapshots

```sh
node scripts/validate_dwell_trial.mjs NEW_DATASET_JSON NEW_RAW_SNAPSHOT_DIRECTORY NEW_PRIVATE_OUTPUT ORIGINAL_PAIRED_PROTOCOL_JSON
node scripts/test_dwell_validation.mjs
```

New whole recordings must start after the freeze, have a recorded end covering the target event, belong to the main term and matching route scheme, and not be known by ID or exact fingerprint. Score before including new recordings in any training. A geometry change blocks comparison until separately reviewed.

## Linkage and Interpretation

- Explicit recording IDs connect observations. Raw core IDs also resolve chunk parents. Unresolved and ambiguous links remain in the private report.
- Identical nonempty GPS payloads, route and recording bounds under different IDs count as one recording. Conflicting IDs and conflicting duplicate labels are held for review; originals are not modified.
- Independent boarding broadcasts without a recording ID remain presence constraints, never invented arrival labels.
- No fuzzy merging of nearby people, timestamps, or tracks. Separate passenger recordings on the same physical bus may still be correlated. Recording count is not verified vehicle-trip count.
- Paired scores use the actual frozen runtime's Hong Kong current-time bucket, including v11 weekday lunch. This differs from the earlier exploratory stop-arrival-time-conditioned calculation.
- Boarding-to-zone-entry error is not exact door-open ETA. Unknown remaining dwell after boarding is not reconstructed from old predictions.
- Both models score the same observations. Primary results retain review flags, including distance-time conflicts. Unmatched intervals and duplicates are reported separately.
- Report observation MAE, recording-balanced MAE, median, P90 and signed bias. Group by route, ordered stop indices and day/time bucket; repeated stops are never merged by name. Each coverage group reports its latest observed date, separately from the snapshot date.
- Zero qualifying observations means null errors and `awaiting_new_independent_journeys`, not zero error or proof of improvement.

Outputs contain private linkage records and must not be committed or deployed. All raw data are preserved. The production v11 trial remains unchanged by this workflow.
