import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const out = outIndex < 0 ? '' : args[outIndex + 1];
const inputs = args.filter((_, i) => i !== outIndex && i !== outIndex + 1);
if (!out || !inputs.length) throw new Error('Usage: node scripts/build_prediction_dataset.mjs <exports...> --out dataset.json');
const read = file => {
  const text = fs.readFileSync(file, 'utf8').trim();
  try { return JSON.parse(text); }
  catch { return text.split(/\r?\n/).filter(Boolean).map(JSON.parse); }
};
const ctx = vm.createContext({});
const dataDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../data');
vm.runInContext(fs.readFileSync(path.join(dataDir, 'cuhk_bus_routes.js'), 'utf8'), ctx);
const legacy = JSON.parse(JSON.stringify(ctx.CUHK_BUS_DATA));
vm.runInContext(fs.readFileSync(path.join(dataDir, 'transport_route_schemes.js'), 'utf8'), ctx);
ctx.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(ctx.CUHK_BUS_DATA, '2026-09');
const current = ctx.CUHK_BUS_DATA;
const cutoff = Date.parse('2026-09-01T00:00:00+08:00');
const time = x => Number.isFinite(Date.parse(x)) ? Date.parse(x) : null;
const id = x => String(x.id || x.payloadId || x._id || '');
const countBy = (xs, f) => xs.reduce((a, x) => { const k = f(x); a[k] = (a[k] || 0) + 1; return a; }, {});
const round = x => Math.round(x * 100) / 100;
const distance = (a, b) => {
  const rad = Math.PI / 180;
  const dlat = (b.lat-a.lat)*rad, dlon = (b.lon-a.lon)*rad;
  const h = Math.sin(dlat/2)**2 + Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
};
const cleanPoint = x => ({timestamp:x.timestamp, lon:Number(x.lon), lat:Number(x.lat), accuracy:x.accuracy == null ? null : Number(x.accuracy)});
const goodPoint = x => time(x.timestamp) !== null && Number.isFinite(x.lon) && Number.isFinite(x.lat) && x.lon >= 113 && x.lon <= 115 && x.lat >= 22 && x.lat <= 23;
const event = x => x ? {stopId:x.stopId||'', stopName:x.stopName||'', stopIndex:x.stopIndex??null,
  timestamp:x.timestamp||'', lon:x.lon??x.gps?.lon??null, lat:x.lat??x.gps?.lat??null,
  accuracy:x.accuracy??x.gps?.accuracy??null, stopDistanceMeters:x.stopDistanceMeters??x.nearestStopDistanceMeters??null} : null;
