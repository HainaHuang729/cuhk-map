const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ui-modes/assets/campus.js'),'utf8'),context);
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'route-geometry.js'),'utf8'),context);
const data=context.window.CAMPUS_SAMPLE;
const source=JSON.stringify(data);
const apply=context.window.MOTION_ROUTE_GEOMETRY.withShawTurnaround;
const key=p=>p.join(',');
const edges=new Set();
for(const feature of data.background.features) {
  if(feature.geometry.type!=='LineString' || feature.properties.highway!=='service')continue;
  const points=feature.geometry.coordinates;
  for(let i=1;i<points.length;i++) {
    edges.add(`${key(points[i-1])}|${key(points[i])}`);
    edges.add(`${key(points[i])}|${key(points[i-1])}`);
  }
}
let corrected=0,visits=0;
for(const route of data.routes) {
  const updated=apply(route);
  assert.equal(updated.stops,route.stops);
  assert.equal(updated.progress.length,route.stops.length);
  assert(updated.progress.every((p,i)=>Number.isFinite(p)&&p>=0&&p<=1&&(!i||p>=updated.progress[i-1])));
  assert.equal(apply(updated),updated,'Do not add the circle twice');
  const count=route.stops.filter((id,i)=>id==='shaw_college'&&i>0&&i<route.stops.length-1).length;
  if(!count) {assert.equal(updated,route);continue;}
  corrected++;
  const tops=updated.path.filter(p=>key(p)==='114.2015822,22.4228272');
  assert.equal(tops.length,count,'Each Shaw arrival must complete the circle');
  visits+=count;
  for(let i=0;i<updated.path.length;i++) {
    if(key(updated.path[i])!=='114.2012549,22.4225118')continue;
    if(key(updated.path[i+1]||[])!=='114.2012846,22.4225283')continue;
    let j=i+1;
    do {
      assert(edges.has(`${key(updated.path[j-1])}|${key(updated.path[j])}`),'Turnaround must follow the local road network');
    }while(key(updated.path[j++])!=='114.2012549,22.4225118');
  }
}
assert.equal(JSON.stringify(data),source,'Shared source data must remain unchanged');
assert(!fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('weather-pill'));
assert(fs.readFileSync(path.join(__dirname,'index.html'),'utf8').includes('side-weather'));
console.log(`PASS: ${corrected} sample routes, ${visits} Shaw loops; source unchanged; weather only in sidebar.`);
