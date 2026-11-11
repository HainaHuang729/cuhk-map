// Shared walking display data. These lines never modify the navigation graph.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = require('../data/walking_connections.source.json');
const routeSource = require('../data/walking_routes.source.json');
const coordinates = require('../assets/campus_coordinates.js');
const osm = JSON.parse(fs.readFileSync(path.join(root, 'data/cuhk_roads_poi_coffee_tea_clipped.geojson'), 'utf8'));
const osmById = new Map(osm.features.map(f => [f.properties['@id'],f]));
const allowed = new Set(['footway', 'path', 'steps', 'pedestrian', 'corridor']);
const network = osm.features.filter(f => f.geometry.type === 'LineString' && allowed.has(f.properties.highway)
  && !['no', 'private'].includes(f.properties.foot) && !['no', 'private'].includes(f.properties.access))
  .map(f => ({ id: f.properties['@id'], kind: f.properties.highway,
    name: f.properties['name:zh'] || f.properties.name || '',
    bridge: f.properties.bridge || '', layer: f.properties.layer || '', level: f.properties.level || '',
    coords: f.geometry.coordinates.map(p => p.slice(0, 2)) }));
function pixelToCoord([x, y]) {
  const { zoom, x0, y0, tileSize } = source.grid, n = 2 ** zoom;
  return [((x / tileSize + x0) / n * 360 - 180), Math.atan(Math.sinh(Math.PI * (1 - 2 * (y / tileSize + y0) / n))) * 180 / Math.PI]
    .map(n => Number(n.toFixed(7)));
}
function distance(a, b) {
  return Math.hypot((a[0] - b[0]) * 111320 * Math.cos((a[1] + b[1]) / 2 * Math.PI / 180), (a[1] - b[1]) * 111320);
}
function nearest(point) {
  let best = { distance: Infinity };
  for (const way of network) for (let i = 1; i < way.coords.length; i++) {
    const a = way.coords[i - 1], b = way.coords[i], s = Math.cos(point[1] * Math.PI / 180);
    const dx = (b[0] - a[0]) * s, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * s * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    const projected = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = distance(point, projected);
    if (d < best.distance) best = { distance: d, id: way.id, kind: way.kind };
  }
  return { ...best, distance: Number(best.distance.toFixed(1)) };
}
const connections = source.connections.map(({ pixels, ...item }) => {
  const coords = pixels.map(pixelToCoord), start = nearest(coords[0]), end = nearest(coords.at(-1));
  const stepSections = item.stepSections || [], sections = [];
  for (const section of stepSections) {
    if (!Number.isInteger(section.from) || !Number.isInteger(section.to) || section.from < 0 || section.to >= coords.length || section.from >= section.to
      || !section.sourceWayIds?.length || !section.sourceWayIds.every(id => network.some(p => p.id === id && p.kind === 'steps'))) {
      throw new Error(`Invalid step evidence: ${item.id}`);
    }
  }
  for (let i = 0; i < coords.length - 1; i++) {
    const kind = stepSections.some(s => i >= s.from && i < s.to) ? 'steps' : item.kind;
    const previous = sections.at(-1);
    if (previous?.kind === kind) { previous.coords.push(coords[i + 1]); previous.to = i + 1; }
    else sections.push({ kind, from:i, to:i + 1, coords:[coords[i],coords[i + 1]] });
  }
  for (const section of sections) {
    const evidence = stepSections.find(s => section.from >= s.from && section.to <= s.to);
    section.networkWayIds = section.kind === 'steps' ? evidence.sourceWayIds.slice() : (item.displayWayIds || []).slice();
    if (!section.networkWayIds.every(id => network.some(p => p.id === id))) throw new Error(`Unknown display reference: ${item.id}`);
  }
  return { ...item, coords, sections, routingEnabled: false, status: 'entrances-unverified',
    endpointAudit: { start, end }, lengthMeters: Math.round(coords.slice(1).reduce((sum, point, i) => sum + distance(point, coords[i]), 0)) };
});
// Keep the original green extents; nearby OSM ways remain audit evidence, not display geometry.
const routeSections = new Map(), coveredConnections = new Set();
// Choose reviewed corridors, not the nearest road: YIA contains parallel routes
// on different levels, and the LSK bridge crosses Central Road without joining it.
function corridor(part) {
  const feature = osmById.get(part.wayId), p = feature?.properties;
  if (!feature || feature.geometry.type !== 'LineString' || !p.highway
    || ['motorway','motorway_link'].includes(p.highway) || ['no','private'].includes(p.foot)
    || (['no','private'].includes(p.access) && !['yes','permissive','designated'].includes(p.foot))) {
    throw new Error(`Invalid walking corridor: ${part.wayId}`);
  }
  const raw = feature.geometry.coordinates, from = part.from ?? 0, to = part.to ?? raw.length - 1;
  if (![from,to].every(Number.isInteger) || from < 0 || to >= raw.length || from >= to) throw new Error(`Invalid corridor range: ${part.wayId}`);
  const coords = raw.slice(from,to+1).map(p => p.slice(0,2));
  if (part.reverse) coords.reverse();
  const kind = part.kind || (p.conveying ? 'escalator' : p.highway === 'steps' ? 'steps' : p.bridge ? 'footbridge' : 'walkway');
  return {coords, kind, sourceRange:[from,to], sourceWayId:part.wayId, layer:p.layer || '0'};
}
function projectLabel(point, sections) {
  let best = null;
  for (const section of sections) for (let i=1;i<section.coords.length;i++) {
    const a=section.coords[i-1],b=section.coords[i],cos=Math.cos(point[1]*Math.PI/180);
    const dx=(b[0]-a[0])*cos,dy=b[1]-a[1];
    const t=Math.max(0,Math.min(1,((point[0]-a[0])*cos*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy || 1)));
    const coord=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t], meters=distance(point,coord);
    if (!best || meters<best.meters) best={coord,meters};
  }
  if (!best || best.meters>30) throw new Error('Route label is outside its intended corridor');
  return best.coord.map(n => Number(n.toFixed(7)));
}
const routes = routeSource.routes.map(({ parts, referenceTrace, ...route }) => {
  let previous = null, lengthMeters = 0;
  const sectionIds = [];
  for (const part of parts) {
    const section = corridor(part), {coords} = section;
    if (previous && distance(previous, coords[0]) > 0.01) throw new Error(`Disconnected ${route.id}: ${part.wayId} (${distance(previous,coords[0]).toFixed(1)}m)`);
    previous = coords.at(-1);
    lengthMeters += coords.slice(1).reduce((n,p,i) => n + distance(coords[i], p), 0);
    const key = `${part.wayId}:${section.sourceRange.join('-')}:${section.kind}`;
    if (sectionIds.includes(key)) throw new Error(`Repeated corridor in ${route.id}: ${key}`);
    if (!routeSections.has(key)) routeSections.set(key, { id:key, ...section,
      geometrySource:'osm-corridor', coveredConnectionIds:part.coversConnections || [], routeIds:[] });
    routeSections.get(key).routeIds.push(route.id);
    sectionIds.push(key);
    for (const id of part.coversConnections || []) {
      const c = connections.find(c => c.id === id);
      if (!c || !c.displayWayIds?.includes(part.wayId) || distance(c.coords[0], coords[0]) > 5 || distance(c.coords.at(-1), coords.at(-1)) > 5) {
        throw new Error(`Invalid shared corridor: ${id}`);
      }
      coveredConnections.add(id);
    }
  }
  return { ...route, labelCoord:projectLabel(route.labelCoord,sectionIds.map(id=>routeSections.get(id))), sectionIds,
    lengthMeters:Math.round(lengthMeters), routingEnabled:false, sourceUrl:routeSource.sourceUrl };
});
const displayPaths = connections.filter(c => !coveredConnections.has(c.id)).flatMap(c => c.sections.map((section, index) => ({
  id:`${c.id}:${index}`, source:'official', connectionId:c.id, sectionIndex:index, connectionIds:[c.id]
})));
const data = { version: routeSource.version, checkedAt: source.checkedAt, coordinateSystem: source.coordinateSystem,
  sourceUrl: source.sourceUrl, sourceName: source.sourceName, sourceWarning: source.sourceWarning,
  routeSourceUrl:routeSource.sourceUrl, routeSourceDate:routeSource.sourceDate, routeGeometryConvention:routeSource.geometryConvention,
  osmTimestamp: osm.metadata.osm_timestamp, network, connections, displayPaths, routes, routeSections:[...routeSections.values()] };
