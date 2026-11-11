const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(require.resolve('../../data/cuhk_bus_routes.js'),'utf8'),context);
const data=context.window.CUHK_BUS_DATA;
require('../../data/transport_route_schemes.js').applyTransportRouteScheme(data,'2026-09');
const atlas=require('./topology.js');
const routes=atlas.build(data);
assert.deepEqual(routes.map(r=>r.id),['1','2','2S','3','4','8','N','H']);
const exact=a=>JSON.parse(JSON.stringify(a));
for(const r of routes){
  const stops=r.source.stops;
  assert.equal(r.spans.length,stops.length-1);
  r.spans.forEach((span,i)=>{
    assert.equal(span.from,stops[i]);assert.equal(span.to,stops[i+1]);
    for(let j=1;j<span.center.length;j++)assert(span.center[j][0]===span.center[j-1][0]||span.center[j][1]===span.center[j-1][1]);
    assert(span.points.every(p=>p.every(Number.isFinite)));
    assert.deepEqual(exact(span.points[0]),[atlas.stations[span.from].x,atlas.stations[span.from].y+r.shift]);
    assert.deepEqual(exact(span.points.at(-1)),[atlas.stations[span.to].x,atlas.stations[span.to].y+r.shift]);
    if(i)assert.deepEqual(exact(span.points[0]),exact(r.spans[i-1].points.at(-1)));
    assert(!/NaN|undefined|Infinity/.test(span.d));
  });
}
assert.notEqual(routes[1].color,routes[2].color);
assert.equal(atlas.conditional(routes[1].source,2),'45 分班次');
assert.equal(atlas.conditional(routes[5].source,19),'非教学日');
const allIds=new Set(routes.map(r=>r.id));
const fullStation=atlas.stationLayout('university_admin',routes,allIds);
assert.equal(fullStation.length,95);
const nightStation=atlas.stationLayout('university_admin',routes,new Set(['N','H']));
assert.equal(nightStation.length,29);
assert.equal(nightStation.active.length,2);
for(const route of routes){
  for(const id of new Set(route.source.stops)){
    const layout=atlas.stationLayout(id,routes,new Set([route.id]));
    assert.equal(layout.length,18,'A single visible route has a circular station marker');
    assert.equal(layout.min,route.shift,'Do not move route lanes when filtering');
    const full=atlas.stationLayout(id,routes,allIds);
    assert.equal(layout.labelMin,full.labelMin,'Keep labels stable');
    assert.equal(layout.labelMax,full.labelMax,'Keep labels stable');
  }
}
assert.equal(atlas.stationLayout('science_centre',routes,new Set(['N','H'])).length,0);
assert.equal(atlas.stationLayout('university_admin',routes,new Set()).length,0);
for(let mask=0;mask<256;mask++){
  const activeIds=new Set(routes.filter((r,i)=>mask&(1<<i)).map(r=>r.id));
  for(const id of Object.keys(atlas.stations)){
    const layout=atlas.stationLayout(id,routes,activeIds);
    assert(layout.active.every(r=>activeIds.has(r.id)));
    assert(layout.active.every(r=>r.shift>=layout.min&&r.shift<=layout.max));
    assert(layout.length<=atlas.stationLayout(id,routes,allIds).length);
  }
}
const luminance=hex=>{
  const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return c[0]*.2126+c[1]*.7152+c[2]*.0722;
};
for(const route of routes){
  const a=luminance(route.color),b=luminance(route.ink||'#ffffff');
  assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,'Readable route badge '+route.id);
}
console.log(`PASS: ${routes.length} routes, ${Object.keys(atlas.stations).length} stops, all ${routes.reduce((n,r)=>n+r.spans.length,0)} ordered legs connected; axis-aligned geometry; fixed lane continuity; no meet-class/minibus routes; conditional stops retained.`);
console.log('PASS: all 256 visibility combinations contract capsules correctly; lane and label positions stay fixed; route badge text contrast >= 4.5.');

const designs=require('./designs.js');
assert.deepEqual(designs.choices('a').map(p=>p.id),['a','a2','a3','a4']);
assert.deepEqual(designs.choices().map(p=>p.id),['a','b','c','d']);
for(const p of Object.values(designs.profiles)){
  const styled=designs.colorize(routes,p);
  styled.forEach((r,i)=>{
    assert.equal(r.spans,routes[i].spans,'Designs share the unchanged route geometry');
    assert.equal(r.source,routes[i].source,'Designs share the same route data');
    assert.equal(r.shift,routes[i].shift);
    const a=luminance(r.color),b=luminance(r.ink);
    assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=4.5,`${p.id}: badge contrast for ${r.id}`);
  });
  for(const activeIds of [allIds,new Set(['N','H']),new Set(['1']),new Set()]){
    const html=designs.diagram({atlas,routes:styled,data,design:p,activeIds});
    assert(!/NaN|undefined|Infinity/.test(html));
    assert.equal((html.match(/data-station=/g)||[]).length,23);
    const expected=atlas.stationLayout('university_admin',styled,activeIds).length;
    assert(html.includes(`data-station="university_admin" data-capsule-length="${expected}"`));
    for(const id of Object.keys(atlas.stations)){
      const full=atlas.stationLayout(id,styled,allIds),part=atlas.stationLayout(id,styled,activeIds);
      assert.deepEqual(designs.labelPosition(atlas.stations[id],full,p),designs.labelPosition(atlas.stations[id],part,p),'Labels must not jump on filtering');
    }
  }
  assert(!designs.diagram({atlas,routes:styled,data,design:p,interactive:false}).includes('role="button"'),'Comparison links must not contain nested buttons');
}
console.log('PASS: all seven design profiles preserve geometry, station counts, shrinking capsules, stable labels and readable badges.');
const renderDesign=id=>designs.diagram({atlas,routes:designs.colorize(routes,designs.get(id)),data,design:designs.get(id)});
assert.equal((renderDesign('a').match(/class="station-english"/g)||[]).length,23);
assert.equal((renderDesign('a2').match(/class="station-english"/g)||[]).length,0);
assert.equal((renderDesign('a3').match(/class="station-nameplate"/g)||[]).length,23);
assert(renderDesign('a4').includes('class="station-underline"'));
console.log('PASS: A-series bilingual, compact, nameplate and gold-marker styles render distinct features.');
