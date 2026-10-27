import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {generateTermModel, TERM} from './build_term_model.mjs';
import {makeRoadCatalog, availabilityIndex, buildEvidence, contextAt} from './rebuild_eta_analysis.mjs';
import {renderStationMarkdown, renderStationCsv} from './format_eta_validation.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const epoch = value => Date.parse(value || '');
const mean = values => values.length ? values.reduce((a,b)=>a+b,0)/values.length : null;
const round = value => Number.isFinite(value) ? Math.round(value*100)/100 : null;
const group = (rows,key) => {const result=new Map();for(const row of rows){const id=key(row);if(!result.has(id))result.set(id,[]);result.get(id).push(row);}return result;};

export function intervalReview(label) {
  const meters=Array.isArray(label.legs)&&label.legs.length&&label.legs.every(leg=>Number.isFinite(leg.meters)&&leg.meters>0)
    ?label.legs.reduce((sum,leg)=>sum+leg.meters,0):null;
  const kmh=meters!==null&&Number.isFinite(label.seconds)&&label.seconds>0?meters/label.seconds*3.6:null;
  return {routeMeters:round(meters),impliedRouteKmh:round(kmh),
    reviewFlags:kmh!==null&&kmh>80?['route_distance_time_conflict']:[]};
}

export function intervalPrediction(model, label) {
  const route=model.routes[label.routeId], a=label.fromStopIndex, b=label.toStopIndex;
  if(!route || !Number.isInteger(a) || !Number.isInteger(b) || a<0 || b<=a || b>=route.stopIds.length
    || route.stopIds[a]!==label.fromStopId || route.stopIds[b]!==label.toStopId) return null;
  if(label.legs&&(label.legs.length!==b-a||label.legs.some((leg,index)=>leg.from!==route.stopIds[a+index]||leg.to!==route.stopIds[a+index+1])))return null;
  const offsets=route.profiles.all.offsets;
  const seconds=(offsets[b]-offsets[a])*60;
  if(!(seconds>0 && Number.isFinite(seconds)))return null;
  return {seconds, measured:route.segmentEvidence.slice(a,b).every(row=>row.samples>0)};
}

export function errorSummary(rows) {
  const errors=rows.map(row=>Math.abs(row.errorSeconds)).sort((a,b)=>a-b);
  const percentile=p=>errors.length ? errors[Math.max(0,Math.ceil(errors.length*p)-1)] : null;
  return {observations:rows.length, sessions:new Set(rows.map(row=>row.sessionId)).size,
    days:new Set(rows.map(row=>row.date)).size,
    maeSeconds:round(mean(errors)),
    sessionBalancedMaeSeconds:round(mean([...group(rows,row=>row.sessionId).values()].map(list=>mean(list.map(row=>Math.abs(row.errorSeconds)))))),
    medianAbsoluteErrorSeconds:round(percentile(.5)), p90AbsoluteErrorSeconds:round(percentile(.9)),
    signedBiasSeconds:round(mean(rows.map(row=>row.errorSeconds))),
    within60SecondsPercent:rows.length?round(100*rows.filter(row=>Math.abs(row.errorSeconds)<=60).length/rows.length):null,
    within120SecondsPercent:rows.length?round(100*rows.filter(row=>Math.abs(row.errorSeconds)<=120).length/rows.length):null,
    fullyMeasuredPathPercent:rows.length?round(100*rows.filter(row=>row.measured).length/rows.length):null};
}

export function validationStops(dataset, routes) {
  return routes.flatMap(route=>{
    const occurrences=new Map();
    return route.stops.map((stopId,stopIndex)=>{
      const name=dataset.stops[stopId]?.name||stopId;
      const direction=route.stopDirections?.[stopIndex]||'';
      const occurrence=(occurrences.get(stopId)||0)+1;
      occurrences.set(stopId,occurrence);
      const repeated=route.stops.filter(id=>id===stopId).length>1;
      const suffix=direction||(repeated?(stopIndex===0?'始发':stopIndex===route.stops.length-1?'终点':`第${occurrence}次经过`):'');
      return {routeId:route.id,routeName:route.name||route.id,stopId,stopIndex,stopName:name,
        direction,stopLabel:name+(suffix?`（${suffix}）`:'')};
    });
  });
}

