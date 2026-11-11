# University Station Trains

Deployed 2026-11-11 17:16 HKT: `getMtrArrivals` now uses server-only collection
`mtr_arrival_cache`, fixed document `EAL_UNI_v1`, 30-second TTL and transaction
lease/fencing, with shared exponential failure cooldown and HTTP Retry-After.
This is demand-driven only, with no timer/trigger. Collection created with
ADMINONLY client rules; wx-server-sdk installed remotely. Active Nodejs16.13,
15-second timeout verified. Two cloud calls returned both directions with four
trains each and identical fetchedAt; second call took 138 ms (request
10e7057d-ddb1-11f1-ab0c-525400ffa2f7). Production load/failure injection not tested;
lease contention, 429 and recovery are covered by local simulated tests.
The standalone web page still uses the official endpoint directly and is not
part of this mini-program cloud cache; a read-only HTTP integration is separate.

Detail layout: both directions show every returned upcoming train immediately
(up to four per direction); no outer More toggle. Destination, ETA/time and
platform use fixed aligned columns; only the nearest row has a subtle tint.
Static station sections remain individually collapsible below the timetable.
The map preview still shows only one train per direction. Native simulator
screenshots use explicit eight-train test fixtures, not live schedule claims.

Map interaction: the persistent University Station marker opens a compact callout/popup with the nearest train in each direction, actual destination/platform and a Details action. Only Details opens the full station page/sheet. Shared parser/poller now lives in mini `data/mtrArrivals.js`; `pages/mtr/arrivals.js` re-exports it so the map never synchronously imports a subpackage. Preview polling is active only while selected/visible and stops on dismissal, selection change, hide or unload. Browser smoke checks use explicit mock data to verify the popup-to-details flow and no requests after closing. Native true-device visual QA remains separate.

## Static Station Details

Extended: official layout PDF and street-map links (link only, not republished); A/B/C/D exit orientation; destination selection with terminus-based direct-train filtering; local service-day first/last-train notices (03:00 rollover, 45-minute last-train window); safe official HTTPS arrangement link. Live read failure, missing data or stale feed never implies normal service or confirmed suspension. Unit tests cover turnbacks, branches, midnight, server clock and untrusted URLs. Native PDF download needs `https://www.mtr.com.hk` in the mini-program downloadFile domain allowlist; download/open failure offers an explicit copy-link fallback. This is not a new cloud function. True-device PDF preview remains to be checked. Map bottom vehicle dock is removed on both clients; arrivals view and LCD remain.

Verified 2026-11-11 against official University Station service-hours and accessibility pages and the official fares CSV. `pages/mtr/station.js` is shared with web `assets/mtr_station.js`. Collapsed sections show opening hours, five destination-specific first/last trains (after-midnight times explicitly marked next day), confirmed exit/accessibility facilities, and seven common destinations' adult/student Octopus and adult single-ticket ordinary-class fares. Student qualification and non-live facility status are stated. These bundled snapshots require a release to update; no new cloud requests or functions. Run `node scripts/test_mtr_station.js` in the mini project. Do not infer congestion, live lift availability, or special-service timetables from these snapshots.

Implemented locally on 2026-11-11. Mini-program and web share the parser/poller:
`miniprogram/pages/mtr/arrivals.js` -> `assets/mtr_arrivals.js` via `sync_campus_guide.js`.

Official sources: [dataset](https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data),
[dictionary](https://opendata.mtr.com.hk/doc/Next_Train_DataDictionary_v1.7.pdf),
[API specification](https://opendata.mtr.com.hk/doc/Next_Train_API_Spec_v1.7.pdf).

- Fixed request: `https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=UNI&lang=TC`.
- Open a University Station exit from search or its map marker to read trains.
- Up to four trains per direction, actual destination and platform from MTR.
- Respect `timeType` (observed response) and `timetype` (dictionary): A arrival, D departure. Unknown type stays neutral. `route=RAC` is via Racecourse. `ttnt` and `valid` are dummy fields, not ETA labels.
- Dates are interpreted in Hong Kong time. Relative minutes derive from the official absolute time, not the shuttle ETA model. Cloud server time anchors client calculations.
- Refresh every 30 seconds only while the preview/detail is visible; stop on close, page hide or unload. Network failures retry after 30 seconds. No location collection, local persistence, background timer or new collection. The official upstream refresh rate and 10-second cloud warm cache are unchanged.
- Missing/expired timestamps, alerts and failed requests do not retain a misleading countdown. Data more than two minutes old is hidden. Empty trains are not described as a suspension.
- The native page is a lazy subpackage with normal navigation, light/dark appearance and existing large-text settings. The web uses the existing detail sheet and the endpoint's CORS support.

## Mini-program Deployment

Deploy `cloudfunctions/getMtrArrivals` before uploading a mini-program version:
select the existing cloud environment, then upload/deploy the function with cloud dependency installation. The package has no third-party dependencies; only Node HTTPS is used. Set timeout to **15 seconds** (upstream deadline is 8 seconds). No database permission or request-domain change is required because the mini-program uses `wx.cloud.callFunction`.

The function only fetches the fixed University Station URL, ignores user-selected URLs and coalesces requests with a 10-second warm-instance memory cache. This is not a shared cross-instance database cache. It never reads user identity, GPS or private data. There is no timed trigger.

Local tests: `node scripts/test_mtr_arrivals.js` in the mini-program project, the existing release-readiness tests, and web mobile/light/dark checks. A successful local HTTPS call is not proof of a deployed cloud function; cloud deployment and a true-device smoke test are separate release steps.

## Deployment Verification: 2026-11-11

Deployed through WeChat DevTools CLI to the existing shuttle environment. Actual runtime: Nodejs16.13, 256 MB. The initial DevTools deployment ignored the local timeout setting and created a 3-second timeout; changed it to 15 seconds in the cloud console and verified with the CLI.

Cloud requests initially hit the bounded 8-second upstream timeout, including a confirmed TLS negotiation stall. IPv4 alone did not resolve it. Pinning TLS 1.2, with normal certificate and hostname verification, produced an official response with `ok:true`, `status:1` and four trains in each direction. No alternate source, plaintext HTTP, hard-coded IP or proxy was introduced. Only allowlisted error reasons and connection phases are returned for diagnostics.

Verified request: `0eac15f3-dda0-11f1-9387-5254005dc47f`, log time 15:18:13 Hong Kong, platform status 200, duration 3811 ms, official update 15:17:59. The test panel's failure heading conflicted with the successful response; the matching execution log confirmed success. One successful call does not establish long-term availability. No new database, trigger, gateway or permissions were created. Mini-program upload, real-device verification and web publication remain separate and were not performed.
