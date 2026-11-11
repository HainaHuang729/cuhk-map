const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={};vm.createContext(context);
const root=path.resolve(__dirname,'../..');
for(const file of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js','demos/shuttle-atlas/topology.js','demos/shuttle-atlas/designs.js','demos/shuttle-atlas/geographic.js']){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
}
const data=context.CUHK_BUS_DATA;
context.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(data,'2026-09');
const before=JSON.stringify(data),oldStations=JSON.stringify(context.ShuttleAtlas.stations);
const api=context.GeographicAtlas,atlas=api.build(data,context.ShuttleAtlas),geometry=atlas.geometry;
assert.equal(JSON.stringify(data),before,'Do not change service data or coordinates');
assert.equal(JSON.stringify(context.ShuttleAtlas.stations),oldStations,'Leave shared native/single-line schematic intact');
assert.equal(atlas.routes.map(r=>r.id).join(','),'1,2,2S,3,4,5,6A,6B,7,8,N,H');
assert.equal(Object.keys(atlas.stations).length,23);
assert.equal(atlas.orientation,'north-up');
const stations=Object.values(atlas.stations);
for(const a of stations){
  assert.deepEqual([a.x,a.y],Array.from(atlas.project(a.coord)),'Station anchor is the projected real coordinate');
  for(const b of stations){
    assert.equal(Math.sign(a.x-b.x),Math.sign(a.coord[0]-b.coord[0]),'West/east order');
    assert.equal(Math.sign(a.y-b.y)||0,-Math.sign(a.coord[1]-b.coord[1])||0,'North/south order');
    if(a===b)continue;
    assert(!api.overlaps(a.labelBox,b.labelBox),`Labels overlap: ${a.name} / ${b.name}`);
  }
}
const s=atlas.stations;
assert(s.shaw_college.x<s.united_college.x&&s.united_college.x<s.new_asia.x);
assert(s.area_39.y<s.cw_chu.y&&s.cw_chu.y<s.new_asia.y&&s.new_asia.y<s.university_station.y);
assert(s.campus_circuit_east.x>s.sh_ho.x);
const usedEdges=new Set();
for(const chain of geometry.chains){
  assert.deepEqual(chain.points[0],geometry.nodes.get(chain.nodes[0]).point,'Chain start agrees with node order');
  assert.deepEqual(chain.points.at(-1),geometry.nodes.get(chain.nodes.at(-1)).point,'Chain end agrees with node order');
  for(const id of chain.edges){assert(!usedEdges.has(id));usedEdges.add(id);}
  for(const id of chain.routes){
    assert(!/NaN|Infinity|undefined/.test(chain.lanes[id].d));
    assert(chain.lanes[id].points.length>=2);
  }
}
assert.equal(usedEdges.size,geometry.edges.size,'All source road segments retained');
for(const route of atlas.routes){
  const runs=geometry.traversals.get(route.id);
  assert(runs.length);
  for(const run of runs)assert(geometry.chains[run.chain].routes.includes(route.id));
  for(const join of geometry.joins.get(route.id)){
    const a=geometry.chains[join.from],b=geometry.chains[join.to];
    assert(a.nodes.includes(join.node)&&b.nodes.includes(join.node),'Join only at a real shared road node');
    const laneA=a.lanes[route.id].points,laneB=b.lanes[route.id].points;
    assert.deepEqual(join.points[0],join.node===a.nodes[0]?laneA[0]:laneA.at(-1));
    assert.deepEqual(join.points.at(-1),join.node===b.nodes[0]?laneB[0]:laneB.at(-1));
    assert(!/NaN|Infinity|undefined/.test(join.d));
  }
}
const profile=context.AtlasDesigns.get('a'),routes=context.AtlasDesigns.colorize(atlas.routes,profile);
for(const activeIds of [new Set(routes.map(r=>r.id)),...routes.map(r=>new Set([r.id])),new Set(routes.filter(r=>atlas.inGroup(r,'meet')).map(r=>r.id))]){
  const html=api.diagram({atlas,routes,data,design:profile,activeIds,selectedRoute:activeIds.size===1?[...activeIds][0]:null});
  assert(!/NaN|Infinity|undefined/.test(html));
  assert.equal((html.match(/data-station=/g)||[]).length,23);
}
const again=api.build(data,context.ShuttleAtlas);
assert.equal(JSON.stringify(atlas.stations),JSON.stringify(again.stations),'Label placement stays deterministic');
console.log(`Geographic atlas: 12 routes, 23 fixed coordinate anchors, ${geometry.edges.size} source edges, ${geometry.chains.length} bundles. Geographic ordering, label separation, joined lanes, all selections and source isolation passed.`);

