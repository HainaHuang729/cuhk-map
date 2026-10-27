import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const web=vm.createContext({});
for(const file of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js','data/eta_prediction.js','data/eta_model.js'])vm.runInContext(fs.readFileSync(file,'utf8'),web);
web.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(web.CUHK_BUS_DATA,'2026-09');
web.CUHK_ETA_PREDICTION.setModel(web.CUHK_ETA_MODEL);
const miniPath='/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
const mini=vm.createContext({require:createRequire(miniPath),Page:()=>{},wx:{getStorageSync:()=>null},console,setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(fs.readFileSync(miniPath,'utf8'),mini);
let checked=0;
for(const date of ['2026-10-05T08:20:00+08:00','2026-10-05T13:00:00+08:00','2026-10-05T18:00:00+08:00','2026-10-04T15:00:00+08:00']){
 const at=new Date(date);
 for(const route of web.CUHK_BUS_DATA.routes){
  let previous=-1;
  for(let i=0;i<route.stops.length;i++){
   const value=web.CUHK_BUS_UTILS.routeStopOffsetMinutes(route,i,undefined,at);
   const other=vm.runInContext(`routeStopOffsetMinutes(MAP_DATA.routes.find(r=>r.id===${JSON.stringify(route.id)}),${i},undefined,new Date(${JSON.stringify(date)}))`,mini);
   assert(Number.isFinite(value)&&value>=previous);
   assert(Math.abs(value-other)<1e-8,`web/mini offset mismatch ${route.id}/${i}`);
   previous=value;checked++;
  }
  const vehicles=web.CUHK_BUS_UTILS.activeVehicles(route,at);
  assert(vehicles.every(v=>Number.isFinite(v.progress)&&v.progress>=0&&v.progress<=1));
 }
}
const route=web.CUHK_BUS_DATA.routes.find(r=>r.id==='8');
assert(Number.isNaN(web.CUHK_ETA_PREDICTION.offset({...route,stops:route.stops.slice(1)},1)),'changed route must not use stale predictions');
assert.equal(web.CUHK_ETA_PREDICTION.setModel({schema:'unknown'}),false);
const before=vm.runInContext('ETA_PREDICTION.offset(MAP_DATA.routes.find(r=>r.id==="8"),3)',mini);
vm.runInContext('applyRemoteAppConfig({enabled:true,version:7,etaModel:{predictionModel:{schema:"invalid"}}})',mini);
assert.equal(before,vm.runInContext('ETA_PREDICTION.offset(MAP_DATA.routes.find(r=>r.id==="8"),3)',mini));
const native=vm.createContext({Intl:undefined});
vm.runInContext(fs.readFileSync('data/eta_prediction.js','utf8'),native);
native.CUHK_ETA_PREDICTION.setModel(web.CUHK_ETA_MODEL);
for(const date of ['2026-10-03T23:59:00+08:00','2026-10-04T00:00:00+08:00','2026-10-04T11:36:00+08:00','2026-10-05T08:20:00+08:00']){
 const at=new Date(date);
 assert.equal(native.CUHK_ETA_PREDICTION.bucket(at),web.CUHK_ETA_PREDICTION.bucket(at));
 assert(Number.isFinite(native.CUHK_ETA_PREDICTION.offset(route,3,at)));
}
assert.equal(native.CUHK_ETA_PREDICTION.bucket(new Date('2026-10-04T00:00:00+08:00')),'sunday_overnight');
for(const malformed of [
 {schema:'cuhk_eta_prediction_v1',routeScheme:'2026-09',routes:{8:null}},
 {schema:'cuhk_eta_prediction_v1',routeScheme:'2026-09',routes:{8:{stopIds:['a','b'],profiles:{all:{offsets:[0,1],dwellSeconds:[0,0]},weekday_morning:null}}}},
 {schema:'cuhk_eta_prediction_v1',routeScheme:'2026-09',routes:{8:{stopIds:[null,'b'],profiles:{all:{offsets:[0,1],dwellSeconds:[0,0]}}}}}
]){
 assert.equal(native.CUHK_ETA_PREDICTION.setModel(malformed),false);
 assert(Number.isFinite(native.CUHK_ETA_PREDICTION.offset(route,3,new Date('2026-10-05T08:20:00+08:00'))),'invalid model must preserve working model');
}
const nativeRequire=createRequire(miniPath);
const nativeMini=vm.createContext({Intl:undefined,require:(path)=>path.endsWith('/etaPrediction.js')?native.CUHK_ETA_PREDICTION:nativeRequire(path),Page:()=>{},wx:{getStorageSync:()=>null},setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(fs.readFileSync(miniPath,'utf8'),nativeMini);
const sundayVehicles=vm.runInContext('activeVehiclesForMap(null,new Date("2026-10-04T11:36:00+08:00"))',nativeMini);
assert(sundayVehicles.some(vehicle=>vehicle.route.id==='H'),'Sunday H vehicles must render without Intl');
assert(sundayVehicles.some(vehicle=>vehicle.route.id==='MINI-N'),'Sunday paid buses must render without Intl');
const weekdayVehicles=vm.runInContext('activeVehiclesForMap(null,new Date("2026-10-05T08:20:00+08:00"))',nativeMini);
assert(weekdayVehicles.length>0,'Weekday vehicles must render without Intl');
for(const vehicle of weekdayVehicles){
 if(!vehicle.nextStop)continue;
 nativeMini.testVehicle=vehicle;
 const eta=vm.runInContext('vehicleNextStopEtaMinutes(testVehicle)',nativeMini);
 const expected=native.CUHK_ETA_PREDICTION.offset(vehicle.route,vehicle.nextStop.stopIndex,vehicle.predictionAt)-vehicle.elapsedMinutes;
 assert(Math.abs(eta-Math.max(0,expected))<1e-8,'vehicle ETA must use the same time profile as vehicle position');
}
console.log(`PASS: ${checked} web/mini stop offsets, finite vehicle progress, stale-route rejection, invalid-cloud fallback`);
console.log('PASS: no-Intl native engine, HK midnight rollover, Sunday and weekday vehicle rendering');
