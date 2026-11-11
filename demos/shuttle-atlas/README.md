# Shuttle Atlas Sample

Standalone HTML comparison, separate from the production website. Approved A1
and shared-road designs also supply the mini-program atlas through its build script.

Selected design: A1. The default page is back to the horizontal topology, without
design-switching controls. `?layout=schematic` explicitly selects the same layout.
The geographic experiments remain opt-in: `?layout=geographic` for detailed road
curves and `?layout=semi-topology` for the lightly simplified north-up layout.
Archived alternatives remain available through the comparison pages; their links
include `compare=1` to enable design switching.

- `compare.html`: four designs using identical route geometry and source data.
- `compare-a.html`: four refinements of the selected transport-wayfinding direction.
- `index.html?style=a`: transport wayfinding, bilingual labels and solid lines.
- `index.html?style=a2&compare=1`: slimmer lines, centered Chinese labels, no English subtitle.
- `index.html?style=a3&compare=1`: outlined white station nameplates and framed controls.
- `index.html?style=a4&compare=1`: stronger purple/gold branding, gold station markers and label rules.
- `index.html?style=b&compare=1`: paper sketch, calligraphic labels and pencil-like lines.
- `index.html?style=c&compare=1`: night signals, outlined tracks and square station lights.
- `index.html?style=d&compare=1`: campus signposts, purple/gold nameplates and serif labels.

The default and archived designs keep the horizontal topology on mobile and support pan/zoom, route
filtering and SVG export. Changing the design preserves selection and viewport.
Station markers contract to fit visible routes without moving lanes or labels.

Open the HTML files directly, or use the repository's existing local preview server.
Run focused checks with `node demos/shuttle-atlas/test-topology.cjs`.

Source: bundled CUHK transport route data with the September 2026 route scheme.
This is a schematic sample, not a geographically accurate navigation map.

## Geographic Multi-Line Layout (2026-11-02)

`index.html?layout=geographic` uses `geographic.js`. Station anchors are projected
directly from the bundled WGS84 coordinates, north up and east right, using a local
equirectangular projection. Road centerlines come from the existing route paths.
This corrects the relative position and orientation, not just visual styling.

Common source road segments are bundled into parallel colored lanes. Lane order
is kept stable through connected chains; curved joins are supported by actual
route traversals. Offsets and small curve simplifications are diagram treatments,
not new road surveys. Station labels use leaders and collision avoidance without
moving the coordinate anchors. Filters never rebuild or reposition geometry.

This is a web-only prototype. `topology.js`, the purple/gold shared-road map, and
the mini-program build sources remain unchanged. The old multi-line page is at
`index.html?layout=schematic`. Existing comparisons also use the old geometry.

Run `node demos/shuttle-atlas/test-geographic.cjs` for coordinate ordering,
source isolation, source edge coverage, continuous joins and label separation.
Desktop/mobile screenshots are under `output/playwright/atlas-geographic-*`.

### Light Topology Refinement

The opt-in `?layout=semi-topology` removes minor road curves at shared-corridor level, keeping
the north-up campus shape and existing graph connectivity. It does not re-route
individual services. Long bends become a few straight sections with rounded
corners; small turning loops are protected. Display station anchors move with
their original corridor by distance fraction, while source coordinates remain
unchanged. In the current dataset this reduces 352 corridor vertices to 232,
with station display shifts below 50 map units and no overlapping labels.

`test-geographic.cjs` covers both layouts, including lane endpoint orientation,
the same ordered route traversals, geographic regions and source-data isolation.
No mini-program, cloud or production navigation data is changed.

## Shared-Road Junctions (2026-11-02)

`road-map.html` uses directional strokes instead of a thick road with white
centerline cutouts. Curved junction connections come only from consecutive edges
in actual route itineraries. Selection highlights those same connections. Station
nodes stay fixed; arrows avoid the junction curves. The mini-program builder
generates the identical geometry and SVG renderer from `road-map-model.js`.

The current A1 and shared-road pages include shuttle routes 1, 2, 2S, 3, 4, 8,
N and H, plus teaching-day meet-class routes 5, 6A, 6B and 7: 12 routes, 23
stations, 142 ordered legs and 132 route/station memberships. Service filters
separate shuttle and meet-class services; the atlas shows route availability,
not whether a bus is currently running. Archived design comparisons retain their
eight-route snapshots. Checked against the Transport Office on 2026-11-02:
https://transport.cuhk.edu.hk/wp-content/uploads/documents/Meet-Class.pdf

Run `node demos/shuttle-atlas/test-road-map.cjs` to verify route order,
directional continuity, junction membership and station alignment. No change to
navigation geometry, timetables, ETA or the existing arrival/LCD views.
