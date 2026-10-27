import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {buildDwellTrial} from './build_dwell_trial.mjs';

const context = vm.createContext({});
for (const file of ['data/eta_model.js', 'data/eta_prediction.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), context);
const base = JSON.parse(JSON.stringify(context.CUHK_ETA_MODEL));
// Allow testing the shipped artifact against its retained, unmodified all profile.
base.version = 10;
delete base.dwellTrial;
delete base.routes['8'].profiles.weekday_lunch;
const candidate = buildDwellTrial({predictionModel: base}).predictionModel;
assert(context.CUHK_ETA_PREDICTION.setModel(candidate));
for (const id of Object.keys(base.routes)) {
  if (id !== '8') assert.deepEqual(candidate.routes[id], base.routes[id]);
}
const engine = context.CUHK_ETA_PREDICTION, row = candidate.routes['8'];
const route = {id: '8', stops: row.stopIds};
for (const date of ['2026-10-26T11:29:59+08:00', '2026-10-26T14:00:00+08:00', '2026-10-31T12:00:00+08:00', '2026-11-01T12:00:00+08:00']) {
  assert.equal(engine.offset(route, 18, new Date(date)), row.profiles.all.offsets[18]);
}
const at = new Date('2026-10-26T12:00:00+08:00');
let added = 0;
for (let index = 0; index < row.stopIds.length; index++) {
  assert(Math.abs(engine.offset(route, index, at) - row.profiles.all.offsets[index] - added / 60) < 1e-7);
  const extra = candidate.dwellTrial.additions.find(x => x.stopIndex === index)?.extraSeconds || 0;
  assert.equal(engine.dwell(route, index, at), row.profiles.all.dwellSeconds[index] + extra);
  if (index + 1 < row.stopIds.length) {
    const beforeMotion = (row.profiles.all.offsets[index + 1] - row.profiles.all.offsets[index]) * 60 - row.profiles.all.dwellSeconds[index];
    const afterMotion = engine.segment(route, index + 1, at) * 60 - engine.dwell(route, index, at);
    assert(Math.abs(beforeMotion - afterMotion) < 1e-5, 'Do not slow driving or double-count dwell');
  }
  added += extra;
}
assert.equal(added, 90);
assert.throws(() => buildDwellTrial({predictionModel: candidate}));
console.log('PASS: six direction-specific stops, weekday lunch only, downstream delays, unchanged driving and other routes, no duplicate application');
