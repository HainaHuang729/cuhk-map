import assert from 'node:assert/strict';
import {proposedExtraSeconds,nearStopLowMotion,hasContinuousVisitCoverage,summarizeDwellCandidates} from './analyze_station_dwell.mjs';

assert.equal(proposedExtraSeconds(14,70,121,152),25);
assert.equal(proposedExtraSeconds(14,52,201,231),15);
assert.equal(proposedExtraSeconds(38.61,55,85.8,94),5);
assert.equal(proposedExtraSeconds(14,70,121,120),0,'No positive ETA budget where actual interval was already shorter');
assert.equal(proposedExtraSeconds(50,40,121,160),0,'No added parking if low-motion evidence is shorter');
assert.equal(proposedExtraSeconds(14,200,121,400),30,'One-stop provisional increment is bounded');
assert.equal(proposedExtraSeconds(14,null,121,152),0);
const cluster=(seconds,meters,gap)=>({durationSeconds:seconds,center:[meters,0],samples:[{timestamp:'2026-09-29T04:00:00Z'},{timestamp:new Date(Date.parse('2026-09-29T04:00:00Z')+gap*1000).toISOString()}]});
const low=nearStopLowMotion([],[],()=>[cluster(12,20,1),cluster(13,60,1),cluster(30,10,20)],coord=>coord[0]);
assert.equal(low.seconds,12,'Far clusters and sparse sampling must not imply stationary dwell');
assert.equal(low.rejected.length,2);
const start=Date.parse('2026-09-29T04:00:00Z');
const points=[0,5,10,15].map(seconds=>({timestamp:new Date(start+seconds*1000).toISOString(),lon:114,lat:22,accuracy:10}));
assert(hasContinuousVisitCoverage(points,start,start+15000));
assert(!hasContinuousVisitCoverage(points.slice(0,3),start,start+60000));
assert(!hasContinuousVisitCoverage(points.map((p,i)=>({...p,timestamp:new Date(start+i*20000).toISOString()})),start,start+60000));
assert(!hasContinuousVisitCoverage(points.map(p=>({...p,accuracy:60})),start,start+15000));
const row={sessionId:'one',routeId:'8',stopId:'shaw',stopIndex:7,stopLabel:'逸夫下行',nextStopLabel:'伍宜孙',dayType:'weekday',timeBand:'lunch',date:'2026-09-29',
  currentDwellSeconds:14,currentIntervalSeconds:121,observedIntervalSeconds:152,lowMotion:{seconds:70},reviewReasons:[],missingDwellSummary:true};
const results=summarizeDwellCandidates([row,{...row,timeBand:'evening_peak',lowMotion:{seconds:10}},
  {...row,stopIndex:14,stopLabel:'逸夫上行',lowMotion:{seconds:52},currentIntervalSeconds:201,observedIntervalSeconds:231},
  {...row,routeId:'4',reviewReasons:['overlapping_stop_visits']},
  {...row,dayType:'saturday',lowMotion:{seconds:10}}]);
assert.equal(results.length,5,'Keep route, repeated occurrence, day type and clock band separate');
assert.deepEqual(results.map(x=>x.extraDwellSeconds),[25,0,15,0,0]);
assert.equal(results[3].observations,1,'Retain flagged records, not silently delete them');
assert.equal(results[3].sessions,0);
const duplicated=summarizeDwellCandidates([row,{...row}]);
assert.equal(duplicated[0].sessions,1,'Repeated observations do not become independent journeys');
assert.equal(duplicated[0].extraDwellSeconds,25);
const includesPassages=summarizeDwellCandidates([row,{...row,sessionId:'two',lowMotion:{seconds:0}},
  {...row,sessionId:'three',lowMotion:{seconds:0}}]);
assert.equal(includesPassages[0].sessions,3);
assert.equal(includesPassages[0].extraDwellSeconds,0,'Well-observed visits with no slow cluster remain evidence, avoiding selection for long stops');
console.log('PASS: bounded per-stop hypotheses, no extra for shorter intervals, low-motion gap/distance checks, route/direction/time separation, session counts and retained review records');
