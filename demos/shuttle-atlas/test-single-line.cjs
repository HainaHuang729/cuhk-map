const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const context = {};
vm.createContext(context);
for (const name of ['../../data/cuhk_bus_routes.js','../../data/transport_route_schemes.js','topology.js','single-line-model.js']) {
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,name),'utf8'),context);
}
context.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(context.CUHK_BUS_DATA,'2026-09');
const graph = context.ShuttleSingleLine.build(context.ShuttleAtlas,context.CUHK_BUS_DATA);
assert.equal(graph.routes.length,8);
assert.equal(graph.stations.length,23);
assert.equal(graph.stations.reduce((n,s)=>n+s.routes.length,0),99);
const intersection = (a,b) => a.x < b.x+b.width && a.x+a.width > b.x && a.y < b.y+b.height && a.y+a.height > b.y;
function hitsBox(a,b,box) {
  let lo=0,hi=1;
  for(let axis=0;axis<2;axis++) {
    const delta=b[axis]-a[axis],min=axis?box.y:box.x,max=min+(axis?box.height:box.width);
    if(Math.abs(delta)<.000001) {if(a[axis]<=min||a[axis]>=max)return false;}
    else {const t1=(min-a[axis])/delta,t2=(max-a[axis])/delta;lo=Math.max(lo,Math.min(t1,t2));hi=Math.min(hi,Math.max(t1,t2));}
  }
  return lo<hi;
}
for (const [i,s] of graph.stations.entries()) {
  const original=context.ShuttleAtlas.stations[s.id];
  assert.equal(s.x,original.x,'Keep the original horizontal station position');
  assert.equal(s.y,original.y,'Keep the original vertical station position');
  assert.equal(new Set(s.routes).size,s.routes.length,'No duplicate route numbers at one station');
  for (const t of graph.stations.slice(i+1)) assert(!intersection(s.box,t.box),`${s.name} / ${t.name} labels overlap`);
  const box = {x:s.box.x-6,y:s.box.y-6,width:s.box.width+12,height:s.box.height+12};
  for (const edge of graph.segments) {
    assert(!hitsBox(edge.a,edge.b,box),s.name+' label covers backbone');
  }
}
const seen = new Set();
for (const edge of graph.segments) {
  const key = JSON.stringify([edge.a,edge.b]);
  assert(!seen.has(key),'Overlapping skeleton segment'); seen.add(key);
  assert.equal(new Set(edge.routes).size,edge.routes.length);
}
for (const route of graph.routes) {
  const source = context.CUHK_BUS_DATA.routes.find(r=>r.id===route.id);
  assert.equal(JSON.stringify(route.source.stops),JSON.stringify(source.stops));
  for (const span of route.spans) {
    const a = context.ShuttleAtlas.stations[span.from], b = context.ShuttleAtlas.stations[span.to];
    assert.equal(JSON.stringify(span.center[0]),JSON.stringify([a.x,a.y]));
    assert.equal(JSON.stringify(span.center.at(-1)),JSON.stringify([b.x,b.y]));
    for (let i=1;i<span.center.length;i++) {
      const a=span.center[i-1],b=span.center[i],axis=a[0]===b[0]?1:0;
      const collinear=p=>Math.abs((p[0]-a[0])*(b[1]-a[1])-(p[1]-a[1])*(b[0]-a[0]))<.001;
      const low=Math.min(a[axis],b[axis]),high=Math.max(a[axis],b[axis]);
      const coverage=graph.segments.filter(e=>e.routes.includes(route.id)&&collinear(e.a)&&collinear(e.b))
        .reduce((n,e)=>n+Math.max(0,Math.min(high,Math.max(e.a[axis],e.b[axis]))-Math.max(low,Math.min(e.a[axis],e.b[axis]))),0);
      assert(Math.abs(coverage-(high-low))<.001,`${route.id}: missing merged route segment`);
    }
  }
}
console.log(`PASS: 8 routes, 23 unchanged station coordinates, 99 badges, ${graph.segments.length} shared segments; exact stop membership/order; full route coverage; no overlapping labels or labels hiding lines.`);
