import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {makeRoadCatalog, availabilityIndex, buildEvidence, contextAt} from './rebuild_eta_analysis.mjs';
import {assertPrivateOutput, intervalPrediction, intervalReview, validationStops} from './validate_term_eta.mjs';
import {TERM} from './build_term_model.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const round=n=>Number.isFinite(n)?Math.round(n*100)/100:null;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const median=xs=>{const a=xs.slice().sort((x,y)=>x-y);return a.length?(a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2:null;};
const group=(rows,key)=>{const m=new Map();for(const row of rows){const k=key(row);if(!m.has(k))m.set(k,[]);m.get(k).push(row);}return m;};
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');

// A conservative scenario, not a fitted parameter or a claim of missed door-open dwell.
export function proposedExtraSeconds(currentDwell,lowMotionSeconds,currentInterval,observedInterval) {
  if(![currentDwell,lowMotionSeconds,currentInterval,observedInterval].every(Number.isFinite)
    ||currentDwell<0||lowMotionSeconds<0||currentInterval<=currentDwell||observedInterval<=0)return 0;
  const budget=Math.min(30,150-currentDwell,(lowMotionSeconds-currentDwell)*0.5,observedInterval-currentInterval);
  return Math.max(0,Math.floor(budget/5)*5);
}

export function nearStopLowMotion(samples,stopCoord,detector,distance) {
  const accepted=[],rejected=[];
  for(const cluster of detector(samples)){
    const meters=distance(cluster.center,stopCoord);
    const times=cluster.samples.map(row=>Date.parse(row.timestamp));
    const maxGap=times.slice(1).reduce((max,at,i)=>Math.max(max,(at-times[i])/1000),0);
    const item={seconds:cluster.durationSeconds,meters:round(meters),maxSampleGapSeconds:round(maxGap),
      startedAt:cluster.startedAt,endedAt:cluster.endedAt};
    if(meters<=50&&maxGap<=10)accepted.push(item);else rejected.push(item);
  }
  return {seconds:accepted.reduce((sum,row)=>sum+row.seconds,0),accepted,rejected,
    meaning:'Existing 18m cluster detector, <=40m GPS accuracy, <=50m from station and <=10s sample gaps; low motion is not proven door-open dwell.'};
}

export function hasContinuousVisitCoverage(samples,start,end) {
  const times=samples.filter(row=>Number.isFinite(row.lon)&&Number.isFinite(row.lat)
    &&(!Number.isFinite(row.accuracy)||row.accuracy<=40)).map(row=>Date.parse(row.timestamp))
    .filter(Number.isFinite).sort((a,b)=>a-b);
  return times.length>=3&&Number.isFinite(start)&&Number.isFinite(end)&&end>start
    &&times[0]-start<=10000&&end-times.at(-1)<=10000
    &&times.slice(1).every((at,i)=>at-times[i]<=10000);
}

export function summarizeDwellCandidates(observations) {
  const results=[];
  for(const rows of group(observations,row=>JSON.stringify([row.routeId,row.stopIndex,row.dayType,row.timeBand])).values()){
    const first=rows[0],usable=rows.filter(row=>row.reviewReasons.length===0);
    const sessions=[...group(usable,row=>row.sessionId).values()].map(list=>({
      lowMotion:mean(list.map(row=>row.lowMotion.seconds)),interval:mean(list.map(row=>row.observedIntervalSeconds))}));
    const low=median(sessions.map(row=>row.lowMotion)),interval=median(sessions.map(row=>row.interval));
    const extra=proposedExtraSeconds(first.currentDwellSeconds,low,first.currentIntervalSeconds,interval);
    results.push({routeId:first.routeId,stopId:first.stopId,stopIndex:first.stopIndex,stopLabel:first.stopLabel,
      nextStopLabel:first.nextStopLabel,dayType:first.dayType,timeBand:first.timeBand,
      observations:rows.length,usableObservations:usable.length,sessions:sessions.length,
      dates:[...new Set(usable.map(row=>row.date))].sort(),
      reviewRequiredObservations:rows.length-usable.length,
      sourceMissingDwellSummary:rows.filter(row=>row.missingDwellSummary).length,
      currentDwellSeconds:first.currentDwellSeconds,medianLowMotionSeconds:round(low),
      currentIntervalSeconds:first.currentIntervalSeconds,medianObservedIntervalSeconds:round(interval),
      extraDwellSeconds:extra,proposedDwellSeconds:round(first.currentDwellSeconds+extra),
      hypotheticalNextIntervalSeconds:round(first.currentIntervalSeconds+extra),
      status:extra?'offline_trial_only':sessions.length?'no_increase_supported':'needs_review_or_no_interval',
      scope:'Only this route, stop occurrence, day type and clock band. Do not copy to other routes or periods.'});
  }
  return results;
}