fs.writeFileSync(path.join(root, 'data/campus_walkways.js'), '// Generated by scripts/build_walking_overlay.js; WGS84, display only.\n(function(root) {\nconst data = '
  + JSON.stringify(data) + ';\nroot.CUHK_WALKWAY_DATA = data;\nif (typeof module !== "undefined") module.exports = data;\n})(globalThis);\n');
console.log(JSON.stringify({ auditPaths: network.length, officialCandidates: connections.length, displayedSections: displayPaths.length,
  routes:routes.map(r => ({id:r.id,meters:r.lengthMeters,minutes:r.minutes})),
  audits: connections.map(c => ({ id: c.id, length: c.lengthMeters, start: c.endpointAudit.start.distance, end: c.endpointAudit.end.distance })) }, null, 2));
const miniIndex = process.argv.indexOf('--mini');
if (miniIndex >= 0) {
  const miniRoot = process.argv[miniIndex + 1];
  if (!miniRoot) throw new Error('--mini requires a project directory');
  const convert = p => coordinates.toGcj02(p).map(n => Number(n.toFixed(7)));
  const compact = { version:data.version, coordinateSystem:'GCJ-02', sourceUrl:data.sourceUrl, routeSourceUrl:data.routeSourceUrl,
    connections:displayPaths.map(p => {
      const c = connections.find(c => c.id === p.connectionId), section = c.sections[p.sectionIndex];
      return { id:p.id, kind:section.kind, coords:section.coords.map(convert) };
    }),
    routes:routes.map(({sectionIds, ...r}) => ({...r,labelCoord:convert(r.labelCoord)})),
    routeSections:data.routeSections.map(({coveredConnectionIds,geometrySource,sourceWayId,sourceRange,layer,...s}) => ({...s,coords:s.coords.map(convert)})) };
  const target = path.resolve(miniRoot, 'miniprogram/data/campusWalkways.js');
  fs.writeFileSync(target, '// Generated by cuhk-map/scripts/build_walking_overlay.js --mini; display only, GCJ-02.\nmodule.exports = ' + JSON.stringify(compact) + ';\n');
  console.log(`Mini-program display data: ${fs.statSync(target).size} bytes; navigation graph unchanged.`);
}
