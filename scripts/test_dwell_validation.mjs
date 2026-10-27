import assert from 'node:assert/strict';
import fs from 'node:fs';
import {auditJourneys, freezePair, evaluatePair} from './validate_dwell_trial.mjs';

const runtime = fs.readFileSync('data/eta_prediction.js', 'utf8');
const model = version => ({schema: 'cuhk_eta_prediction_v1', routeScheme: '2026-09', version,
  routes: {8: {stopIds: ['a', 'b', 'a'], profiles: {all: {offsets: [0, 1, 2], dwellSeconds: [0, 10, 0]},
    ...(version === 11 ? {weekday_lunch: {offsets: [0, 1, 2.5], dwellSeconds: [0, 40, 0]}} : {})}}}});
const empty = {sessions: [], nonSegmentRecordings: [], segmentObservations: [], stopObservations: [], dwellObservations: [], boardConstraints: []};
const row = {sessionId: 'new', routeId: '8', routeScheme: '2026-09', startedAt: '2026-10-27T12:00:00+08:00', endedAt: '2026-10-27T12:10:00+08:00', gpsSamples: [{timestamp: 1, lon: 114, lat: 22}]};
const protocol = freezePair(empty, model(10), model(11), runtime, {}, new Date('2026-10-26T00:00:00Z'));
const data = {...empty, sessions: [row, {...row, sessionId: 'retry'}]};
const audit = auditJourneys(data, [{id: 'new', _id: 'cloud-core'}], [{parentPayloadId: 'cloud-core'}]);
assert.equal(audit.summary.canonicalRecordings, 1);
assert.equal(audit.summary.chunks.linked, 1);
const label = {sessionId: 'new', period: 'main_term', routeScheme: '2026-09', routeId: '8', fromStopIndex: 0, toStopIndex: 2,
  fromStopId: 'a', toStopId: 'a', at: Date.parse(row.startedAt), toTimestamp: '2026-10-27T12:02:30+08:00', seconds: 150, date: '2026-10-27'};
let report = evaluatePair(data, [label, {...label, sessionId: 'retry'}], audit, protocol);
assert.equal(report.summary.v11.observations, 1);
assert.equal(report.summary.v11.maeSeconds, 0);
assert.equal(report.summary.v10.maeSeconds, 30);
assert.equal(report.heldCounts.duplicate_observation, 1);
assert.equal(report.byGroup[0].latestObservedDate, '2026-10-27');
assert.equal(report.cohorts.affected.metrics.v11.observations, 1);
assert.equal(report.cohorts.all.byServiceDate.length, 1);
assert.equal(report.confidenceInterval, null);
const flagged = {...label, seconds: 10, legs: [{from: 'a', to: 'b', meters: 1000}, {from: 'b', to: 'a', meters: 1000}]};
const sensitivity = evaluatePair(data, [flagged], audit, protocol);
assert.equal(sensitivity.cohorts.all.metrics.v10.observations, 1);
assert.equal(sensitivity.cohorts.without_distance_time_conflict.metrics.v10.observations, 0);
assert.equal(sensitivity.cohorts.without_distance_time_conflict.metrics.v10.maeSeconds, null);
const known = freezePair(data, model(10), model(11), runtime, {}, new Date('2026-10-26T00:00:00Z'));
report = evaluatePair(data, [label], audit, known);
assert.equal(report.summary.v10.maeSeconds, null);
assert.equal(report.status, 'awaiting_new_independent_journeys');
report = evaluatePair(data, [label, {...label, seconds: 151}], audit, protocol);
assert.equal(report.summary.v11.observations, 0);
assert.equal(report.heldCounts.conflicting_observation, 1);
assert.throws(() => evaluatePair(data, [], audit, {...protocol, frozenAt: '2020-01-01'}));
const conflicting = auditJourneys({...empty, sessions: [row, {...row, routeId: '4'}]});
assert.equal(conflicting.summary.conflictingIds, 1);
assert.equal(conflicting.aliases.has('new'), false);
const orphan = auditJourneys({...empty, boardConstraints: [{sessionId: 'unknown'}]});
assert.equal(orphan.summary.unmatchedObservations.boardConstraints, 1);
console.log('PASS: exact retry linkage, raw chunk linkage, independent freeze, client lunch profile, null empty metrics, conflicting labels/IDs, orphan presence and protocol integrity');
