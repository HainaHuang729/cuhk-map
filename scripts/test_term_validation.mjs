import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {intervalPrediction,errorSummary,trainingBefore,freezeProtocol,prospectiveLabels,assertPrivateOutput,validationStops,routeStopErrors,intervalReview} from './validate_term_eta.mjs';
import {renderStationMarkdown,renderStationCsv} from './format_eta_validation.mjs';
const model={version:10,routeScheme:'2026-09',routes:{R:{stopIds:['a','b','c'],profiles:{all:{offsets:[0,2,5]}},segmentEvidence:[{samples:2},{samples:0}]}}};
const label={sessionId:'test',date:'2026-09-28',routeId:'R',fromStopIndex:0,toStopIndex:2,fromStopId:'a',toStopId:'c',seconds:999};
assert.deepEqual(intervalPrediction(model,label),{seconds:300,measured:false});
assert.equal(intervalPrediction(model,{...label,seconds:1}).seconds,300,'Truth labels cannot enter a prediction');
assert.equal(intervalPrediction(model,{...label,toStopId:'changed'}),null);
assert.equal(intervalPrediction(model,{...label,toStopIndex:0}),null);
assert.equal(intervalPrediction(model,{...label,legs:[{from:'a',to:'wrong'},{from:'wrong',to:'c'}]}),null);
const metrics=errorSummary([{sessionId:'long',date:'2026-09-28',errorSeconds:60,measured:true},{sessionId:'long',date:'2026-09-28',errorSeconds:60,measured:true},{sessionId:'short',date:'2026-09-29',errorSeconds:0,measured:false}]);
assert.equal(metrics.maeSeconds,40);assert.equal(metrics.sessionBalancedMaeSeconds,30);assert.equal(metrics.p90AbsoluteErrorSeconds,60);
assert.equal(errorSummary([]).maeSeconds,null);
const conflict=intervalReview({seconds:39.473,legs:[{meters:1490}]});
assert.ok(conflict.impliedRouteKmh>130);
assert.deepEqual(conflict.reviewFlags,['route_distance_time_conflict']);
assert.deepEqual(intervalReview({seconds:39.473,legs:[{meters:380}]}).reviewFlags,[]);
assert.deepEqual(intervalReview({seconds:39.473,legs:[{meters:NaN}]}),{routeMeters:null,impliedRouteKmh:null,reviewFlags:[]});
assert.equal(intervalReview({seconds:0,legs:[{meters:1490}]}).impliedRouteKmh,null);
const stations=validationStops({stops:{a:{name:'同名站'},b:{name:'中间|站'},c:{name:'=HYPERLINK("x")'}}},[
  {id:'R',name:'环线',stops:['a','b','a'],stopDirections:{0:'上行',2:'下行'}},
  {id:'X',name:'其他线',stops:['a','c']},
  {id:'Y',name:'重复站无方向',stops:['a','b','a','a']},
]);
assert.equal(stations[0].stopLabel,'同名站（上行）');
assert.equal(stations[2].stopLabel,'同名站（下行）');
assert.equal(stations[7].stopLabel,'同名站（第2次经过）');
assert.equal(stations[8].stopLabel,'同名站（终点）');
const observation=(sessionId,routeId,fromStopIndex,toStopIndex,fromStopId,toStopId,errorSeconds)=>({sessionId,routeId,
  fromStopIndex,toStopIndex,fromStopId,toStopId,errorSeconds,date:'2026-09-28',actualSeconds:240,
  predictedSeconds:240+errorSeconds,measured:true});
const scored=[observation('r1','R',0,2,'a','a',60),observation('r2','R',1,2,'b','a',-60),
  observation('r1','R',0,1,'a','b',120),observation('x','X',0,1,'a','c',-30)];
const breakdown=routeStopErrors(scored,stations);
const reviewed=routeStopErrors([{...scored[0],...conflict}],stations);
assert.equal(reviewed.byRouteStop[2].maeSeconds,60,'Mark a suspect interval without removing or changing its raw residual');
assert.equal(reviewed.byRouteStop[2].reviewRequiredObservations,1);
assert.equal(reviewed.byRouteStop[2].reviewRequiredSessions,1);
assert.equal(reviewed.byRouteStopPair[0].reviewRequiredObservations,1);
assert.equal(breakdown.byRouteStop.length,stations.length,'Keep every station even without observations');
assert.equal(breakdown.byRouteStop.reduce((sum,row)=>sum+row.observations,0),scored.length);
assert.equal(breakdown.byRouteStopPair.reduce((sum,row)=>sum+row.observations,0),scored.length);
assert.equal(breakdown.byRouteStop[0].maeSeconds,null,'No observations cannot mean zero error');
assert.equal(breakdown.byRouteStop[0].sampleStatus,'no_observations');
assert.equal(breakdown.byRouteStop[2].observations,2);
assert.equal(breakdown.byRouteStop[2].maeSeconds,60,'Early and late errors do not cancel in MAE');
assert.equal(breakdown.byRouteStop[2].signedBiasSeconds,0);
assert.equal(breakdown.byRouteStop[2].sampleStatus,'sparse');
assert.equal(breakdown.byRouteStopPair.filter(row=>row.routeId==='R'&&row.toStopIndex===2).length,2,'Different boarding origins stay separate');
assert.throws(()=>routeStopErrors([{...scored[0],toStopIndex:undefined}],stations),/exact route/);
assert.throws(()=>routeStopErrors([{...scored[0],toStopId:'b'}],stations),/exact route/);
const adequate=routeStopErrors(Array.from({length:5},(_,i)=>({...scored[0],sessionId:'r'+i,date:'2026-09-'+(28+i%3)})),stations);
assert.equal(adequate.byRouteStop[2].sampleStatus,'descriptive_only','A display threshold must not imply proven accuracy');
const reportFixture={modelVersion:10,trainedThrough:'2026-09-27',referenceDates:['2026-09-28'],
  replays:[{kind:'upload_aware_replay',metrics:errorSummary(scored),...breakdown}],
  prospective:{frozenAt:'2026-10-26T00:00:00Z',metrics:errorSummary([]),...routeStopErrors([],stations)}};