const stationKey=(routeId,index)=>JSON.stringify([routeId,index]);

export function routeStopErrors(rows, stations) {
  const lookup=new Map(stations.map(station=>[stationKey(station.routeId,station.stopIndex),station]));
  for(const row of rows){
    const from=lookup.get(stationKey(row.routeId,row.fromStopIndex));
    const to=lookup.get(stationKey(row.routeId,row.toStopIndex));
    if(!Number.isInteger(row.fromStopIndex)||!Number.isInteger(row.toStopIndex)||row.toStopIndex<=row.fromStopIndex
      ||from?.stopId!==row.fromStopId||to?.stopId!==row.toStopId)throw new Error('Cannot group errors without an exact route and stop occurrence');
  }
  const describe=list=>{
    const metrics=errorSummary(list);
    return {...metrics,meanActualSeconds:round(mean(list.map(row=>row.actualSeconds))),
      meanPredictedSeconds:round(mean(list.map(row=>row.predictedSeconds))),
      reviewRequiredObservations:list.filter(row=>row.reviewFlags?.length).length,
      reviewRequiredSessions:new Set(list.filter(row=>row.reviewFlags?.length).map(row=>row.sessionId)).size,
      reviewFlags:[...new Set(list.flatMap(row=>row.reviewFlags||[]))],
      sampleStatus:!list.length?'no_observations':metrics.sessions<5||metrics.days<3?'sparse':'descriptive_only'};
  };
  const targets=group(rows,row=>stationKey(row.routeId,row.toStopIndex));
  const pairs=group(rows,row=>JSON.stringify([row.routeId,row.fromStopIndex,row.toStopIndex]));
  const byRouteStop=stations.map(station=>({...station,...describe(targets.get(stationKey(station.routeId,station.stopIndex))||[])}));
  const order=new Map(stations.map((station,index)=>[stationKey(station.routeId,station.stopIndex),index]));
  const byRouteStopPair=[...pairs.values()].map(list=>{
    const row=list[0],from=lookup.get(stationKey(row.routeId,row.fromStopIndex)),to=lookup.get(stationKey(row.routeId,row.toStopIndex));
    return {routeId:row.routeId,routeName:to.routeName,fromStopIndex:from.stopIndex,fromStopId:from.stopId,
      fromStopLabel:from.stopLabel,toStopIndex:to.stopIndex,toStopId:to.stopId,toStopLabel:to.stopLabel,...describe(list)};
  }).sort((a,b)=>order.get(stationKey(a.routeId,a.toStopIndex))-order.get(stationKey(b.routeId,b.toStopIndex))||a.fromStopIndex-b.fromStopIndex);
  return {byRouteStop,byRouteStopPair};
}

// Whole trips, dwell and upload availability are partitioned together, never individual GPS points.
export function trainingBefore(dataset, evidence, before, honorUploads=true) {
  const cutoff=epoch(`${before}T00:00:00+08:00`);
  const sessionLast=new Map();
  for(const row of [...evidence.reported,...evidence.labels]){
    const last=Math.max(row.at||0,epoch(row.toTimestamp)||0,row.availableAt&&honorUploads?row.availableAt:0);
    sessionLast.set(row.sessionId,Math.max(sessionLast.get(row.sessionId)||0,last));
  }
  for(const row of [...dataset.sessions,...(dataset.nonSegmentRecordings||[])]){
    sessionLast.set(row.sessionId,Math.max(sessionLast.get(row.sessionId)||0,epoch(row.endedAt||row.startedAt)||Infinity));
  }
  const eligible=row=>Number.isFinite(row.at)&&row.at<cutoff&&(sessionLast.get(row.sessionId)||Infinity)<cutoff
    &&(!honorUploads||row.availableAt<cutoff);
  const reported=evidence.reported.filter(row=>row.period===TERM.id&&eligible(row));
  const dwell=dataset.dwellObservations.filter(row=>{
    const at=epoch(row.fromTimestamp||row.observedAt||row.timestamp);
    const available=evidence.availability.get(row.sessionId)?.at;
    return at<cutoff&&(sessionLast.get(row.sessionId)||Infinity)<cutoff&&(!honorUploads||available<cutoff);
  });
  return {dataset:{...dataset,dwellObservations:dwell}, evidence:{...evidence,reported}};
}

