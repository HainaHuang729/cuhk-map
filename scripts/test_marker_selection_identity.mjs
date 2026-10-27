import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const file='/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
let now=Date.parse('2026-10-26T11:20:00+08:00');
class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
let definition;
const context=vm.createContext({Date:Clock,require:createRequire(file),Page:p=>definition=p,
  wx:{getStorageSync:()=>null,setStorageSync(){}},setTimeout,clearTimeout,setInterval,clearInterval});
vm.runInContext(fs.readFileSync(file,'utf8'),context);
const page=Object.create(definition);page.data=JSON.parse(JSON.stringify(definition.data));
page.boardReports=[];page.importedCourseMeetings=[];
page.setData=(patch,cb)=>{Object.assign(page.data,patch);cb?.();};page.refreshRouteCards=()=>{};
const snapshot=()=>new Map(page.data.markers.filter(m=>page.markerRefs[m.id]?.type==='vehicle').map(m=>[m.uiKey,{id:m.id,lat:m.latitude,lon:m.longitude}]));
page.refreshMap();const initial=snapshot();assert(initial.size>0);
const ref=Object.entries(page.markerRefs).find(([,r])=>r.type==='vehicle'&&r.vehicle.route.id==='8');assert(ref);
page.onMarkerTap({markerId:Number(ref[0])});assert.equal(page.data.selectedTarget.type,'vehicle');
assert(page.data.polylines.length>0);
const same=()=>{const current=snapshot();assert.equal(current.size,initial.size);for(const [key,old]of initial){assert.deepEqual(current.get(key),old,`vehicle must keep its identity and location: ${key}`);}
  assert.equal(new Set(page.data.markers.map(m=>m.id)).size,page.data.markers.length,'all marker IDs must remain unique');};
same();page.lastMarkerTapAt=now-500;page.onMapTap();
assert.equal(page.data.selectedTarget,null);assert.equal(page.data.activeRouteId,'');assert.equal(page.data.polylines.length,0);same();
for(const show of [true,false,true]){page.data.showBusStops=show;page.data.showDiningPois=show;page.refreshMap();same();}
const repeated=Object.entries(page.markerRefs).find(([,r])=>r.type==='vehicle'&&r.vehicle.route.id==='8');
page.onMarkerTap({markerId:Number(repeated[0])});same();
now+=1000;page.refreshMap();const later=snapshot();
for(const [key,old]of initial)if(later.has(key))assert.equal(later.get(key).id,old.id);
assert([...initial].some(([key,old])=>later.has(key)&&(later.get(key).lat!==old.lat||later.get(key).lon!==old.lon)),'normal vehicle updates must continue');
console.log('PASS: select/deselect, route removal, stop/dining toggles keep stable vehicle IDs; no coordinate reset; normal motion continues');
