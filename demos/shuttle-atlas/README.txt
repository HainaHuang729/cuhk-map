CUHK Shuttle Atlas / independent HTML sample

Open index.html directly, or use the existing repository preview server:
http://127.0.0.1:8766/demos/shuttle-atlas/

Current A1 and shared-road scope: 1, 2, 2S, 3, 4, 5, 6A, 6B, 7, 8, N and H.
Archived style comparisons keep the eight shuttle routes. No paid minibuses.
The diagram reads the existing public bus data and applies the 2026-09 scheme
to a clone. The mini-program atlas is generated from these approved designs;
the production map, original route data and ETA models are untouched.
There are no location requests, cloud calls, broadcasts or synthetic ETAs.

Topology is schematic, not a geographic navigation map. Every consecutive
stop pair is explicitly connected. Repeated visits remain in the itinerary.
Conditional stops are shown with dashed adjacent segments and itinerary notes.
Station relocation notices do not imply changes to this topological layout.
This is a local data snapshot, not a live transport-status or timetable feed.

Desktop and mobile share the same horizontal topology. Phones start at a closer
view and support pan/pinch zoom; Fit returns to the complete network. No station
or line is transposed for a portrait screen. Capsule length follows visible lanes:
a single route becomes a circle; inactive stops retain only a faint label.
Line geometry and label positions remain fixed during selection.
Click a route or station; click empty space to clear. Zoom, pan and SVG export
are available. Keyboard: +/- zoom, 0 fit, Escape clear, Enter/Space select stop.
Reduced-motion settings are respected. Lucide icons use the existing local copy.

Verification: node demos/shuttle-atlas/test-topology.cjs
