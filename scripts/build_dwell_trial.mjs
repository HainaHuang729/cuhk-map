import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export function buildDwellTrial(base) {
  assert.equal(base.predictionModel.version, 10, 'Trial requires the reviewed v10 baseline');
  const result = structuredClone(base), model = result.predictionModel;
  const route = model.routes['8'];
  const additions = [[6, 'chan_chun_ha_hostel', 10], [7, 'shaw_college', 25],
    [11, 'new_asia_circle', 10], [12, 'united_college', 5],
    [14, 'shaw_college', 15], [15, 'area_39', 25]];
  assert(!route.profiles.weekday_lunch, 'Do not overwrite an existing time profile');
  const profile = structuredClone(route.profiles.all);
  for (const [index, stopId, seconds] of additions) {
    assert.equal(route.stopIds[index], stopId);
    profile.dwellSeconds[index] += seconds;
    // Arrival at this stop is unchanged; extra dwell delays only downstream stops.
    for (let next = index + 1; next < profile.offsets.length; next++) {
      profile.offsets[next] = Math.round((profile.offsets[next] + seconds / 60) * 1e8) / 1e8;
    }
  }
  route.profiles.weekday_lunch = profile;
  model.version = 11;
  model.dwellTrial = {id: 'route8-weekday-lunch-20261026', baselineVersion: 10,
    status: 'trial', routeId: '8', bucket: 'weekday_lunch', timezone: 'Asia/Hong_Kong',
    hours: '11:30-14:00', timeSelection: 'client-current-time',
    additions: additions.map(([stopIndex, stopId, extraSeconds]) => ({stopIndex, stopId, extraSeconds})),
    independentValidation: false};
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/build_dwell_trial.mjs baseline-patch.json new-private-directory');
  const result = buildDwellTrial(JSON.parse(fs.readFileSync(input, 'utf8')));
  fs.mkdirSync(output, {mode: 0o700});
  fs.writeFileSync(path.join(output, 'eta-model-patch.json'), JSON.stringify(result, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  fs.writeFileSync(path.join(output, 'prediction-model.json'), JSON.stringify(result.predictionModel, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
}