const cores = new Map(), chunkGroups = new Map(), broadcasts = new Map(), sourceFiles = [], importedPoints = [];
let duplicateCores = 0, duplicateChunks = 0, duplicateBroadcasts = 0;
const chunkKeys = new Set();
for (const file of inputs) {
  const parsed = read(file);
  if (parsed.type === 'FeatureCollection') {
    for (const f of parsed.features || []) {
      if (f.properties?.type === 'gps_sample' && f.geometry?.type === 'Point') importedPoints.push({...f.properties,lon:f.geometry.coordinates[0],lat:f.geometry.coordinates[1]});
    }
    sourceFiles.push({name:path.basename(file),features:parsed.features?.length||0});
    continue;
  }
  const records = Array.isArray(parsed) ? parsed : parsed.records || parsed.data || [parsed];
  sourceFiles.push({name:path.basename(file),records:records.length});
  for (const x of records) {
    if (x.recordType === 'ride_gps_sample_chunk') {
      const parent = String(x.parentPayloadId || x.sessionId || '');
      const key = `${parent}:${x.chunkIndex ?? x.chunkNumber ?? x.sampleOffset}`;
      if (chunkKeys.has(key)) { duplicateChunks++; continue; }
      chunkKeys.add(key);
      if (!chunkGroups.has(parent)) chunkGroups.set(parent, []);
      chunkGroups.get(parent).push(x);
    } else if (x.recordType === 'board_broadcast') {
      const key = id(x); if (broadcasts.has(key)) duplicateBroadcasts++; else broadcasts.set(key, x);
    } else if (x.recordType === 'ride_gps_session' || x.schema === 'ride_gps_session_v2') {
      const key = id(x);
      if (cores.has(key)) {
        duplicateCores++;
        const old = cores.get(key);
        if (JSON.stringify(x.etaCalibration||{}).length + (x.gpsSamples||[]).length > JSON.stringify(old.etaCalibration||{}).length + (old.gpsSamples||[]).length) cores.set(key,x);
      } else cores.set(key,x);
    }
  }
}
const sessions = [], excludedSessions = [], stopObservations = [], segmentObservations = [], dwellObservations = [], spanConstraints = [], boardConstraints = [];
for (const x of cores.values()) {
  const sessionId = id(x), start = time(x.startedAt || x.board?.timestamp), end = time(x.endedAt || x.alight?.timestamp);
  const map = start !== null && start >= cutoff ? current : legacy;
  const scheme = map === current ? '2026-09' : 'legacy';
  const route = map.routes.find(r => String(r.id) === String(x.routeId));
  const features = {sessionId,routeId:x.routeId,routeScheme:scheme,serviceDate:x.serviceDate||x.timeProfile?.localDate||'',
    serviceDayType:x.serviceDayType||x.timeProfile?.dayType||'',serviceTimeBucket:x.serviceTimeBucket||x.timeProfile?.timeBucket||''};
  const raw = [...(x.gpsSamples||[]),...(chunkGroups.get(sessionId)||[]).flatMap(c=>c.gpsSamples||[])];
  if (start !== null && end !== null) raw.push(...importedPoints.filter(p=>p.routeId===x.routeId&&time(p.timestamp)>=start&&time(p.timestamp)<=end));
  const samples = [...new Map(raw.map(cleanPoint).filter(goodPoint).map(p=>[`${p.timestamp}:${p.lon}:${p.lat}`,p])).values()].sort((a,b)=>time(a.timestamp)-time(b.timestamp));
  let trackMeters = 0;
  for (let i=1;i<samples.length;i++) if (samples[i].accuracy === null || samples[i].accuracy <= 100) trackMeters += distance(samples[i-1],samples[i]);
  const durationSeconds = start !== null && end !== null ? (end-start)/1000 : null;
  const board = event(x.board), alight = event(x.alight);
  const offsets = Object.entries(x.etaCalibration?.stopOffsetsMinutes||{}).map(([index,o])=>({...o,index:Number(index)})).sort((a,b)=>a.index-b.index);
  const sessionFlags=[];
  if (!route) sessionFlags.push('unknown_route');
  if (durationSeconds === null || durationSeconds < 0) sessionFlags.push('invalid_duration');
  if (durationSeconds > 21600) sessionFlags.push('over_6_hours');
  const visits = offsets.map(o=>({ ...features,stopId:o.stopId,stopIndex:o.index,stopName:o.stopName,observedAt:o.sampleTimestamp,
    source:o.source,distanceMeters:o.stopDistanceMeters??o.gpsErrorMeters??null,visitStartedAt:o.visitStartedAt||null,
    visitEndedAt:o.visitEndedAt||null,dwellSeconds:o.dwellDurationSeconds??null,flags:[] }));
  for(let i=0;i<visits.length;i++) {
    const v=visits[i];
    if (!route || route.stops[v.stopIndex] !== v.stopId) v.flags.push('stop_index_mismatch');
    if (time(v.observedAt) === null) v.flags.push('missing_timestamp');
    if (v.distanceMeters !== null && v.distanceMeters > 120) v.flags.push('far_from_stop');
    if (i && time(v.observedAt)<time(visits[i-1].observedAt)) v.flags.push('reversed_time');
    if (i && time(visits[i-1].visitEndedAt)>time(v.observedAt)) {v.flags.push('overlapping_stop_visits');visits[i-1].flags.push('overlapping_stop_visits');}
    if (sessionFlags.length) v.flags.push(...sessionFlags);
    v.eligibleForArrivalTraining=v.flags.length===0;
    stopObservations.push(v);
  }
  for (const [key,s] of Object.entries(x.etaCalibration?.segmentTravelMinutes||{})) {
    const from=s.fromStopId||key.split('->')[0],to=s.toStopId||key.split('->')[1];
    const flags=[...sessionFlags];
    if (!Number.isFinite(Number(s.minutes)) || s.minutes<0.2 || s.minutes>20) flags.push('duration_out_of_range');
    if (!route || !route.stops.some((p,i)=>p===from&&route.stops[i+1]===to)) flags.push('not_adjacent_in_route_scheme');
    if (board?.timestamp===s.fromTimestamp && board.stopDistanceMeters>120) flags.push('board_start_far_from_stop');
    const fromVisit=visits.find(v=>v.stopId===from&&v.observedAt===s.fromTimestamp);
    const toVisit=visits.find(v=>v.stopId===to&&v.observedAt===s.toTimestamp);
    if ([fromVisit,toVisit].some(v=>v?.flags.includes('overlapping_stop_visits'))) flags.push('overlapping_stop_visits');
    const interpolated=s.source==='interpolated_observed_span';
    if (interpolated) flags.push('interpolated_not_measured');
    const observedSeconds=time(s.toTimestamp)!==null&&time(s.fromTimestamp)!==null?(time(s.toTimestamp)-time(s.fromTimestamp))/1000:null;
    if (!interpolated && (observedSeconds===null || Math.abs(observedSeconds/60-s.minutes)>0.15)) flags.push('timestamp_duration_mismatch');
    const departure=fromVisit?.visitEndedAt;
    const driveSeconds=departure&&toVisit?.observedAt ? (time(toVisit.observedAt)-time(departure))/1000:null;
    segmentObservations.push({...features,fromStopId:from,toStopId:to,fromStopIndex:s.fromStopIndex??null,toStopIndex:s.toStopIndex??null,
      minutes:Number(s.minutes),fromTimestamp:s.fromTimestamp||null,toTimestamp:s.toTimestamp||null,source:s.source,
      arrivalToArrivalSeconds:interpolated?null:observedSeconds,drivingSeconds:driveSeconds>0?round(driveSeconds):null,
      originDwellSeconds:fromVisit?.dwellSeconds??null,flags,eligibleForSegmentTraining:flags.length===0,
      eligibleForDrivingTraining:flags.length===0&&driveSeconds>0,
      timingMeaning:interpolated?'allocated_share_of_observed_span':'arrival_to_arrival_includes_origin_dwell'});
  }
  for(let i=1;i<visits.length;i++) {
    const a=visits[i-1],b=visits[i];
    if(b.stopIndex>a.stopIndex+1&&a.eligibleForArrivalTraining&&b.eligibleForArrivalTraining) spanConstraints.push({...features,
      fromStopId:a.stopId,toStopId:b.stopId,fromStopIndex:a.stopIndex,toStopIndex:b.stopIndex,
      fromTimestamp:a.observedAt,toTimestamp:b.observedAt,elapsedSeconds:(time(b.observedAt)-time(a.observedAt))/1000,
      timingMeaning:'total_observed_span_includes_intermediate_dwell',eligibleForConstraintTraining:time(b.observedAt)>time(a.observedAt)});
  }
  for (const [stop,item] of Object.entries(x.etaCalibration?.stopDwellSeconds||{})) {
    const v=visits.find(v=>v.stopId===stop&&v.observedAt===item.sampleTimestamp);
    const flags=[...sessionFlags,...(v?.flags||[])];
    if (!v) flags.push('missing_visit_evidence');
    if(!Number.isFinite(Number(item.seconds))||item.seconds<3||item.seconds>180)flags.push('dwell_out_of_range');
    dwellObservations.push({...features,stopId:stop,stopIndex:item.stopIndex??v?.stopIndex??null,seconds:Number(item.seconds),
      observedAt:item.sampleTimestamp||v?.observedAt||null,source:item.source,flags:[...new Set(flags)],eligibleForDwellTraining:flags.length===0,
      censoredAtRideEnd:time(v?.visitEndedAt)!==null&&end!==null&&Math.abs(time(v.visitEndedAt)-end)<3000});
  }
  if(board&&board.stopId&&time(board.timestamp)!==null)boardConstraints.push({...features,...board,
    source:'ride_board_event',eligibleForTimeConstraint:!sessionFlags.length&&board.stopDistanceMeters!==null&&board.stopDistanceMeters<=80&&(board.accuracy===null||board.accuracy<=50),
    timingMeaning:'vehicle_present_at_stop_at_board_time_not_exact_arrival_or_scheduled_departure'});
  if(alight&&alight.stopId&&time(alight.timestamp)!==null)boardConstraints.push({...features,...alight,
    source:'ride_alight_event',eligibleForTimeConstraint:!sessionFlags.length&&alight.stopDistanceMeters!==null&&alight.stopDistanceMeters<=80&&(alight.accuracy===null||alight.accuracy<=50),
    timingMeaning:'vehicle_present_at_stop_at_alight_time_not_exact_arrival_or_departure'});
  const useful = offsets.length || Object.keys(x.etaCalibration?.segmentTravelMinutes||{}).length || (samples.length>=8&&durationSeconds>=30&&trackMeters>=100);
  if(useful&&!sessionFlags.includes('over_6_hours'))sessions.push({...features,startedAt:x.startedAt||board?.timestamp,endedAt:x.endedAt||alight?.timestamp,
    durationSeconds,board,alight,gpsSamples:samples,trackDistanceMeters:round(trackMeters),flags:sessionFlags,
    gpsQuality:{samples:samples.length,accuracyOver50:samples.filter(p=>p.accuracy>50).length},hasOriginalCalibration:offsets.length>0});
  else excludedSessions.push({...features,durationSeconds,sampleCount:samples.length,reportedSampleCount:x.sampleCount||0,
    reason:durationSeconds>21600?'over_6_hours':samples.length<8?'too_few_samples':durationSeconds<90&&board?.stopId===alight?.stopId?'same_stop_short':durationSeconds<90?'too_short_duration':'no_usable_track_or_observations'});
}
for (const x of broadcasts.values()) {
  const e=event(x), t=time(e.timestamp||x.createdAt);
  boardConstraints.push({constraintId:id(x),routeId:x.routeId,routeScheme:t>=cutoff?'2026-09':'legacy',...e,
    source:'board_broadcast',eligibleForTimeConstraint:t!==null&&!!e.stopId&&e.stopDistanceMeters!==null&&e.stopDistanceMeters<=80&&(e.accuracy===null||e.accuracy<=50),
    timingMeaning:'vehicle_present_at_stop_at_board_time_not_exact_arrival_or_scheduled_departure'});
}
// Broadcasts and ride events can describe the same boarding action.
const presenceEvents=[];
const presenceGroups=new Map();
for(const c of boardConstraints.sort((a,b)=>time(a.timestamp)-time(b.timestamp))) {
  const map=c.routeScheme==='2026-09'?current:legacy;
  const route=map.routes.find(r=>String(r.id)===String(c.routeId));
  const flags=[];
  if(!route||!route.stops.includes(c.stopId))flags.push('stop_not_in_route');
  if(c.stopIndex!==null&&(!route||route.stops[c.stopIndex]!==c.stopId))flags.push('stop_index_mismatch');
  c.flags=flags;c.eligibleForTimeConstraint=c.eligibleForTimeConstraint&&!flags.length;
  const key=`${c.routeId}:${c.stopId}:${c.stopIndex}`;
  const previous=presenceGroups.get(key);
  if(previous&&Math.abs(time(c.timestamp)-time(previous.timestamp))<=3000) {
    previous.corroboratingRecords=(previous.corroboratingRecords||1)+1;
    previous.eligibleForTimeConstraint ||= c.eligibleForTimeConstraint;
    continue;
  }
  presenceGroups.set(key,c);presenceEvents.push(c);
}
const result={schema:'cuhk_prediction_dataset_v1',generatedAt:new Date().toISOString(),timezone:'Asia/Hong_Kong',coordinateSystem:'GCJ-02 (source export label)',
  sourceFiles,definitions:{sessions:'Distinct ride recordings, not necessarily full trips.',segments:'Arrival-to-arrival elapsed times normally include dwell at origin; only use drivingSeconds when available.',
    dwell:'Observed stop visits can be truncated by boarding/alighting; inspect censoredAtRideEnd.',interpolation:'Allocated segments are excluded from independent segment training; retain total span constraints.',
    board:'Board times constrain presence at a stop; they do not establish exact arrival or departure from route origin.',
    missingFeatures:'Weather and passenger counts are not observed. Do not infer them from elapsed times.',
    split:'Validate by date and sessionId, never randomly split GPS points from the same ride.',privacy:'Cloud identities and user identifiers are omitted; GPS tracks remain in this local modeling file.'},
  summary:{uniqueCoreSessions:cores.size,duplicateCoreRecordsRemoved:duplicateCores,duplicateChunksRemoved:duplicateChunks,duplicateBroadcastsRemoved:duplicateBroadcasts,
    retainedSessions:sessions.length,excludedSessions:excludedSessions.length,exclusionReasons:countBy(excludedSessions,x=>x.reason),
    retainedGpsPoints:sessions.reduce((a,x)=>a+x.gpsSamples.length,0),stopObservations:stopObservations.length,
    eligibleArrivalObservations:stopObservations.filter(x=>x.eligibleForArrivalTraining).length,segmentObservations:segmentObservations.length,
    eligibleSegmentObservations:segmentObservations.filter(x=>x.eligibleForSegmentTraining).length,eligibleDrivingObservations:segmentObservations.filter(x=>x.eligibleForDrivingTraining).length,
    dwellObservations:dwellObservations.length,eligibleDwellObservations:dwellObservations.filter(x=>x.eligibleForDwellTraining&&!x.censoredAtRideEnd).length,
    spanConstraints:spanConstraints.filter(x=>x.eligibleForConstraintTraining).length,boardConstraints:presenceEvents.filter(x=>x.eligibleForTimeConstraint).length,
    duplicatePresenceRecordsRemoved:boardConstraints.length-presenceEvents.length,
    sinceSeptember: {coreSessions:[...cores.values()].filter(x=>time(x.startedAt||x.createdAt)>=cutoff).length,
      eligibleSegmentObservations:segmentObservations.filter(x=>x.routeScheme==='2026-09'&&x.eligibleForSegmentTraining).length}},
  routeDefinitions:{legacy:legacy.routes.map(({id,name,stops,stopDirections})=>({id,name,stops,stopDirections})),current:current.routes.map(({id,name,stops,stopDirections})=>({id,name,stops,stopDirections}))},
  stops:current.stops,sessions,stopObservations,segmentObservations,dwellObservations,spanConstraints,boardConstraints:presenceEvents,excludedSessions};
fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({file:out,summary:result.summary},null,2));
