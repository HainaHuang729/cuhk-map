import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const path='/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
const realRequire=createRequire(path);
const epoch=Date.parse('2026-10-05T08:20:00+08:00');
class FixedDate extends Date {
 constructor(...args){super(...(args.length?args:[epoch]));}
 static now(){return epoch;}
}
const runtime=vm.createContext({Intl:undefined,Date:FixedDate});
vm.runInContext(fs.readFileSync('data/eta_prediction.js','utf8'),runtime);
vm.runInContext(fs.readFileSync('data/campus_updates.js','utf8'),runtime);
const storage=new Map();
let definition;
const context=vm.createContext({
 Date:FixedDate,Intl:undefined,
 require:(name)=>name.endsWith('/etaPrediction.js')?runtime.CUHK_ETA_PREDICTION:name.endsWith('/campusUpdates.js')?runtime.CUHK_CAMPUS_UPDATES:realRequire(name),
 Page:(page)=>{definition=page;},
 wx:{getStorageSync:(key)=>storage.get(key),setStorageSync:(key,value)=>storage.set(key,value)},
 setTimeout,clearTimeout,setInterval,clearInterval,
});
vm.runInContext(fs.readFileSync(path,'utf8'),context);
const page=Object.create(definition);
page.data=JSON.parse(JSON.stringify(definition.data));
page.boardReports=[];
page.importedCourseMeetings=[];
page.setData=(patch,callback)=>{Object.assign(page.data,patch);callback?.();};
page.refreshMap();
const vehicles=()=>Object.values(page.markerRefs).filter(ref=>ref.type==='vehicle');
assert(vehicles().length>0,'initial map must include vehicles');
assert(page.data.metroItems.length>0,'route diagram must include vehicles');
assert(Object.values(page.markerRefs).some(ref=>ref.type==='courseRoom'),'activity buildings must render');
page.data.showBusVehicles=false;
page.refreshMap();
assert.equal(vehicles().length,0);
page.data.showBusVehicles=true;
page.data.activeRouteId='8';
page.refreshMap();
assert(vehicles().length>0);
assert(page.data.polylines.length>0);
page.data.selectedTarget={type:'courseRoom',id:'course-room/rrs',room:'RRS'};
page.refreshMap();
const hallRefs=Object.values(page.markerRefs).filter(ref=>ref.type==='courseRoom'&&ref.location.id==='course-room/rrs');
assert.equal(hallRefs.length,1,'activity and selected building markers must not duplicate');
const hallMarker=page.data.markers.find(marker=>page.markerRefs[marker.id]===hallRefs[0]);
assert.match(hallMarker.callout.content,/共融/);
for(const width of [320,375,430,768]){
 context.wx.getWindowInfo=()=>({windowWidth:width,statusBarHeight:44});
 context.wx.getMenuButtonBoundingClientRect=()=>({top:50,bottom:82,left:width-100});
 page.updateTopSearchLayout();
 assert(page.data.topSearchTop>=44,'search row must avoid status bar');
 assert(width-page.data.topSearchRight<=width-100-8,'search row must end before WeChat capsule');
 assert.equal(page.data.topSearchTop,48,'search row must align with capsule');
 assert(page.data.topSearchPanelTop>=page.data.topSearchTop+36,'results must not cover search row');
 assert(width-12-page.data.topSearchRight-36-8>=140,'compact search entry must retain usable width');
}
context.wx.getWindowInfo=()=>{throw new Error('old device API');};
context.wx.getMenuButtonBoundingClientRect=undefined;
page.updateTopSearchLayout();
assert(Number.isFinite(page.data.topSearchTop));
page.closeSideMenu=()=>{page.data.sideMenuOpen=false;};
page.showBuildingSearchFromMenu();
assert.equal(page.data.buildingSearchVisible,true);
assert.equal(page.data.routeSearchActiveField,'destination');
context.searchQuery='LEAP';
assert(vm.runInContext('searchBuildingAbbreviations(searchQuery).some(result=>result.key.startsWith("campus-event-"))',context));
page.closeBuildingSearch();
assert.equal(page.data.buildingSearchVisible,false);
const markup=fs.readFileSync(path.replace('.js','.wxml'),'utf8');
assert.match(markup,/class="map-search-entry" bindtap="showBuildingSearchFromMenu"/);
assert(!markup.includes('bindtap="showBuildingSearchFromMenu">路径'));
console.log('PASS: no-Intl full map refresh, vehicles, LCD list, visibility toggle, selected route and deduplicated activity callout');
console.log('PASS: top search geometry at 320/375/430/768px, safe-area fallback, search open/close and event lookup');

const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};
const originalApplyRoutePlan=page.applyRoutePlan;
const routeApplications=[];
page.applyRoutePlan=(point,target,options)=>routeApplications.push({point,target,options});
page.data.selectedTarget={type:'stop',id:'shaw_hall'};
let location=deferred();
page.currentLocation=()=>location.promise;
page.planRouteToSelectedTarget();
page.closeRoutePlan();
location.resolve({latitude:22.417,longitude:114.212});
await settle();
assert.equal(routeApplications.length,0,'cancelled navigation must ignore late GPS');
const olderLocation=deferred();
page.currentLocation=()=>olderLocation.promise;
page.planRouteToSelectedTarget();
const newerLocation=deferred();
page.currentLocation=()=>newerLocation.promise;
page.planRouteToSelectedTarget();
olderLocation.resolve({latitude:22.417,longitude:114.212});
await settle();
assert.equal(routeApplications.length,0,'new navigation must supersede old GPS request');
newerLocation.resolve({latitude:22.418,longitude:114.213});
await settle();
assert.equal(routeApplications.length,1,'current navigation must still complete');
page.closeRoutePlan();
page.data.routeSearchOriginUsesCurrentLocation=true;
page.data.routeSearchDestinationUsesCurrentLocation=false;
page.data.routeSearchDestinationTarget={type:'stop',id:'shaw_hall'};
location=deferred();
page.currentLocation=()=>location.promise;
page.submitTwoPointRouteSearch();
page.closeRoutePlan();
location.reject(new Error('cancelled GPS timeout'));
await settle();
assert.equal(page.data.routePlanSummary,'正在读取我的位置','late GPS error must not overwrite cancelled route state');
page.applyRoutePlan=originalApplyRoutePlan;

context.wx.showToast=()=>{};
for(const cancel of [()=>page.searchCourseCatalogAsync(''),()=>page.closeCourseCatalogSearch(),()=>page.onCourseCatalogQueryInput({detail:{value:''}})]){
 const cloudResult=deferred();
 context.wx.cloud={callFunction:()=>cloudResult.promise};
 page.searchCourseCatalogAsync('no-such-course-test');
 cancel();
 const status=page.data.courseCatalogStatusText;
 cloudResult.resolve({result:{ok:false,message:'STALE RESULT'}});
 await settle();
 assert.equal(page.data.courseCatalogStatusText,status,'cleared or closed search must ignore old cloud response');
 if(page.courseCatalogSearchTimer) clearTimeout(page.courseCatalogSearchTimer);
}
console.log('PASS: cancelled/superseded navigation and cleared/closed/changed course searches ignore late async results');
