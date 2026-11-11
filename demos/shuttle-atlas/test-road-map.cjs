const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),context={};
vm.createContext(context);
for(const f of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js','demos/shuttle-atlas/topology.js','demos/shuttle-atlas/designs.js','demos/shuttle-atlas/road-map-model.js'])vm.runInContext(fs.readFileSync(path.join(root,f),'utf8'),context);
context.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(context.CUHK_BUS_DATA,'2026-09');
const api=context.ShuttleRoadMap,graph=api.build(context.ShuttleAtlas,context.CUHK_BUS_DATA,context.AtlasDesigns);
assert.equal(graph.routes.map(r=>r.id).join(','),'1,2,2S,3,4,5,6A,6B,7,8,N,H');
assert.equal(graph.stations.length,23);
assert.equal(graph.routes.reduce((sum,r)=>sum+r.spans.length,0),142);
assert.equal(graph.stations.reduce((sum,s)=>sum+s.routes.length,0),132);
assert.equal(graph.routes.filter(r=>context.ShuttleAtlas.inGroup(r,'meet')).length,4);
assert.equal(graph.routes.filter(r=>context.ShuttleAtlas.inGroup(r,'shuttle')).length,8);
for(let i=0;i<graph.stations.length;i++)for(let j=i+1;j<graph.stations.length;j++){
  const a=graph.stations[i],b=graph.stations[j],x=a.box,y=b.box;
  assert(!(x.x<y.x+y.width&&x.x+x.width>y.x&&x.y<y.y+y.height&&x.y+x.height>y.y),`Station panels overlap: ${a.id} / ${b.id}`);
}
const anchor=id=>['university_sports_centre','sh_ho'].includes(id)?'sports':id;
for(const route of graph.routes){
  for(const [i,span] of route.spans.entries()){
    assert.equal(span.from,route.source.stops[i]);
    assert.equal(span.to,route.source.stops[i+1]);
    let at=anchor(span.from);
    for(const use of span.uses){
      const edge=graph.edges[use.edge];
      assert.equal(at,use.dir===1?edge.a:edge.b,`${route.id} disconnected ${span.from}`);
      assert.ok(edge[use.dir===1?'forward':'reverse'].some(m=>m.route===route.id));
      at=use.dir===1?edge.b:edge.a;
    }
    assert.equal(at,anchor(span.to));
  }
  route.source.stops.forEach((id,i)=>{
    const s=graph.stations.find(s=>s.id===id);
    assert.ok(s.routes.includes(route.id));
    const direction=route.source.stopDirections?.[i];
    if(direction&&['shaw_college','residences_3_4','cw_chu','area_39','campus_circuit_east'].includes(id)){
      assert.ok(s.rows.some(row=>row.label===direction&&row.badges.some(b=>b.id===route.id)),`${route.id} ${id} ${direction}`);
    }
  });
}
for(const edge of graph.edges){
  for(const shift of [-6.5,0,6.5])assert.ok(!/NaN|Infinity|undefined/.test(api.rounded(api.offset(edge.points,shift))));
}
const lanes=new Map(graph.geometry.lanes.map(lane=>[lane.key,lane]));
const connections=new Map(graph.geometry.connections.map(c=>[c.key,c]));
const expectedTurns=new Set();
for(const route of graph.routes){
  const uses=route.spans.flatMap(s=>s.uses);
  for(let i=1;i<uses.length;i++){
    const key=uses[i-1].edge+':'+uses[i-1].dir+'>'+uses[i].edge+':'+uses[i].dir;
    expectedTurns.add(key);
    assert(connections.get(key)?.routes.includes(route.id),'Every selected route stays connected through its turns');
  }
}
assert.equal(connections.size,expectedTurns.size,'Do not invent junction turns');
for(const c of connections.values()){
  const incoming=lanes.get(c.from),outgoing=lanes.get(c.to);
  assert.equal(incoming.to,outgoing.from);
  assert.deepEqual(c.points[0],incoming.points.at(-1),'Incoming lane meets junction curve');
  assert.deepEqual(c.points.at(-1),outgoing.points[0],'Junction curve meets outgoing lane');
  assert(!/NaN|Infinity|undefined/.test(c.d));
}
for(const s of graph.stations){
  const node=anchor(s.id);
  for(const lane of lanes.values()){
    const p=lane.from===node?lane.points[0]:lane.to===node?lane.points.at(-1):null;
    if(p)assert(Math.hypot(p[0]-s.center[0],p[1]-s.center[1])<=6.51,'Station stays on its road, not outside a smoothed corner');
  }
}
for(const selection of [{},{group:'meet'},{group:'shuttle'},...graph.routes.map(r=>({route:r.id})),...graph.stations.map(s=>({station:s.id}))]){
  const svg=api.diagram(graph,selection);
  assert.ok(!/NaN|Infinity|undefined/.test(svg));
  assert.equal((svg.match(/class="road-panel/g)||[]).length,23);
}
console.log('Road map: 12 routes, 23 stations, 132 memberships, 142 connected legs; directions, service groups, non-overlapping panels and all render states passed.');
console.log(`Junctions: ${lanes.size} directional lanes, ${connections.size} route-supported turns; endpoint continuity and station alignment passed.`);
