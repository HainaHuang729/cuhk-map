import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {assertPrivateOutput} from './validate_term_eta.mjs';
import {makeTermConfigUpdate} from './publish_term_model.mjs';

const [protocolFile, miniRoot, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/check_eta_runtime_boundaries.mjs paired-protocol.json mini-root new-private-output');
assertPrivateOutput(output);
const protocol = JSON.parse(fs.readFileSync(protocolFile, 'utf8'));
const file = path.join(miniRoot, 'miniprogram/pages/index/index.js'), nativeRequire = createRequire(file);
const dates = ['2026-10-26T11:29:59+08:00', '2026-10-26T11:30:00+08:00', '2026-10-26T13:59:59+08:00', '2026-10-26T14:00:00+08:00', '2026-10-31T12:00:00+08:00'];
let checked = 0;
const results = {};
for (const [version, model] of Object.entries(protocol.models)) {
  const frozen = vm.createContext({}); vm.runInContext(protocol.runtimeSource, frozen);
  assert(frozen.CUHK_ETA_PREDICTION.setModel(model));
  const mini = vm.createContext({require: nativeRequire, Page() {}, wx: {getStorageSync: () => null}, console, setTimeout, clearTimeout, setInterval, clearInterval});
  vm.runInContext(fs.readFileSync(file, 'utf8'), mini);
  mini.modelToTest = model;
  vm.runInContext('applyRemoteAppConfig({enabled:true,version:100,etaModel:{predictionModel:modelToTest}})', mini);
  const web = vm.createContext({});
  for (const name of ['data/cuhk_bus_routes.js', 'data/transport_route_schemes.js', 'data/eta_prediction.js']) vm.runInContext(fs.readFileSync(name, 'utf8'), web);
  web.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(web.CUHK_BUS_DATA, '2026-09');
  assert(web.CUHK_ETA_PREDICTION.setModel(model));
  for (const date of dates) for (const route of web.CUHK_BUS_DATA.routes) for (let index = 0; index < route.stops.length; index++) {
    const expected = frozen.CUHK_ETA_PREDICTION.offset(route, index, new Date(date));
    const webValue = web.CUHK_BUS_UTILS.routeStopOffsetMinutes(route, index, undefined, new Date(date));
    const miniValue = vm.runInContext(`routeStopOffsetMinutes(MAP_DATA.routes.find(r=>r.id===${JSON.stringify(route.id)}),${index},undefined,new Date(${JSON.stringify(date)}))`, mini);
    assert(Math.abs(expected - webValue) < 1e-7 && Math.abs(expected - miniValue) < 1e-7, `${version}/${date}/${route.id}/${index}`);
    checked++;
  }
  const route = web.CUHK_BUS_DATA.routes.find(r => r.id === '8');
  const boundaries = [[dates[0], dates[1]], [dates[2], dates[3]]].map(([before, after]) => {
    const byStop = route.stops.map((stopId, index) => ({stopId, index, offsetJumpSeconds:
      (frozen.CUHK_ETA_PREDICTION.offset(route, index, new Date(after)) - frozen.CUHK_ETA_PREDICTION.offset(route, index, new Date(before))) * 60}));
    const progress = [];
    for (let elapsed = 0; elapsed <= 40; elapsed += .25) {
      const query = (date, minutes) => vm.runInContext(`routeProgressAtElapsed(MAP_DATA.routes.find(r=>r.id==='8'),${minutes},undefined,new Date(${JSON.stringify(date)}))`, mini);
      progress.push({elapsedMinutes: elapsed, before: query(before, elapsed), after: query(after, elapsed + 1/60)});
    }
    return {before, after, byStop, maximumOffsetJumpSeconds: Math.max(...byStop.map(row => Math.abs(row.offsetJumpSeconds))),
      backwardsProgressCases: progress.filter(row => row.after + 1e-9 < row.before),
      maximumAbsoluteProgressChange: Math.max(...progress.map(row => Math.abs(row.after - row.before)))};
  });
  results[version] = boundaries;
}
const rollback = makeTermConfigUpdate({_id: 'test-only', kind: 'latest', version: 11}, {predictionModel: protocol.models.v10}, new Date().toISOString());
assert.equal(rollback.version, 12);
assert.equal(rollback.etaModel.predictionModel.version, 10);
fs.mkdirSync(output, {mode: 0o700});
fs.writeFileSync(path.join(output, 'runtime-boundaries.json'), JSON.stringify({checked, results,
  rollback: {dryConstructionPassed: true, configVersion: 12, modelVersion: 10, cloudWritten: false},
  deviceLoadedModelVerified: false, note: 'Local source runtime parity, not proof of a deployed phone build or actual device cache state.'}, null, 2), {mode: 0o600});
console.log(JSON.stringify({checked, boundaries: Object.fromEntries(Object.entries(results).map(([name, rows]) => [name, rows.map(row => ({before: row.before, maximumOffsetJumpSeconds: row.maximumOffsetJumpSeconds, backwardsProgressCases: row.backwardsProgressCases.length, maximumAbsoluteProgressChange: row.maximumAbsoluteProgressChange}))])), rollbackPrepared: true, deviceLoadedModelVerified: false}, null, 2));
