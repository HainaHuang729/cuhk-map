# Campus connections and walking references

Reviewed 2026-11-11. This is a local data update, not a deployment record.

## Included

- 41 KMB stops and 32 green-minibus stops, with operator and original stop ID.
- University MTR exits A-D. Names checked against the MTR layout; positions remain attributed JengMap/OSM reference points, not surveyed doorways.
- 25 CUHK landmarks from the official campus database. SWC LT is excluded here because it already has a building identity.
- Attributed student names point to existing building records. Names from owner-only reports and ambiguous medical/fitness aliases are not imported.

Scope for public stops: WGS84 rectangle `[114.195,22.411,114.218,22.426]`, covering CUHK and immediate approaches. This is not a complete Hong Kong transit directory. A same-name stop with a different operator/stop ID remains distinct. Records are searchable, not default map clutter. Public stops, exits and unverified landmark entrances have map-only display and no campus navigation.

## Walking attributes

The current routing graph, costs and ETA model are unchanged. Reference attributes match **578 of 9,742** existing undirected graph segments, including **26 stair segments** and **31 covered segments**. These are graph segments, not counts of separate staircases or covered facilities.

Matching requires full-edge containment, maximum 1.5 m perpendicular distance and about 10 degree directional agreement. Conflicting type, roof or elevation matches are rejected. Inferred lifts, escalators and synthetic connectors are not imported. A geometric match is not a field verification.

The mini-program's selected navigation option shows partial attribute coverage, matched stair/covered lengths and estimated ascent/descent. Unknown segments, endpoint snap connectors and partial edges stay unknown. No report of zero stairs or guaranteed step-free access is generated. The references do not change route selection or walking minutes. Public web route search remains disabled.

## Reproduction and public data

Mini-program builders:

```sh
node scripts/build_campus_connections.js <jengmap-input-directory> <acorn-module-path>
node scripts/build_walking_attributes.js <jengmap-graph.json>
```

Source responses, SHA-256 hashes, exclusions and edge-by-edge matches are in the mini-program's `research/jengmap/2026-11-11/`. The parser only reads a literal array in the CUHK JavaScript file and never executes downloaded code. Downloads are build-time only; clients make no JengMap or public transit API calls.

Web sync: `node scripts/sync_campus_guide.js /path/to/miniprogram-1`.

- [Connections reference database](../data/campus_connections.reference.json)
- [Matched walking attributes, WGS84 GeoJSON](../data/walking_attributes.reference.geojson)
- [Third-party terms and attribution](../THIRD_PARTY_NOTICES.md)

Raw photographs, campus artwork, building polygons, routing code and estimated shuttle models from JengMap are not copied.

## Service directions and room floors

On 2026-11-11, the 73 public stops were enriched from the operators' route and
route-stop catalogues. There are 410 verified stop occurrences across 115
service/direction keys. This is not a count of distinct route numbers. Terminal
and circular-return labels follow actual final stop sequences, never just names.
All stops have some route information; 13 GMB stops disclose partial coverage
because five route IDs returned no route details (22 occurrences withheld).
Search accepts route numbers plus stop names. Lists show a compact preview;
full details preserve all verified directions. No live ETA, public route planning
or default map markers were enabled. The stop IDs and coordinates are unchanged.

The mini-program importer also added 219 AVSU-confirmed room/floor records from
23 building directories, for 247 including LSK. Search and course callouts use
the same lookup. A room number is not treated as a floor: NAH 11 is G/F and
WLS 204 is UG/F. ERB LT retains its two-floor label (8/F & 9/F). Pins remain
existing building anchors, not surveyed room locations or indoor navigation.
Ten missing-floor or differing-prefix entries remain in the source audit, not
guessed into the floor table. The official catalogue is not campus-wide coverage.

Rebuild the mini-program data with `scripts/build_campus_classrooms.js` and a
Cheerio module path, then run the usual `sync_campus_guide.js`. Evidence is in
`research/avsu/2026-11-11/` and `research/jengmap/2026-11-11/` in the source project.
