import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const mini='/Users/amadeus/WeChatProjects/miniprogram-1';
const dataset=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const baseline=JSON.parse(fs.readFileSync(`${mini}/cloud/app_config_latest.example.json`,'utf8'));
const ctx=vm.createContext({});
const source=fs.readFileSync(`${root}/data/cuhk_bus_routes.js`,'utf8').replace('root.CUHK_BUS_UTILS = {','root.CUHK_BUS_UTILS = { routeStopServedAtDeparture,');
vm.runInContext(source,ctx);
vm.runInContext(fs.readFileSync(`${root}/data/transport_route_schemes.js`,'utf8'),ctx);
vm.runInContext(fs.readFileSync(`${root}/data/eta_prediction.js`,'utf8'),ctx);
ctx.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(ctx.CUHK_BUS_DATA,'2026-09');
const utils=ctx.CUHK_BUS_UTILS,api=ctx.CUHK_ETA_PREDICTION;
const round=x=>Math.round(x*100)/100;
const median=xs=>{const a=xs.slice().sort((a,b)=>a-b);return a.length?a[Math.floor(a.length/2)]:NaN;};
const pool=(rows,key)=>rows.filter(x=>key(x));
const estimate=(rows,value,prior)=>{
  if(!rows.length)return prior;
  const center=median(rows.map(value));
  const clean=rows.filter(x=>Math.abs(value(x)-center)<=Math.max(center*0.8,0.4));
  const weight=clean.reduce((sum,x)=>sum+(x.routeScheme==='2026-09'?2:0.5),0);
  return (median(clean.map(value))*weight+prior*4)/(weight+4);
};
const localDate=timestamp=>Number.isFinite(Date.parse(timestamp))?utils.hongKongClock(new Date(timestamp)).dateString:'';
const endDate=x=>x.serviceDate||localDate(x.fromTimestamp||x.timestamp||x.observedAt);
function train(before='9999',matchUntil=before){
  const segments=dataset.segmentObservations.filter(x=>x.eligibleForSegmentTraining&&endDate(x)<before);
  const dwells=dataset.dwellObservations.filter(x=>x.eligibleForDwellTraining&&!x.censoredAtRideEnd&&endDate(x)<before);
  const presences=dataset.boardConstraints.filter(x=>x.eligibleForTimeConstraint&&x.routeScheme==='2026-09'&&localDate(x.timestamp)<matchUntil);
  const model={schema:'cuhk_eta_prediction_v1',version:7,routeScheme:'2026-09',trainedThrough:'2026-10-04',routes:{}};
  const matches=[];
  for(const route of ctx.CUHK_BUS_DATA.routes){
    if(!route.schedule||!route.stops?.length)continue;
    const definitions={stopIds:route.stops,profiles:{}};
    const keys=['all',...['weekday','saturday','sunday'].flatMap(d=>['overnight','early_morning','morning_peak','morning','lunch','afternoon','evening_peak','night'].map(t=>`${d}_${t}`))];
    const priorOffsets=route.stops.map((_,i)=>utils.routeStopOffsetMinutes(route,i));
    for(const key of keys){
      const dwellSeconds=route.stops.map((stop,index)=>{
        const prior=baseline.etaModel.stopDwell[stop]?.seconds||14;
        const all=dwells.filter(x=>x.stopId===stop);
        const recent=all.filter(x=>x.routeScheme==='2026-09');
        const day=key.split('_')[0];
        const sameDay=all.filter(x=>x.serviceDayType===day);
        const sameDayRecent=sameDay.filter(x=>x.routeScheme==='2026-09');
        const selected=key==='all'?(recent.length>=3?recent:all):(sameDayRecent.length>=3?sameDayRecent:sameDay);
        const base=estimate(selected,x=>x.seconds,prior);
        const scoped=recent.filter(x=>`${x.serviceDayType}_${x.serviceTimeBucket}`===key);
        return round(Math.min(150,Math.max(4,scoped.length>=3?estimate(scoped,x=>x.seconds,base):base)));
      });
      const offsets=[0];
      for(let i=1;i<route.stops.length;i++){
        const from=route.stops[i-1],to=route.stops[i],segmentKey=`${from}->${to}`;
        const routePrior=baseline.etaModel.routeSegments[`${route.etaRouteId||route.id}:${segmentKey}`];
        const old=routePrior&&!String(routePrior.source).startsWith('manual_reference_')?routePrior:baseline.etaModel.segments[segmentKey]||routePrior;
        const prior=Math.max(0.2,old?.minutes||priorOffsets[i]-priorOffsets[i-1]);
        const all=segments.filter(x=>x.fromStopId===from&&x.toStopId===to);
        const recent=all.filter(x=>x.routeScheme==='2026-09');
        const drive=all.filter(x=>x.eligibleForDrivingTraining);
        const scoped=recent.filter(x=>`${x.serviceDayType}_${x.serviceTimeBucket}`===key);
        let total=estimate(recent.length>=3?recent:all,x=>x.minutes,prior);
        if(drive.length>=3){
          const priorDrive=Math.max(0.2,prior-(baseline.etaModel.stopDwell[from]?.seconds||14)/60);
          const recentDrive=drive.filter(x=>x.routeScheme==='2026-09');
          let driving=estimate(recentDrive.length>=3?recentDrive:drive,x=>x.drivingSeconds/60,priorDrive);
          const bucketDrive=recentDrive.filter(x=>`${x.serviceDayType}_${x.serviceTimeBucket}`===key);
          if(bucketDrive.length>=3)driving=estimate(bucketDrive,x=>x.drivingSeconds/60,driving);
          total=driving+dwellSeconds[i-1]/60;
        }else if(scoped.length>=3)total=estimate(scoped,x=>x.minutes,total);
        offsets.push(round(offsets.at(-1)+Math.max(0.2,total)));
      }
      definitions.profiles[key]={offsets,dwellSeconds};
    }
    model.routes[route.id]=definitions;
    // Presence is an interval: arrival is no later than boarding, and may precede it by dwell.
    const constraints=presences.filter(x=>x.routeId===route.id);
    for(const c of constraints){
      const index=c.stopIndex;
      if(!Number.isInteger(index)||index<=0||route.stops[index]!==c.stopId)continue;
      const at=new Date(c.timestamp),clock=utils.hongKongClock(at),key=api.bucket(at),p=definitions.profiles[key];
      let cursor=new Date(`${clock.dateString}T00:00:00+08:00`),departures=[];
      for(let n=0;n<100;n++){
        const next=utils.nextDeparture(route,cursor);if(!next)break;
        if(utils.routeStopServedAtDeparture(route,index,next.departure,at))departures.push(next.departure);
        cursor=new Date(Date.parse(`${clock.dateString}T00:00:00+08:00`)+(next.departure+0.1)*60000);
      }
      const candidates=departures.map(departure=>{
        const observed=clock.minutes-departure,upper=observed,lower=observed-Math.min(150,p.dwellSeconds[index])/60;
        const residual=p.offsets[index]<lower?lower-p.offsets[index]:p.offsets[index]>upper?upper-p.offsets[index]:0;
        return {departure,lower,upper,residual,error:Math.abs(residual)};
      }).sort((a,b)=>a.error-b.error);
      if(!candidates.length||candidates[0].error>4||(candidates[1]&&candidates[1].error-candidates[0].error<2))continue;
      matches.push({routeId:route.id,index,key,timestamp:c.timestamp,sessionId:c.sessionId||c.constraintId||c.timestamp,...candidates[0]});
    }
  }
  for(const [routeId,item] of Object.entries(model.routes))for(const [key,p] of Object.entries(item.profiles)){
    const adjustments=p.offsets.map((_,i)=>{
      const candidates=matches.filter(x=>localDate(x.timestamp)<before&&x.routeId===routeId&&x.index===i&&(key==='all'||x.key===key));
      const rows=[...new Map(candidates.map(x=>[`${x.sessionId}:${x.departure}`,x])).values()];
      const dates=new Set(rows.map(x=>localDate(x.timestamp)));
      return i>0&&rows.length>=3&&dates.size>=2?Math.max(-3,Math.min(3,median(rows.map(x=>x.residual))))*rows.length/(rows.length+8):0;
    });
    for(let i=1;i<p.offsets.length;i++)p.offsets[i]=round(Math.max(p.offsets[i-1]+0.2,p.offsets[i]+adjustments[i]));
    p.presenceAdjustmentsMinutes=adjustments.map(round);
  }
  return {model,matches,counts:{segments:segments.length,dwells:dwells.length,presenceCandidates:presences.length,matchedPresences:matches.length}};
}
const validation=train('2026-09-24','9999');
const heldout=dataset.segmentObservations.filter(x=>x.routeScheme==='2026-09'&&x.eligibleForSegmentTraining&&endDate(x)>='2026-09-24');
const errors=[];
for(const x of heldout){
  const route=ctx.CUHK_BUS_DATA.routes.find(r=>r.id===x.routeId);
  const index=x.toStopIndex??route?.stops.findIndex((s,i)=>i>0&&s===x.toStopId&&route.stops[i-1]===x.fromStopId);
  if(!route||index<=0)continue;
  const p=validation.model.routes[route.id].profiles[`${x.serviceDayType}_${x.serviceTimeBucket}`]||validation.model.routes[route.id].profiles.all;
  const key=`${x.fromStopId}->${x.toStopId}`;
  const old=baseline.etaModel.routeSegments[`${route.id}:${key}`]||baseline.etaModel.segments[key];
  if(!old)continue;
  errors.push({routeId:x.routeId,sessionId:x.sessionId,oldError:Math.abs(old.minutes-x.minutes),newError:Math.abs(p.offsets[index]-p.offsets[index-1]-x.minutes)});
}
const final=train();
const oldMae=errors.reduce((s,x)=>s+x.oldError,0)/errors.length;
const newMae=errors.reduce((s,x)=>s+x.newError,0)/errors.length;
const protectExisting=!(Number.isFinite(newMae)&&newMae<oldMae);
function retainExisting(model,corrections){
  for(const route of ctx.CUHK_BUS_DATA.routes){
    const item=model.routes[route.id];if(!item)continue;
    for(const p of Object.values(item.profiles)){
      const next=[0];
      for(let i=1;i<route.stops.length;i++){
        const key=`${route.stops[i-1]}->${route.stops[i]}`;
        const r=baseline.etaModel.routeSegments[`${route.etaRouteId||route.id}:${key}`];
        const old=r&&!String(r.source).startsWith('manual_reference_')?r:baseline.etaModel.segments[key]||r;
        next.push(round(next.at(-1)+(old?.minutes??Math.max(0.2,p.offsets[i]-p.offsets[i-1]))));
      }
      for(let i=1;i<next.length;i++)next[i]=round(Math.max(next[i-1]+0.2,next[i]+(corrections?p.presenceAdjustmentsMinutes[i]||0:0)));
      p.offsets=next;
    }
  }
}
if(protectExisting)retainExisting(validation.model,true);
const presenceErrors=validation.matches.filter(x=>localDate(x.timestamp)>='2026-09-24').map(x=>{
  const route=ctx.CUHK_BUS_DATA.routes.find(r=>r.id===x.routeId);
  const old=utils.routeStopOffsetMinutes(route,x.index);
  const next=validation.model.routes[x.routeId].profiles[x.key].offsets[x.index];
  const error=value=>Math.max(0,x.lower-value,value-x.upper);
  return {oldError:error(old),newError:error(next)};
});
const presenceOld=presenceErrors.reduce((s,x)=>s+x.oldError,0)/presenceErrors.length;
const presenceNew=presenceErrors.reduce((s,x)=>s+x.newError,0)/presenceErrors.length;
const activatePresence=presenceErrors.length>=10&&presenceNew<presenceOld;
if(protectExisting)retainExisting(final.model,activatePresence);
final.model.safeguards={existingSegmentParametersRetained:protectExisting,presenceCorrectionsEnabled:activatePresence,maxPresenceCorrectionMinutes:3,minPresenceSamples:3,minPresenceDates:2};
const report={schema:'cuhk_eta_prediction_training_report_v1',generatedAt:new Date().toISOString(),counts:final.counts,
  validation:{split:'train before 2026-09-24, test from 2026-09-24; no GPS point random split',testSamples:errors.length,
    oldMaeMinutes:round(oldMae),candidateMaeMinutes:round(newMae),existingSegmentParametersRetained:protectExisting,errors,
    presenceTestSamples:presenceErrors.length,presenceOldIntervalErrorMinutes:round(presenceOld),presenceCandidateIntervalErrorMinutes:round(presenceNew),presenceCorrectionsEnabled:activatePresence},
  presenceMatches:final.matches,limitations:['Presence matches depend on published departure times; unmatched observations remain in the dataset.','No passenger counts or historic weather features.','Stop visits are proximity observations, not direct door-open/door-close signals.']};
const config={...baseline,version:7,updatedAt:'2026-10-04T12:00:00+08:00',etaModel:{...baseline.etaModel,predictionModel:final.model}};
fs.writeFileSync(`${mini}/cloud/app_config_prediction_2026-10-04.json`,JSON.stringify(config,null,2)+'\n');
fs.writeFileSync('/Users/amadeus/Desktop/cuhk-eta-model-report-2026-10-04.json',JSON.stringify(report,null,2)+'\n');
const js=`(function(root){const model=${JSON.stringify(final.model)};if(typeof module!=="undefined"&&module.exports)module.exports=model;root.CUHK_ETA_MODEL=model;})(typeof window!=="undefined"?window:globalThis);\n`;
fs.writeFileSync(`${root}/data/eta_model.js`,js);
fs.writeFileSync(`${mini}/miniprogram/data/etaModel.js`,js);
console.log(JSON.stringify({counts:report.counts,validation:report.validation,modelBytes:Buffer.byteLength(js)},null,2));