export function freezeProtocol(dataset, model, now=new Date()) {
  return {schema:'cuhk_eta_prospective_validation_v1',frozenAt:now.toISOString(),
    frozenModel:model,modelSha256:sha(JSON.stringify(model)),
    knownSessionDigests:[...new Set([...dataset.sessions,...(dataset.nonSegmentRecordings||[])].map(row=>sha(row.sessionId)))],
    admission:'Only new whole journeys starting after frozenAt, absent from this snapshot. Score before using them for training.',
    target:'Elapsed time from an observed boarding time to a subsequent GPS stop visit, not exact door-open arrival or every scheduled bus ETA.',
    privacy:'Private validation protocol. Do not commit or deploy.'};
}

export function prospectiveLabels(dataset, evidence, protocol) {
  if(protocol.schema!=='cuhk_eta_prospective_validation_v1'||sha(JSON.stringify(protocol.frozenModel))!==protocol.modelSha256)
    throw new Error('Frozen validation model or protocol has changed');
  const known=new Set(protocol.knownSessionDigests), frozen=epoch(protocol.frozenAt);
  if(!Number.isFinite(frozen))throw new Error('Invalid freeze timestamp');
  const sessions=new Map([...dataset.sessions,...(dataset.nonSegmentRecordings||[])].map(row=>[row.sessionId,row]));
  return evidence.labels.filter(row=>{
    const session=sessions.get(row.sessionId), start=epoch(session?.startedAt);
    return row.period===TERM.id&&row.routeScheme===protocol.frozenModel.routeScheme&&!known.has(sha(row.sessionId))
      &&Number.isFinite(start)&&start>=frozen&&row.at>=frozen;
  });
}

function evaluate(model, labels) {
  const rows=[], unmatched=[];
  for(const label of labels){
    const prediction=intervalPrediction(model,label);
    if(!prediction){unmatched.push({sessionId:label.sessionId,reason:'route_or_stop_sequence_mismatch'});continue;}
    rows.push({sessionId:label.sessionId,date:label.date,routeId:label.routeId,fromStopId:label.fromStopId,toStopId:label.toStopId,
      fromStopIndex:label.fromStopIndex,toStopIndex:label.toStopIndex,
      actualSeconds:label.seconds,predictedSeconds:prediction.seconds,errorSeconds:prediction.seconds-label.seconds,
      measured:prediction.measured,timeBand:contextAt(label.at).bucket,...intervalReview(label)});
  }
  return {rows,unmatched,metrics:errorSummary(rows)};
}