const semi=api.build(data,context.ShuttleAtlas,{schematize:true});
const oldPointCount=geometry.chains.reduce((n,c)=>n+c.points.length,0);
const newPointCount=semi.geometry.chains.reduce((n,c)=>n+c.points.length,0);
assert(newPointCount<oldPointCount*.8,'Remove road-level wiggles, not just change styling');
assert.equal(semi.geometry.edges.size,geometry.edges.size);
assert.equal(semi.geometry.chains.length,geometry.chains.length);
assert.equal(JSON.stringify(data),before);
assert.equal(JSON.stringify(context.ShuttleAtlas.stations),oldStations);
for(const chain of semi.geometry.chains){
  assert.deepEqual(chain.points[0],semi.geometry.nodes.get(chain.nodes[0]).point);
  assert.deepEqual(chain.points.at(-1),semi.geometry.nodes.get(chain.nodes.at(-1)).point);
  assert.deepEqual(chain.edges,geometry.chains[chain.id].edges);
  assert.deepEqual(chain.routes,geometry.chains[chain.id].routes);
  if(Math.hypot(chain.sourcePoints[0][0]-chain.sourcePoints.at(-1)[0],chain.sourcePoints[0][1]-chain.sourcePoints.at(-1)[1])<1&&chain.sourcePoints.length>3){
    assert(chain.points.length>3,'Preserve turning loops');
  }
}
for(const [id,a] of Object.entries(semi.stations)){
  const source=atlas.stations[id];
  assert(Math.hypot(a.x-source.x,a.y-source.y)<50,'Display-only movement stays close to the original region');
  for(const [other,b] of Object.entries(semi.stations)){
    if(id===other)continue;
    assert(!api.overlaps(a.labelBox,b.labelBox));
    const original=atlas.stations[other];
    if(Math.abs(source.x-original.x)>80)assert.equal(Math.sign(a.x-b.x),Math.sign(source.x-original.x));
    if(Math.abs(source.y-original.y)>80)assert.equal(Math.sign(a.y-b.y),Math.sign(source.y-original.y));
  }
}
for(const route of semi.routes){
  assert.deepEqual(semi.geometry.traversals.get(route.id),geometry.traversals.get(route.id),'Route order is unchanged');
  for(const join of semi.geometry.joins.get(route.id)){
    const a=semi.geometry.chains[join.from],b=semi.geometry.chains[join.to];
    assert.deepEqual(join.points[0],a.lanes[route.id].points[join.node===a.nodes[0]?0:a.lanes[route.id].points.length-1]);
    assert.deepEqual(join.points.at(-1),b.lanes[route.id].points[join.node===b.nodes[0]?0:b.lanes[route.id].points.length-1]);
  }
  const html=api.diagram({atlas:semi,routes:context.AtlasDesigns.colorize(semi.routes,profile),data,design:profile,activeIds:new Set([route.id]),selectedRoute:route.id});
  assert(!/NaN|Infinity|undefined/.test(html));
}
console.log(`Light topology: ${oldPointCount} -> ${newPointCount} corridor vertices; same 12 routes and road connections, broad geographic ordering, intact loops and separate labels passed.`);
