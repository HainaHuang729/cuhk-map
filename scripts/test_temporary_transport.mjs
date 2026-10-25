import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

let epoch=Date.parse('2026-10-16T10:00:00+08:00');
class TestDate extends Date {
  constructor(...args){super(...(args.length?args:[epoch]));}
  static now(){return epoch;}
}
const web=vm.createContext({Date:TestDate});
for(const file of ['campus_updates','cuhk_bus_routes','transport_route_schemes','eta_prediction','eta_model']){
  vm.runInContext(fs.readFileSync(`data/${file}.js`,'utf8'),web);
}
web.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(web.CUHK_BUS_DATA,'2026-09');
web.CUHK_ETA_PREDICTION.setModel(web.CUHK_ETA_MODEL);
const path='/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
const require=createRequire(path);
const mini=vm.createContext({Date:TestDate,require:(name)=>name.endsWith('/campusUpdates.js')?web.CUHK_CAMPUS_UPDATES:require(name),Page:()=>{},wx:{getStorageSync:()=>null},setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(fs.readFileSync(path,'utf8'),mini);
const evaluate=(code)=>vm.runInContext(code,mini);
const route=(id)=>web.CUHK_BUS_DATA.routes.find(r=>r.id===id);
const webBaseline=JSON.stringify(route('8').stops);
const miniBaseline=evaluate('JSON.stringify(routeById("8").stops)');
for(const date of ['2026-10-16T23:59:59+08:00','2026-10-17T00:00:00+08:00','2026-10-17T10:00:00+08:00','2026-10-17T23:59:59+08:00','2026-10-18T00:00:00+08:00','2026-10-19T10:00:00+08:00']){
  epoch=Date.parse(date);
  const at=new TestDate();
  const suspended=date.startsWith('2026-10-17');
  web.CUHK_CAMPUS_UPDATES.applyTemporaryStops(web.CUHK_BUS_DATA,at);
  evaluate('syncTemporaryTransportStops()');
  for(const id of ['3','4']){
    assert.equal(!!web.CUHK_CAMPUS_UPDATES.suspensionForRoute(id,at),suspended);
    assert.equal(web.CUHK_BUS_UTILS.nextStopArrival(route(id),0,at).status==='suspended',suspended);
    assert.equal(evaluate(`nextStopArrival(routeById('${id}'),0).status==='suspended'`),suspended);
    if(suspended){
      assert.equal(web.CUHK_BUS_UTILS.activeVehicles(route(id),at).length,0);
      assert.equal(evaluate(`activeVehicles(routeById('${id}')).length`),0);
      assert.equal(web.CUHK_BUS_UTILS.nextDeparture(route(id),at),null);
      assert.equal(evaluate(`nextDeparture(routeById('${id}'))`),null);
      assert.match(web.CUHK_BUS_UTILS.serviceStatus(route(id),at).label,/暂停/);
      assert.match(evaluate(`serviceStatus(routeById('${id}')).label`),/暂停/);
    }
  }
  assert.equal(route('8').stops.includes('science_centre'),!suspended);
  assert.equal(route('8').stops.includes('shaw_hall'),suspended);
  assert.equal(evaluate('routeById("8").stops.includes("science_centre")'),!suspended);
  assert.equal(evaluate('allBusStopEntries().find(e=>e.id==="shaw_hall").occurrences.some(o=>o.route.id==="8")'),suspended);
  assert.equal(web.CUHK_CAMPUS_UPDATES.noticesForStop('science_centre',at).length,suspended?1:0);
  assert(Number.isFinite(web.CUHK_BUS_UTILS.routeStopProgress(route('8'),10)));
  assert(Number.isFinite(evaluate('routeStopProgress(routeById("8"),10)')));
}
assert.equal(JSON.stringify(route('8').stops),webBaseline);
assert.equal(evaluate('JSON.stringify(routeById("8").stops)'),miniBaseline);

// Exercise the navigation planner with real schedules and stub only walking distances.
evaluate('routePlanWalkingMetrics=()=>({distanceMeters:100,routed:true,points:[]})');
const navigationCode=`(()=>{
 const r=routeById('3');
 const entry=(i)=>({id:r.stops[i],stop:MAP_DATA.stops[r.stops[i]],coord:MAP_DATA.stops[r.stops[i]].coord,occurrences:[{route:r,stopIndex:i}]});
 return buildBusRoutePlanOptions([{entry:entry(0)}],[{entry:entry(1)}],entry(0).coord,entry(1).coord);
})()`;
for(const [date,available] of [['2026-10-16',true],['2026-10-17',false],['2026-10-20',true]]){
  epoch=Date.parse(`${date}T10:00:00+08:00`);
  evaluate('syncTemporaryTransportStops()');
  assert.equal(evaluate(navigationCode).length>0,available,`navigation availability ${date}`);
}
epoch=Date.parse('2026-10-26T10:00:00+08:00');
evaluate('syncTemporaryTransportStops()');
const miniNavigation=(destinationIndex,originIndex=0)=>evaluate(`(()=>{
 const r=routeById('MINI-N');
 const entry=(i)=>({id:r.stops[i],stop:MAP_DATA.stops[r.stops[i]],coord:MAP_DATA.stops[r.stops[i]].coord,occurrences:[{route:r,stopIndex:i}]});
 return buildBusRoutePlanOptions([{entry:entry(${originIndex})}],[{entry:entry(${destinationIndex})}],entry(${originIndex}).coord,entry(${destinationIndex}).coord);
})()`);
const affected=miniNavigation(3);
assert(affected.length>0);
assert(affected.every(option=>option.steps.some(step=>step.label==='提醒'&&step.text.includes('临时站务安排'))),'navigation to works-affected stops must warn about original map coordinates');
assert(miniNavigation(4,1).every(option=>!option.steps.some(step=>step.label==='提醒')),'unaffected stops must not receive unrelated warnings');
assert.equal(evaluate('JSON.stringify(routeById("8").stops)'),miniBaseline,'archived activity notices must not leave a permanent route change');
console.log('PASS: HK midnight boundaries, 3/4 suspension, ETA/departure/status, navigation exclusion, temporary 8 stop/occurrences and restoration');
console.log('PASS: ongoing-stop navigation warning without changing unverified coordinates or unrelated routes');