export function validateSnapshot(dataset, evidence, catalog, routes, model, options={}) {
  const labels=evidence.labels.filter(row=>row.period===TERM.id&&row.routeScheme===model.routeScheme);
  const dates=[...new Set(labels.map(row=>row.date))].sort();
  const referenceDates=dates.slice(-Math.max(5,Math.ceil(dates.length*.2)));
  const stations=validationStops(dataset,routes);
  const replays=[];
  for(const honorUploads of [true,false]){
    const scored=[],skipped=[],folds=[];
    for(const day of referenceDates){
      const training=trainingBefore(dataset,evidence,day,honorUploads);
      const count=training.evidence.reported.filter(row=>row.source==='direct_observed'&&row.eligibleForSegmentTraining&&row.leg).length;
      const test=labels.filter(row=>row.date===day);
      if(!count){skipped.push({day,labels:test.length,reason:'no_earlier_same_term_training'});continue;}
      const fitted=generateTermModel(training.dataset,catalog,training.evidence,routes,day).model;
      const result=evaluate(fitted,test);scored.push(...result.rows);
      folds.push({day,training:fitted.training,metrics:result.metrics,unmatched:result.unmatched.length});
    }
    replays.push({kind:honorUploads?'upload_aware_replay':'observation_time_replay',
      meaning:honorUploads?'Only completed journeys uploaded before the prediction day are available.':'Post-hoc diagnostic assuming earlier observations were available; NOT an operational replay.',
      independentBlindTest:false,metrics:errorSummary(scored),folds,skipped,
      byRoute:Object.fromEntries([...group(scored,row=>row.routeId)].map(([id,rows])=>[id,errorSummary(rows)])),
      byTimeBand:Object.fromEntries([...group(scored,row=>row.timeBand)].map(([id,rows])=>[id,errorSummary(rows)])),
      ...routeStopErrors(scored,stations),
      predictions:scored});
  }
  const protocol=options.protocol||freezeProtocol(dataset,model,options.now);
  const future=prospectiveLabels(dataset,evidence,protocol);
  const prospective=evaluate(protocol.frozenModel,future);
  return {schema:'cuhk_term_eta_validation_v1',createdAt:(options.now||new Date()).toISOString(),
    modelVersion:model.version,trainingPeriod:model.trainingPeriod,trainedThrough:model.trainedThrough,
    referenceDates,referenceAlreadyInspected:true,independentBlindTestAvailable:prospective.rows.length>0,
    stationBreakdownPolicy:{key:'routeId + stopIndex; repeated stops and directions are never merged',
      sparseBelowSessions:5,sparseBelowDays:3,thresholdMeaning:'Display caution only, not an exclusion or proof of accuracy.',
      aggregation:'Target-stop totals mix boarding origins; consult boarding-to-target pairs before interpreting a station error.'},
    intervalReviewPolicy:{impliedRouteKmhAbove:80,
      meaning:'Review reminder for route-distance/time inconsistency, not a posted speed limit or proof the GPS point is false.',
      scoring:'Keep all original scores and records; mark affected aggregates instead of silently excluding them.'},
    currentSnapshot:{sessions:dataset.sessions.length,nonSegmentRecordings:dataset.nonSegmentRecordings?.length||0,
      arrivalLabels:labels.length,arrivalLabelSessions:new Set(labels.map(row=>row.sessionId)).size,
      presenceRecords:evidence.presence.length,shortRecordingsKeptAsPresence:true},
    replays,prospective:{frozenAt:protocol.frozenAt,metrics:prospective.metrics,unmatched:prospective.unmatched.length,
      ...routeStopErrors(prospective.rows,stations),predictions:prospective.rows},protocol,
    productionModelChanged:false,caveats:[
      'Observed GPS stop visits are approximate station-proximity timestamps, not precise door-open arrival times.',
      'Positive signed error means the predicted interval is too long; negative means too short. Old model output is never a truth label.',
      'Multiple targets from one journey are correlated; prefer session-balanced error and report journey/day counts.',
      'All archive records remain preserved. A single presence/boarding point is not fabricated into a travel-time interval.',
      'A route-distance/time conflict may reflect incorrect stop matching, a different actual path or GPS timing. Its raw residual is not established prediction accuracy.',
      'Summer and pre-term observations are not averaged into main-term training; clock bands do not measure passenger load.',
      'Historical reference records have already been inspected. Do not describe retrospective errors as a new independent-test result.']};
}

export function assertPrivateOutput(directory) {
  const absolute=path.resolve(directory);let existing=absolute;
  while(!fs.existsSync(existing))existing=path.dirname(existing);
  const resolved=path.resolve(fs.realpathSync(existing),path.relative(existing,absolute));
  for(let parent=resolved;;parent=path.dirname(parent)){
    if(fs.existsSync(path.join(parent,'.git'))||fs.existsSync(path.join(parent,'project.config.json'))||fs.existsSync(path.join(parent,'.openai/hosting.json')))
      throw new Error('Validation records must stay outside application/public source directories');
    if(path.dirname(parent)===parent)break;
  }
}

