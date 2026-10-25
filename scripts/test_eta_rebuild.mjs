import assert from 'node:assert/strict';
import {contextAt, availabilityIndex, historicalRows, solveComponents, fitV2, makeRoadCatalog} from './rebuild_eta_analysis.mjs';

assert.equal(contextAt(Date.parse('2026-09-06T16:00:00Z')).date, '2026-09-07');
assert.equal(contextAt(Date.parse('2026-09-06T16:00:00Z')).dayType, 'weekday');
const availability = availabilityIndex({sessions: [{sessionId: 's', endedAt: '2026-09-02T12:00:00Z'}],
  segmentObservations: [], stopObservations: []}, [{id: 's', cloudUploadedAt: '2026-09-08T12:00:00Z'}],
[{sessionId: 's', cloudUploadedAt: '2026-09-10T12:00:00Z'}]);
const recording = {date: '2026-09-02', availableAt: availability.get('s').at};
assert.equal(historicalRows([recording], '2026-09-09').length, 0, 'late uploaded chunk must prevent early training');
assert.equal(historicalRows([recording], '2026-09-11').length, 1);
const eq = (seconds, terms = [[0, 1]], rest = {}) => ({seconds, terms, weight: 1, ...rest});
assert(Math.abs(solveComponents([eq(10, [[0, 1], [0, 1]])], [0]).values[0] - 5) < 0.01, 'duplicate coefficients must aggregate');
assert.equal(solveComponents([eq(-10)], [5]).values[0], 0, 'nonnegative times');
const mean = solveComponents([eq(10), eq(10), eq(1000)], [10]);
const robust = solveComponents([eq(10), eq(10), eq(1000)], [10], 20);
assert(mean.values[0] > 300);
assert(Math.abs(robust.values[0] - 20) < 0.01, 'Huber downweights an outlier without deleting it');
const lower = solveComponents([eq(100, [[0, 1]], {lowerBound: true}), eq(150)], [120]);
assert(Math.abs(lower.values[0] - 150) < 0.01, 'a censored 100-second wait must not drag a 150-second estimate down');
const coupled = solveComponents([eq(60, [[0, 1]]), eq(30, [[1, 1]]), eq(90, [[0, 1], [1, 1]])], [10, 10]);
assert(Math.abs(coupled.values[0] - 60) < 0.01 && Math.abs(coupled.values[1] - 30) < 0.01);

const leg = {roadId: 'new:road', shapeId: 'road', station: 'a@up', meters: 100, from: 'a', to: 'b', geometryVerifiedInSnapshot: true};
const make = (date, rest) => ({date, period: date < '2026-09-07' ? 'summer_break' : 'main_term',
  at: Date.parse(`${date}T10:00:00+08:00`), availableAt: Date.parse(`${date}T11:00:00+08:00`),
  sessionId: date, legs: [leg], leg, originKind: 'boarding_remaining', ...rest});
const evidence = {
  reported: [make('2026-07-01', {seconds: 120, source: 'direct_observed'}),
    make('2026-09-08', {seconds: 75, source: 'direct_observed', flags: ['old_flag']}),
    make('2026-09-09', {seconds: 150, source: 'interpolated_observed_span'}), make('2026-09-29', {seconds: 10000})],
  spans: [make('2026-07-01', {seconds: 120}), make('2026-09-08', {seconds: 75}), make('2026-09-29', {seconds: 10000})],
  drives: [make('2026-07-01', {seconds: 60}), make('2026-09-08', {seconds: 60})],
  dwell: [make('2026-07-01', {seconds: 120, station: 'a@up', censored: false}),
    make('2026-09-08', {seconds: 30, station: 'a@up', censored: false})]
};
const target = make('2026-09-28', {seconds: 0});
const baseline = fitV2(evidence, {estimator: 'mean'}, '2026-09-27');
assert.equal(baseline.predict(target).seconds, 112.5, 'unrestricted same-period baseline keeps flagged and allocated observations');
const measured = fitV2(evidence, {estimator: 'mean', measuredOnly: true}, '2026-09-27');
assert.equal(measured.predict(target).seconds, 75);
const components = fitV2(evidence, {components: true}, '2026-09-27');
const prediction = components.predict(target);
assert(Math.abs(prediction.seconds - 75) < 0.1, 'summer dwell must not flatten term dwell');
assert(Math.abs(prediction.components.driving - 60) < 0.1);
assert(Math.abs(prediction.components.boardingRemaining - 15) < 0.1, 'boarding is midway through dwell, not full dwell or origin departure');
assert.equal(prediction.components.intermediateOrOriginDwell, 0, 'target dwell is not part of arrival ETA');
assert.equal(components.training.observedSpans, 2, 'future observations excluded');
assert.equal(components.training.oldQualityFlagsFiltered, false);
const delayed = {...evidence,
  reported: [...evidence.reported, make('2026-09-10', {seconds: 100000, availableAt: Date.parse('2026-09-28T12:00:00Z')})],
  spans: [...evidence.spans, make('2026-09-10', {seconds: 100000, availableAt: Date.parse('2026-09-28T12:00:00Z')})]};
assert.equal(fitV2(delayed, {estimator: 'mean'}, '2026-09-27').predict(target).seconds, baseline.predict(target).seconds,
  'backdated but late-uploaded observations cannot affect a historical forecast');
assert(Math.abs(fitV2(delayed, {components: true}, '2026-09-27').predict(target).seconds - prediction.seconds) < 0.001);
const stopIds = ['university_station', 'university_sports_centre', 'shaw_hall', 'university_admin', 'sh_ho', 'university_station'];
const roads = makeRoadCatalog({routeDefinitions: {legacy: [{id: '1A', stops: stopIds}], current: [{id: '1', stops: stopIds}]}, stops: {}});
assert.equal(roads.entries.size, 10);
const oldRoad = roads.entries.get('legacy:1A:0'), newRoad = roads.entries.get('2026-09:1:0');
assert(oldRoad.geometryVerifiedInSnapshot && newRoad.geometryVerifiedInSnapshot);
assert(oldRoad.meters > 0 && newRoad.meters > 0);
assert.equal(oldRoad.shapeId, newRoad.shapeId, 'only the same reviewed directed geometry can supply a cross-period road prior');
assert.notEqual(oldRoad.roadId, newRoad.roadId, 'route scheme and shape remain separate identifiers');
console.log('PASS: HK day, upload/chunk availability, convex loss, repeated coefficients, censoring, period separation, unrestricted baseline, no future leakage and boarding/arrival semantics');
