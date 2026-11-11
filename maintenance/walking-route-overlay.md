# Walking Overlay Source Geometry

Updated: 2026-11-01. Display data version: `20261101.8-aligned`.

Mini-program rollout is withdrawn at the user's request. The website overlay remains available. The mini-program has no walking toggle/state binding; its optional component defaults off and loads walking data lazily only if explicitly enabled. Retained source data and component support are not authorization to re-enable the feature.

## Source And Scope

- A-E: [CUHK Security Office walking map, 29 August 2025](https://www.scu.cuhk.edu.hk/wp-content/uploads/useful-information/CUHK-Campus-Walking-Routes-Security-Office-29-Aug-2025.pdf), page 1.
- Green connections: the separately calibrated official campus TMS map, retained without geometry changes.
- This is a display overlay. It does not change the walking graph, route searches, bus routes, GPS collection, or ETA.

## Why The Previous Overlay Changed

The earlier A-E geometry stitched together OSM ways and inferred building approaches. That introduced a YIA detour, separated A/B and B/C, moved C/D/E to a library entrance, and extended E past the orange source line. These were not faithful reproductions of the supplied diagram.

Version 7 retained the source shape using endpoint-registered pixel traces, but the schematic bends still drifted away from real roads. Version 8 separates two responsibilities: the official PDF determines the route corridor and topology; the same OSM dataset used to draw the basemap determines its geographic centreline.

`data/walking_routes.source.json` now contains explicitly reviewed, ordered way references. Only shared way vertices connect sections; there is no unconstrained nearest-road snap or invented straight connector. Original page traces remain under `referenceTrace` for audit, excluded from both runtime bundles. Page coordinates use a normalized PDF width of 1888 pixels.

Preserved source topology:

- A ends at B's start beside Madam S.H. Ho Hall.
- B continues west to C's south end, rather than stopping at an inferred museum doorway.
- C's north end, D's start and E's start share the Central Road junction east of the library.
- D includes the LSK lift/bridge corridor, drawn once instead of duplicated by the green overlay.
- E stops where the original orange line stops. It does not add a spur to the water tower or Pavilion of Harmony.

Key alignment corrections:

- A uses the full northbound YIA escalator chain, its upper bridge and Progress Road; it does not use the west exit or the backtracking western path.
- B/C meets at the existing crossing node on University Avenue.
- C follows the east side of the University Mall, then its northern steps to the real Central Road junction.
- D enters LSK before using its lift/bridge corridor. It does not turn onto the bridge where it crosses above Central Road.
- E follows the full curvature of New Asia Road, stopping at the reviewed source extent.

## Accuracy Limits

The official illustration is schematic. Matching the basemap does not establish surveyed entrance coordinates, verified vertical-floor connectivity or current public access. Route lengths are display-centreline lengths, not newly validated navigation distances. The 10/15/5/5/10 minute labels remain the official reference times, not live estimates.

Mapped steps are dashed; conveying steps (escalators) remain solid. Other original green connections keep their source extents, evidence and styling, except the LSK bridge is represented once by D's aligned geometry. Those additional green connections remain approximate, not newly aligned or field-verified.

## Verification

- Deterministic shared-data build; one WGS84 to GCJ-02 conversion for the mini-program.
- Unit tests check every route segment against its selected source way, shared-node continuity, absence of repeated edges, the YIA escalator chain, A/B/C/D/E junctions, source extents and single rendering of the LSK corridor.
- 800 along-line samples are also compared with the simplified geometry used to draw the raster basemap. Maximum offsets: mini-program 2.42m; browser 3.67m. The basemap uses 2.5m simplification; the browser's corner-registered GCJ/WGS raster contributes up to 2.21m of separate projection approximation. These are display-alignment measurements, not real-world positioning accuracy.
- Desktop/mobile browser screenshots and native mini-program light/dark screenshots inspected.
- Native toggle, popup dismissal and return from LCD checked; no GPS or broadcast records written during QA.

Regenerate: `node scripts/build_walking_overlay.js --mini /path/to/miniprogram-project`.

Run: `node scripts/test_walking_overlay.js`, plus the mini-program walking-overlay, alignment and native UI tests.