function main(){
  const [input,rawDirectory,output,...args]=process.argv.slice(2);
  if(!input||!rawDirectory||!output)throw new Error('Usage: node scripts/validate_term_eta.mjs dataset.json raw-snapshot-directory new-private-output [--protocol frozen-protocol.json]');
  const directory=path.resolve(output);assertPrivateOutput(directory);
  const source=fs.readFileSync(input,'utf8'),dataset=JSON.parse(source),load=name=>JSON.parse(fs.readFileSync(path.join(rawDirectory,name),'utf8'));
  const runtime=vm.createContext({});
  for(const file of ['data/cuhk_bus_routes.js','data/transport_route_schemes.js','data/eta_model.js'])vm.runInContext(fs.readFileSync(path.join(ROOT,file),'utf8'),runtime);
  runtime.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(runtime.CUHK_BUS_DATA,'2026-09');
  const catalog=makeRoadCatalog(dataset),availability=availabilityIndex(dataset,load('ride_gps_sessions.json'),load('ride_gps_sample_chunks.json'));
  const evidence=buildEvidence(dataset,catalog,availability);
  const protocolIndex=args.indexOf('--protocol');
  const protocol=protocolIndex>=0?JSON.parse(fs.readFileSync(args[protocolIndex+1],'utf8')):undefined;
  const geometry={routes:sha(fs.readFileSync(path.join(ROOT,'data/cuhk_bus_routes.js'))),schemes:sha(fs.readFileSync(path.join(ROOT,'data/transport_route_schemes.js')))};
  if(protocol&&JSON.stringify(protocol.geometry)!==JSON.stringify(geometry))throw new Error('Frozen geometry differs or is missing; do not score changed routes as the same test');
  const report=validateSnapshot(dataset,evidence,catalog,runtime.CUHK_BUS_DATA.routes,runtime.CUHK_ETA_MODEL,{protocol});
  report.protocol.geometry=geometry;
  fs.mkdirSync(directory,{mode:0o700});
  const save=(name,value)=>fs.writeFileSync(path.join(directory,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
  save('frozen-protocol.json',report.protocol);
  save('validation-report.json',{...report,datasetSha256:sha(source)});
  save('station-errors.md',renderStationMarkdown(report));
  save('station-errors.csv',renderStationCsv(report));
  const summary=['CUHK ETA 验证报告','',`模型版本：${report.modelVersion}；计时训练截至：${report.trainedThrough}`,
    `最近参考日期：${report.referenceDates.join('、')}`,'这些旧参考数据已被查看，以下是历史回看，不是新的独立测试。','',
    ...report.replays.map(row=>`${row.kind==='upload_aware_replay'?'按实际上传可用时间回放':'仅按观测日期回看'}：${row.metrics.observations}个到站点、${row.metrics.sessions}趟行程、${row.metrics.days}天；行程均衡平均绝对误差 ${row.metrics.sessionBalancedMaeSeconds??'无可用结果'} 秒；P90 ${row.metrics.p90AbsoluteErrorSeconds??'无可用结果'} 秒`),
    '',`冻结时间：${report.protocol.frozenAt}；符合冻结后规则的新验证行程：${report.prospective.metrics.sessions}`,
    '后续先验证新行程，再将其用于训练；零样本不代表零误差。',
    '短行程、单点广播继续保留为车辆在站的时间约束，不伪造站间用时。',
    '暑假与开学期分开；时段分组不等于已测得繁忙程度。',
    '按线路与站序的误差见 station-errors.md / station-errors.csv，包含无样本站点和上车点拆分。',
    '本次未修改、发布或上传线上模型。原始数据未改动。',''].join('\n');
  save('summary.txt',summary);
  console.log(JSON.stringify({directory,modelVersion:report.modelVersion,referenceDates:report.referenceDates,
    replays:report.replays.map(row=>({kind:row.kind,metrics:row.metrics})),prospective:report.prospective.metrics,productionModelChanged:false},null,2));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main();
