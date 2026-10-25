import assert from 'node:assert/strict';
import {academicPeriod, fitPeriodModels} from './study_eta_periods.mjs';

assert.equal(academicPeriod('2026-06-29'), 'summer_session');
assert.equal(academicPeriod('2026-06-30'), 'summer_break');
assert.equal(academicPeriod('2026-08-31'), 'summer_break');
assert.equal(academicPeriod('2026-09-01'), 'pre_term_transition');
assert.equal(academicPeriod('2026-09-06'), 'pre_term_transition');
assert.equal(academicPeriod('2026-09-07'), 'main_term');
assert.equal(academicPeriod('2026-12-06'), 'unknown');
assert.equal(academicPeriod('2026-06-31'), 'unknown');
assert.equal(academicPeriod(''), 'unknown');
const rows = [
  {date: '2026-07-02', value: 1, pair: 'a->b', path: ['a->b'], sessionId: 'summer'},
  {date: '2026-09-08', value: 5, pair: 'a->b', path: ['a->b'], sessionId: 'term'},
  {date: '2026-09-28', value: 100, pair: 'a->b', path: ['a->b'], sessionId: 'future'},
  {date: '2026-07-03', value: 7, pair: 'b->c', path: ['b->c'], sessionId: 'summer2'},
].map(row => ({...row, fromStopId: row.pair.split('->')[0], toStopId: row.pair.split('->')[1],
  at: Date.parse(`${row.date}T10:00:00+08:00`), flags: []}));
const evidence = {segments: rows, presence: [], dwell: [], spans: [], stops: {
  a: {coord: [114.2, 22.4]}, b: {coord: [114.21, 22.4]}, c: {coord: [114.22, 22.4]}
}};
const dates = new Map(rows.map(row => [row.sessionId, new Set([row.date])]));
const model = fitPeriodModels(evidence, '2026-09-27', dates, 'mean');
const target = {...rows[1], date: '2026-09-29'};
assert.equal(model.predict(target).minutes, 5, 'summer averages and future values must not flatten the term prediction');
assert.equal(model.predict(rows[0]).minutes, 1, 'summer must retain its own observations');
assert.equal(model.training.main_term.fittedSegments, 1);
const missing = {...target, fromStopId: 'b', toStopId: 'c', path: ['b->c']};
assert.equal(model.predict(missing).supported, false);
const fallback = fitPeriodModels(evidence, '2026-09-27', dates, 'mean', true);
assert.equal(fallback.predict(missing).minutes, 7);
assert.equal(fallback.predict(missing).crossPeriodLegs, 1);
assert.equal(fallback.predict(target).minutes, 5, 'cross-period fallback is only allowed for missing station pairs');
console.log('PASS: calendar/route-boundary separation, valid dates, retained summer data, term-only predictions, future exclusion and explicit cross-period fallback');
