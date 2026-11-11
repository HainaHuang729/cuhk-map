const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const data = require('../data/campus_walkways');
const source = require('../data/walking_connections.source.json');
const routeSource = require('../data/walking_routes.source.json');
const coordinates = require('../assets/campus_coordinates');
const file = path.join(root, 'data/campus_walkways.js');
const before = fs.readFileSync(file);
execFileSync(process.execPath, [path.join(__dirname, 'build_walking_overlay.js')]);
assert(before.equals(fs.readFileSync(file)), 'Walking display build must be deterministic');
assert.equal(data.coordinateSystem, 'WGS84');
assert.equal(data.connections.length, 12);
assert.equal(data.network.length, 769);
assert.equal(new Set(data.network.map(p => p.id)).size, data.network.length);
assert.equal(new Set(data.connections.map(p => p.id)).size, data.connections.length);
for (const p of [...data.network, ...data.connections]) {
  assert(p.coords.length >= 2, p.id);
  for (const c of p.coords) {
    assert(c.length === 2 && c.every(Number.isFinite), p.id);
    assert(c[0] > 114.19 && c[0] < 114.23 && c[1] > 22.40 && c[1] < 22.44, p.id);
    const restored = coordinates.toWgs84(coordinates.toGcj02(c));
    assert(Math.max(...c.map((n, i) => Math.abs(n - restored[i]))) < 1e-8, p.id);
  }
}
for (const c of data.connections) {
  assert.equal(c.routingEnabled, false, 'Map lines alone cannot establish traversability');
  assert.equal(c.status, 'entrances-unverified');
  assert(c.lengthMeters > 10 && c.lengthMeters < 180);
  for (const end of ['start', 'end']) {
    assert(c.endpointAudit[end].distance < 30, 'Registration should agree with nearby walking features');
    assert(data.network.some(p => p.id === c.endpointAudit[end].id));
  }
  assert.equal(c.coords.length, source.connections.find(p => p.id === c.id).pixels.length);
  const reconstructed = c.sections.flatMap(s => s.coords.slice(0, -1)).concat([c.sections.at(-1).coords.at(-1)]);
  assert.deepEqual(reconstructed, c.coords, 'Step styling must preserve the full geometry');
  for (const section of c.sections) {
    assert.deepEqual(section.coords, c.coords.slice(section.from, section.to + 1));
    if (section.kind === 'steps') {
      assert(c.stepSections.some(s => section.from >= s.from && section.to <= s.to));
      for (const evidence of c.stepSections) {
        assert(evidence.sourceWayIds.every(id => data.network.some(p => p.id === id && p.kind === 'steps')));
      }
    }
  }
}
assert.equal(data.connections.flatMap(c => c.sections).filter(s => s.kind === 'steps').length, 8);
assert.equal(data.connections.find(c => c.id === 'library-united-path').sections[0].kind, 'steps');
assert.deepEqual(data.connections.find(c => c.id === 'science-courtyard-path').sections.map(s => s.kind), ['steps','walkway']);
assert.deepEqual(data.connections.find(c => c.id === 'basic-medical-path').sections.map(s => s.kind), ['steps','walkway']);
const bridge = data.connections.find(c => c.id === 'lsk-footbridge');
assert(bridge.sections.every(s => s.kind === 'footbridge'));
assert(data.connections.filter(c => c.kind === 'building-link').every(c => c.sections.every(s => s.kind === 'building-link')));
assert.equal(data.displayPaths.length, 13);
assert.equal(new Set(data.displayPaths.map(p => p.id)).size, data.displayPaths.length, 'One visible record per green section');
assert(data.displayPaths.every(p => p.source === 'official' && !p.wayId), 'Do not display the surrounding OSM network');
const rawNetwork = JSON.parse(fs.readFileSync(path.join(root, 'data/cuhk_roads_poi_coffee_tea_clipped.geojson'), 'utf8'));
const rawById = new Map(rawNetwork.features.map(f => [f.properties['@id'], f]));
for (const way of data.network) assert.deepEqual(way.coords, rawById.get(way.id).geometry.coordinates, 'Preserve existing paths as audit evidence only');
for (const c of data.connections) c.sections.forEach((section, index) => {
  const displayed = data.displayPaths.filter(p => p.connectionId === c.id && p.sectionIndex === index);
  if (c.id === 'lsk-footbridge') {
    assert.equal(displayed.length, 0, 'D includes the green bridge; never draw it twice');
    assert.equal(data.routeSections.filter(s => s.coveredConnectionIds.includes(c.id)).length, 1);
    return;
  }
  assert.equal(displayed.length, 1, 'Draw each original green section exactly once, including matched sections');
  assert.deepEqual(displayed[0].connectionIds, [c.id]);
  assert.deepEqual(section.coords, c.coords.slice(section.from, section.to + 1), 'Do not extend lines beyond the green source trace');
});
const displayedSections = data.displayPaths.map(p => data.connections.find(c => c.id === p.connectionId).sections[p.sectionIndex]);
assert.equal(displayedSections.filter(s => s.kind === 'steps').length, 8);
assert.equal(displayedSections.filter(s => s.kind !== 'steps').length, 5);
assert.deepEqual(data.routes.map(r => r.id), ['A','B','C','D','E']);
assert.deepEqual(data.routes.map(r => r.minutes), [10,15,5,5,10]);
assert(data.routes.every(r => r.routingEnabled === false && r.via.length === 3 && r.lengthMeters > 100));
assert.equal(new Set(data.routeSections.map(s => s.id)).size, data.routeSections.length);
assert(data.routeSections.some(s => s.kind === 'escalator' && s.routeIds.includes('A')));
assert(data.routeSections.some(s => s.kind === 'steps' && s.routeIds.includes('C')));
assert(data.routeSections.some(s => s.kind === 'lift-link' && s.routeIds.includes('D')));
const sections = Object.fromEntries(data.routeSections.map(s => [s.id,s]));
const ends = Object.fromEntries(data.routes.map(r => [r.id, [sections[r.sectionIds[0]].coords[0], sections[r.sectionIds.at(-1)].coords.at(-1)]]));
assert.deepEqual(ends.A[1], ends.B[0], 'Original A/B junction must be connected');
assert.deepEqual(ends.B[1], ends.C[0], 'B must extend to C, not end at an inferred museum entrance');
assert.deepEqual(ends.C[1], ends.D[0], 'C/D junction is on Central Road');
assert.deepEqual(ends.C[1], ends.E[0], 'C/E shares the same junction, not a library-door detour');
assert.equal(ends.E[1][0], 114.2080769, 'Do not extend E beyond the original orange line');
assert.deepEqual(ends.B[1], [114.2055538,22.4187318], 'B/C meets at the real University Avenue crossing');
assert.deepEqual(ends.C[1], [114.2056367,22.41988], 'C/D/E meets at the real Central Road junction');
const routeWays = id => data.routes.find(r => r.id === id).sectionIds.map(id => sections[id].sourceWayId);
for (const id of ['way/1426636966','way/923320417','way/1426636974','way/1426636976','way/1426636978','way/1426636972','way/201907978']) {
  assert(routeWays('A').includes(id), 'A must follow the complete escalator corridor and north bridge');
}
assert(!routeWays('A').includes('way/1426636969') && !routeWays('A').includes('way/1426728928'), 'Never divert A via the west exit/backtracking path');
assert(!routeWays('C').includes('way/1072300311'), 'C must not detour to the library door');
assert(routeWays('C').includes('way/230238514') && routeWays('C').includes('way/230238509'));
assert(routeWays('D').includes('way/1492178660') && routeWays('D').includes('way/188010214'), 'Access the bridge via LSK, not its crossing over Central Road');
for (const route of data.routes) {
  let previous = null;
  const usedEdges = new Set();
  assert(!route.referenceTrace, 'Do not ship paper coordinates to the runtime');
  for (const id of route.sectionIds) {
    const section=sections[id], raw=rawById.get(section.sourceWayId), [from,to]=section.sourceRange;
    const expected=raw.geometry.coordinates.slice(from,to+1);
    if (section.coords[0][0] !== expected[0][0] || section.coords[0][1] !== expected[0][1]) expected.reverse();
    assert.deepEqual(section.coords,expected, 'Every displayed vertex and intervening segment must lie on the basemap corridor');
    assert(!['no','private'].includes(raw.properties.foot));
    if (previous) assert.deepEqual(previous, section.coords[0], 'Only join at existing shared nodes, not nearby lines');
    previous=section.coords.at(-1);
    for(let i=1;i<section.coords.length;i++) {
      const key=[section.coords[i-1].join(','),section.coords[i].join(',')].sort().join('/');
      assert(!usedEdges.has(key), 'No immediate or later retracing of the same edge');
      usedEdges.add(key);
    }
  }
}
for (const route of routeSource.routes) {
  assert(route.referenceTrace?.length, 'Preserve the original paper tracing for provenance, not display');
}
for (const section of data.routeSections) {
  assert(section.coords.length >= 2 && section.coords.every(p => p.every(Number.isFinite)));
  assert(section.routeIds.every(id => data.routes.some(r => r.id === id)));
  assert.equal(section.geometrySource, 'osm-corridor');
}
assert(bridge.coords[0][0] > 114.203 && bridge.coords[0][0] < 114.205);
assert(bridge.coords[0][1] > 22.419 && bridge.coords[0][1] < 22.421);
assert(data.network.some(p => p.kind === 'steps'));
assert(!data.network.some(p => ['motorway', 'cycleway', 'construction'].includes(p.kind)));
const moduleCode = fs.readFileSync(path.join(root, 'assets/campus_walkways.js'), 'utf8');
new vm.Script(moduleCode);
assert(!/WALKING_GRAPH|CUHK_CAMPUS_WALKING|localStorage|fetch\(/.test(moduleCode), 'Display module must not mutate navigation or collect location');
assert(moduleCode.includes('script.onerror = fail'));
assert(moduleCode.includes('token !== request'));
assert(moduleCode.includes("dashArray:steps ? '5 5' : null"));
assert(moduleCode.includes('if (!steps) L.polyline'), 'A solid centre stroke must not cover step dashes');
assert(moduleCode.includes('data.displayPaths.forEach'), 'Render the unified display list');
assert(!moduleCode.includes('data.network.forEach') && !moduleCode.includes('data.connections.forEach'), 'Do not render separate duplicate layers');
assert(moduleCode.includes('weight:steps ? 3 : 4'), 'One stroke width per path type');
const ui = fs.readFileSync(path.join(root, 'assets/campus_guide_ui.js'), 'utf8');
assert.equal((ui.match(/data-action="toggle-walkways" aria-pressed=/g) || []).length, 1);
assert(ui.includes("${icon('footprints')}<span>步行道</span>"), 'Walkways must remain a dedicated map-layer option');
assert(ui.includes("if (walkways.isVisible()) options.setViewMode('map')"), 'Enabling from the route diagram must reveal the map');
console.log('Walking overlay: Basemap corridor alignment, complete YIA escalators, A/B/C/D/E junctions and extents, single LSK bridge, unchanged green connections, deterministic geometry and navigation isolation passed.');