const band={early:'清晨',morning_peak:'早间',morning:'上午',lunch:'午间 11:30–14:00',afternoon:'下午',evening_peak:'晚间高峰时段',night:'夜间'};
const day={weekday:'工作日',saturday:'周六',sunday:'周日'};
const fmt=n=>Number.isFinite(n)?Math.round(n):'—';
const escape=value=>String(value).replace(/\r?\n/g,' ').replace(/\|/g,'\\|');
function markdown(report) {
  const positive=report.candidates.filter(row=>row.extraDwellSeconds>0);
  const lines=['# 分站停站增量：离线试验建议','',
    '只使用开学期原始记录；原模型、云数据和小程序均未修改。','',
    '以下不是精确上下客时间，而是原始 GPS 中靠近站点的低速停留。进出站经过 120 米站区的全部时间不能都当停车。',
    '现有到站至到站用时已经包含停车；表内增量只是“当前停车分量偏短”的试验假设，不是已确认漏算的时间。',
    '按线路、站序、工作日类型和时段单独分析。只有低速停留比当前停车值长、相邻区间实测也比当前区间长时才给正增量。',
    '试验规则：低速停留差额只取一半，不超过相邻区间缺口，向下取整到 5 秒，每站最多增加 30 秒。不是优化得出的最优值。',
    '本次使用已看过、部分已参与模型训练的数据，只能生成待验证假设，不能宣称独立准确率提高。','',
    '| 线路 | 停车站 → 下一站 | 时段 | 当前停车（秒） | GPS低速停留中位数（秒） | 试加（秒） | 建议停车（秒） | 行程 / 天 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |'];
  for(const row of positive)lines.push(`| ${escape(row.routeId)} | ${escape(row.stopLabel)} → ${escape(row.nextStopLabel)} | ${day[row.dayType]} ${band[row.timeBand]} | ${fmt(row.currentDwellSeconds)} | ${fmt(row.medianLowMotionSeconds)} | +${row.extraDwellSeconds} | ${fmt(row.proposedDwellSeconds)} | ${row.sessions} / ${row.dates.length} |`);
  lines.push('','## 所有有驻留记录的站点','',
    '| 线路 | 站点 | 时段 | 当前停车（秒） | GPS低速停留（秒） | 当前相邻区间（秒） | 实测相邻区间（秒） | 试加（秒） | 可用行程 | 待核对观测 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for(const row of report.candidates)lines.push(`| ${escape(row.routeId)} | ${escape(row.stopLabel)} | ${day[row.dayType]} ${band[row.timeBand]} | ${fmt(row.currentDwellSeconds)} | ${fmt(row.medianLowMotionSeconds)} | ${fmt(row.currentIntervalSeconds)} | ${fmt(row.medianObservedIntervalSeconds)} | ${row.extraDwellSeconds} | ${row.sessions} | ${row.reviewRequiredObservations} |`);
  lines.push('','## 使用边界','',
    '- 一趟车的多个站不是多趟独立证据；相同日期、相同时段以外不外推。',
    '- “没有建议增加”不等于实际不用停车，只表示本批证据不能支持再加。',
    '- 始发上车和途中上车后的剩余停留不等于完整停车；本分析不从上车到首个目标站的差值硬算停车。',
    '- 该站停车只可能影响离站后的下一站，不影响车辆已经到达该站的时间。',
    '- MINI 有距时冲突的样本仍保留，不用于分配站点增量。没有相邻实测和低速定位支持的站不编造时长。',
    '- 若总区间时间已涵盖较长停车，只重新分配停车与行驶，不额外累加；下一步需重估分量并用新行程检验。',
    '- 间断定位、近站缓行、排队和真正上下客还不能完全区分，低速停留只能作交叉证据。','');
  return lines.join('\n');
}

function main() {
  const [input,rawDirectory,miniRoot,output]=process.argv.slice(2);
  if(!input||!rawDirectory||!miniRoot||!output)throw new Error('Usage: node scripts/analyze_station_dwell.mjs dataset.json raw-directory mini-project new-private-output');
  assertPrivateOutput(output);
  const source=fs.readFileSync(input,'utf8'),dataset=JSON.parse(source);
  const load=file=>JSON.parse(fs.readFileSync(path.join(rawDirectory,file),'utf8'));
  const catalog=makeRoadCatalog(dataset),evidence=buildEvidence(dataset,catalog,
    availabilityIndex(dataset,load('ride_gps_sessions.json'),load('ride_gps_sample_chunks.json')));
  const runtime=vm.createContext({});
  for(const file of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js','data/eta_model.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),runtime);
  runtime.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(runtime.CUHK_BUS_DATA,'2026-09');
  const model=runtime.CUHK_ETA_MODEL;
  const miniFile=path.join(path.resolve(miniRoot),'miniprogram/pages/index/index.js');
  const miniSource=fs.readFileSync(miniFile,'utf8');
  const mini=vm.createContext({require:createRequire(miniFile),Page(){},wx:{getStorageSync(){return null;}},setTimeout,clearTimeout,setInterval,clearInterval});
  vm.runInContext(miniSource,mini);
  const detector=vm.runInContext('detectDwellSegments',mini),distance=vm.runInContext('distanceMetersBetween',mini),map=vm.runInContext('MAP_DATA',mini);
  const stationNames=new Map(validationStops(dataset,runtime.CUHK_BUS_DATA.routes).map(row=>[`${row.routeId}:${row.stopIndex}`,row.stopLabel]));
  const observations=[];
  for(const row of evidence.dwell.filter(row=>row.period===TERM.id&&row.routeScheme===model.routeScheme)){
    const station=model.routes[row.routeId],p=station?.profiles.all,index=row.stopIndex;
    if(!p||station.stopIds[index]!==row.stopId||index>=station.stopIds.length-1)continue;
    const recording=evidence.recordings.get(row.sessionId),start=Date.parse(row.visitStartedAt),end=Date.parse(row.visitEndedAt);
    const samples=(recording?.gpsSamples||[]).filter(point=>Date.parse(point.timestamp)>=start&&Date.parse(point.timestamp)<=end);
    const stop=map.stops[row.stopId];
    const lowMotion=stop?nearStopLowMotion(samples,stop.coord,detector,distance):{seconds:0,accepted:[],rejected:[]};
    const spans=evidence.spans.filter(span=>span.sessionId===row.sessionId&&span.routeId===row.routeId&&span.fromStopIndex===index&&span.toStopIndex===index+1&&span.originKind==='arrival_dwell');
    const span=spans.length===1?spans[0]:null;
    const prediction=span&&intervalPrediction(model,span);
    const reviewReasons=[...new Set([...(row.flags||[]),...(span?.flags||[]),...(span?intervalReview(span).reviewFlags:[])])];
    if(row.censored)reviewReasons.push('truncated_visit');
    if(!span||!prediction)reviewReasons.push('missing_unambiguous_adjacent_interval');
    if(!hasContinuousVisitCoverage(samples,start,end))reviewReasons.push('incomplete_low_motion_track_coverage');
    if(row.routeId.startsWith('MINI'))reviewReasons.push('mini_route_requires_separate_review');
    const clock=contextAt(row.at);
    observations.push({sessionId:row.sessionId,routeId:row.routeId,stopId:row.stopId,stopIndex:index,
      stopLabel:stationNames.get(`${row.routeId}:${index}`),nextStopLabel:stationNames.get(`${row.routeId}:${index+1}`),
      date:row.date,dayType:clock.dayType,timeBand:clock.bucket,zoneSeconds:round(row.seconds),lowMotion,
      currentDwellSeconds:p.dwellSeconds[index],currentIntervalSeconds:round((p.offsets[index+1]-p.offsets[index])*60),
      observedIntervalSeconds:span?.seconds??null,
      missingDwellSummary:!dataset.dwellObservations.some(dwell=>dwell.sessionId===row.sessionId&&dwell.stopIndex===index),reviewReasons});
  }
  const candidates=summarizeDwellCandidates(observations);
  const report={schema:'cuhk_station_dwell_trial_v1',createdAt:new Date().toISOString(),datasetSha256:hash(source),modelSha256:hash(JSON.stringify(model)),
    detectorSourceSha256:hash(miniSource),period:TERM,modelVersion:model.version,modelTrainedThrough:model.trainedThrough,
    independentTest:false,productionChanged:false,rawRecordsDeleted:0,observations,candidates};
  fs.mkdirSync(output,{mode:0o700});
  fs.writeFileSync(path.join(output,'dwell-analysis.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  fs.writeFileSync(path.join(output,'dwell-proposals.md'),markdown(report),{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({output,observations:observations.length,positiveCandidates:candidates.filter(row=>row.extraDwellSeconds>0),productionChanged:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
