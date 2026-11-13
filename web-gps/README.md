# Web GPS contribution page

Public page: https://hainahuang729.github.io/cuhk-map/web-gps/
Local preview: http://127.0.0.1:8766/web-gps/

The campus viewer stays display-only. Its menu links to this independent,
opt-in foreground collector. Nothing requests or uploads a location on load.
The collector defaults to light mode and has a separate saved theme preference.

## Layout and Collection

- Full-screen campus map with one bottom boarding/alighting action.
- Route and consent appear after boarding; direction is optional and collapsed.
- Pending uploads, export, privacy and theme live in the left menu.
- GPS only starts after consent and browser permission. Only timestamps,
  coordinates and accuracy are stored with route/direction/session metadata.
- Browser coordinates remain `browser_wgs84_unverified`, never silently GCJ-02.
- Foreground only: hiding the page stops collection and saves locally. This is
  an interruption, not evidence that the passenger physically alighted.
- At most 90 minutes / 5,400 points per session, three local pending sessions.
- Periodic IndexedDB saves; reopening recovers but does not resume a recording.
  Browser termination can lose the latest uncommitted seconds. Clearing browser
  data can lose pending records and the upload-only credential.
- Alighting uploads automatically when configured. Interrupted recordings have
  explicit retry/export controls in the pending list. No background upload promise.
- Only a matching complete server acknowledgement permits local removal.
  Network failure, partial completion and rate limiting keep the local copy.

## Cloud Destination and Isolation

Environment: `cloudbase-d1g7dd3ly9e8c04d3`, `ap-shanghai`.

- Function: `uploadWebGps`, 30-second timeout.
- `web_gps_sessions`: manifest, anonymous owner HMAC, status and quota counters.
- `web_gps_sample_chunks`: immutable verified sample chunks, 180 points per chunk.
- Both new collections use ADMINONLY permissions: no client database reads/writes.
- Existing mini-program GPS, boarding and feedback permissions are unchanged.
- CloudBase anonymous login remains disabled. No publishable/admin key, CloudBase
  account or general database/function session is issued to the browser.
- Only the dedicated `/web-gps-upload` HTTP route is exposed. It issues a signed
  upload-only bearer credential and implements authorize/init/chunk/complete.
  There is no track read/list endpoint. Credentials must not be logged or shared.
- A stable server-only random HMAC secret signs credentials and hashes ownership.
  It is never present in this repo or the frontend. Rotating it changes ownership.
- Exact allowed origins are GitHub Pages and the named local preview origin;
  CORS is not authentication or a complete anti-bot defense.
- Gateway limits: 5 requests/sec per client IP and 20/sec total on this route.
  Server limits: four new trips per signed identity/HK day, 160 upload requests
  per identity/day, 100 new identities/day, 3,000 upload requests/day globally.
  Anonymous issuance can be abused and campus users can share IPs; these are
  conservative collection limits, not a guarantee against abuse or all costs.

Completion stores `pending_review`, `contributionEligible:false`. Web uploads do
not broadcast, award mini-program points or directly update ETA. Raw coordinates
and sampled passage events need source-aware review before modelling. Exclude
`manifest.recordPurpose === 'test'` and non-session quota documents from analysis.
Automatic raw-data cleanup has not been configured for these new collections.

## Deployment and Validation

The function, route and collections were deployed on 2026-11-13. Live synthetic
tests verified complete upload, idempotent retry, invalid signature denial,
untrusted-origin denial, separate-owner rejection and absence of a read action.
Only explicitly marked synthetic campus coordinates were uploaded; browser GPS
was not requested. A physical-phone collection test remains necessary.

Keep the server secret in private deployment configuration. Deploy only
`cloudfunctions/uploadWebGps` from the separate mini-program workspace; never
publish that private deployment configuration. To stop new web submissions,
disable this route/server flag and the frontend config, without changing any
existing mini-program policies or deleting pending local records.

`config.js` contains only the public HTTPS endpoint and the feature flag. No
CloudBase JS SDK is loaded. Changes to it do not update an already-open tab;
reload the page before testing a new deployment.

`node scripts/test_web_gps.cjs` covers mock GPS, storage failures, lifecycle,
upload protocol, signatures, reserved database fields, ownership and quotas.
Backend fixtures require the adjacent private mini-program function source;
they do not perform real GPS collection or cloud calls. Real-phone permission,
screen locking and browser termination behavior are not proven by these mocks.

Official reference: https://docs.cloudbase.net/service/access-cloud-function
