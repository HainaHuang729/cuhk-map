import assert from 'node:assert/strict';
import {localDate, weightedMean, weightedMedian, prepareEvidence, chooseSplit, trainingRows, fitModel, metrics} from './experiment_eta_models.mjs';

assert.equal(localDate('2026-09-26T16:00:00Z'), '2026-09-27');
assert.equal(weightedMean([{value:1,weight:1},{value:7,weight:1}]),4);
assert.equal(weightedMedian([{value:1,weight:3},{value:50,weight:1}]),1);
assert.equal(weightedMedian([{value:1,weight:1},{value:3,weight:1}]),2);
const rows=[1,2,3].map((day,index)=>({sessionId:`s${day}`,routeId:'R',routeScheme:'2026-09',serviceDate:`2026-09-0${day}`,
  fromTimestamp:`2026-09-0${day}T10:00:00+08:00`,toTimestamp:`2026-09-0${day}T10:01:00+08:00`,
  fromStopId:'a',toStopId:'b',minutes:index===2?10:1,flags:index===2?['interpolated_not_measured']:[],eligibleForSegmentTraining:index!==2}));
const data={segmentObservations:rows,dwellObservations:[],boardConstraints:[],stopObservations:[],
  routeDefinitions:{legacy:[],current:[{id:'R',stops:['a','b']}]},stops:{a:{coord:[114.2,22.4]},b:{coord:[114.21,22.4]}}};
const evidence=prepareEvidence(data);
const dates=new Map(rows.map(row=>[row.sessionId,new Set([localDate(row.fromTimestamp)])]));
const all=fitModel(evidence,{estimate:'mean'},'2026-09-04',dates);
const quality=fitModel(evidence,{estimate:'mean',quality:true},'2026-09-04',dates);
assert.equal(all.training.fittedSegments,3,'baseline must retain flagged older observations');
assert.equal(quality.training.fittedSegments,2);
assert.equal(all.predict(evidence.segments[0]).minutes,4);
assert.equal(quality.predict(evidence.segments[0]).minutes,1);
const old=fitModel(evidence,{estimate:'mean'},'2026-09-03',dates);
assert.equal(old.training.fittedSegments,2);
assert.equal(old.predict(evidence.segments[0]).minutes,1,'future outlier must not enter training');
const crossing=new Map([['s1',new Set(['2026-09-01','2026-09-05'])]]);
assert.equal(trainingRows([evidence.segments[0]],'2026-09-04',crossing).length,0,'hold out entire cross-date sessions');
const synthetic={...evidence,segments:Array.from({length:20},(_,index)=>({routeScheme:'2026-09',eligibleForSegmentTraining:true,
  date:`2026-09-${String(index+1).padStart(2,'0')}`,sessionId:`s${index}`})),presence:[],dwell:[],spans:[]};
const split=chooseSplit(synthetic);
assert.equal(split.cutoff,'2026-09-16');
assert.equal(split.finalMeasurementDates.length,5);
assert(split.validationFolds.every(fold=>fold.end<=split.cutoff));
const midnight=chooseSplit({...synthetic,spans:[{sessionId:'overnight',date:'2026-09-15',toTimestamp:'2026-09-16T00:01:00+08:00'}]});
assert.deepEqual([...midnight.sessionDates.get('overnight')],['2026-09-15','2026-09-16']);
assert.equal(trainingRows([{sessionId:'overnight',date:'2026-09-15'}],midnight.cutoff,midnight.sessionDates).length,0);
const score=metrics([{uid:'1',sessionId:'a',errorSeconds:0,supported:true},{uid:'2',sessionId:'a',errorSeconds:20,supported:true},{uid:'3',sessionId:'b',errorSeconds:100,supported:false}]);
assert.equal(score.sessionBalancedMaeSeconds,55,'score balances sessions rather than individual observations');
assert.equal(score.maeSeconds,40);
console.log('PASS: HK date split, unfiltered baseline, quality ablation, future/session leakage prevention and session-balanced errors');