const markdown=renderStationMarkdown(reportFixture),csv=renderStationCsv(reportFixture);
assert.match(markdown,/中间\\\|站/);
assert.match(markdown,/预报晚 120.0 秒/);
assert.match(markdown,/预报早 30.0 秒/);
assert.match(markdown,/0 个观测 \/ 0 趟行程 \/ 0 天/);
assert.match(markdown,/暂无验证区间/);
assert.match(renderStationMarkdown({...reportFixture,replays:[{...reportFixture.replays[0],metrics:errorSummary([scored[0]]),...reviewed}]}),/1 个观测距时冲突待核对/);
assert.equal(csv.charCodeAt(0),0xFEFF,'Chinese CSV opens with a UTF-8 BOM');
assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'),'CSV formula strings are escaped');
assert.ok(csv.includes('"-30"'),'Signed numeric bias remains numeric rather than a formula string');
assert.ok(!csv.includes('"r1"'),'Aggregated exports do not contain journey identifiers');
const t=s=>Date.parse(s+'T12:00:00+08:00');
const dataset={sessions:[{sessionId:'past',startedAt:'2026-09-20T11:00:00+08:00',endedAt:'2026-09-20T12:00:00+08:00'},{sessionId:'cross',startedAt:'2026-09-20T12:00:00+08:00',endedAt:'2026-09-29T12:00:00+08:00'}],dwellObservations:[]};
const row=(sessionId,period,day,upload)=>({sessionId,period,at:t(day),availableAt:t(upload)});
const evidence={reported:[row('past','main_term','2026-09-20','2026-09-21'),row('late','main_term','2026-09-20','2026-09-29'),row('cross','main_term','2026-09-20','2026-09-21'),row('summer','summer_break','2026-08-10','2026-08-11')],labels:[],availability:new Map()};
assert.deepEqual(trainingBefore(dataset,evidence,'2026-09-28').evidence.reported.map(row=>row.sessionId),['past']);
assert.deepEqual(trainingBefore(dataset,evidence,'2026-09-28',false).evidence.reported.map(row=>row.sessionId),['past','late']);
const protocol=freezeProtocol(dataset,model,new Date('2026-10-26T00:00:00Z'));
const fresh={sessionId:'fresh',startedAt:'2026-10-27T00:00:00Z',endedAt:'2026-10-27T01:00:00Z'};
const freshLabel={...label,sessionId:'fresh',routeScheme:'2026-09',period:'main_term',at:Date.parse('2026-10-27T00:10:00Z')};
const futureDataset={...dataset,sessions:[...dataset.sessions,fresh,{...fresh,sessionId:'backfilled',startedAt:'2026-10-25T00:00:00Z'}]};
const futureEvidence={labels:[freshLabel,{...freshLabel,sessionId:'past'},{...freshLabel,sessionId:'backfilled'},{...freshLabel,period:'summer_break'}]};
assert.deepEqual(prospectiveLabels(futureDataset,futureEvidence,protocol).map(row=>row.sessionId),['fresh']);
assert.throws(()=>prospectiveLabels(futureDataset,futureEvidence,{...protocol,frozenModel:{...model,version:11}}),/changed/);
assert.throws(()=>assertPrivateOutput(process.cwd()+'/data/private-validation'),/outside/);
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cuhk-private-output-'));
try{fs.symlinkSync(path.join(process.cwd(),'assets'),path.join(temp,'linked-public-assets'));assert.throws(()=>assertPrivateOutput(path.join(temp,'linked-public-assets','new-output')),/outside/);}finally{fs.rmSync(temp,{recursive:true,force:true});}
console.log('PASS: chronological whole-trip split, upload availability, period separation, frozen prospective labels, session-balanced errors, exact route/stop occurrence breakdowns, boarding-origin splits, empty/sparse samples, Markdown/CSV exports and private outputs');
