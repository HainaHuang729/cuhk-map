import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {generateTermModel, TERM_MODEL_VERSION} from './build_term_model.mjs';
import {makeTermConfigUpdate} from './publish_term_model.mjs';

const leg = {roadId: 'new:road', from: 'a', to: 'b', station: 'a', meters: 100};
const catalog = {entries: new Map([['2026-09:R:0', leg], ['2026-09:S:0', {...leg, roadId: 'new:unobserved'}]]),
  definitions: new Map([['2026-09:R', {stops: ['a', 'b']}]])};
const segment = (period, seconds, rest = {}) => ({period, seconds, routeScheme: '2026-09', source: 'direct_observed',
  eligibleForSegmentTraining: true, leg, sessionId: period, fromTimestamp: '2026-09-08T10:00:00+08:00', ...rest});
const evidence = {reported: [segment('summer_break', 9999), segment('pre_term_transition', 8888), segment('main_term', 120),
  segment('main_term', 999, {source: 'interpolated_observed_span'}), segment('main_term', 777, {eligibleForSegmentTraining: false})]};
const dwell = {routeId: 'R', routeScheme: '2026-09', stopId: 'a', stopIndex: 0, source: 'stop_visit', seconds: 30,
  observedAt: '2026-09-08T10:00:00+08:00', eligibleForDwellTraining: true, censoredAtRideEnd: false};
const dataset = {dwellObservations: [dwell, {...dwell, seconds: 666, observedAt: '2026-07-01T10:00:00+08:00'}, {...dwell, seconds: 555, censoredAtRideEnd: true}]};
const {model, legacy, review} = generateTermModel(dataset, catalog, evidence,
  [{id: 'R', stops: ['a', 'b']}, {id: 'S', stops: ['a', 'b']}], '2026-10-25');
assert.equal(model.version, TERM_MODEL_VERSION);
assert.equal(model.training.directSegments, 1);
assert.equal(model.training.completeDwellObservations, 1);
assert.deepEqual(model.routes.R.profiles.all.offsets, [0, 2]);
assert.deepEqual(model.routes.R.profiles.all.dwellSeconds, [30, 0]);
assert.equal(model.routes.S.segmentEvidence[0].estimated, true);
assert.equal(model.routes.S.profiles.all.offsets[1], 2, 'unobserved roads must use same-term rate, not old data');
assert.equal(model.training.summerRecordsUsed, 0);
assert.equal(review.length, 1, 'conflicting spatial/visit evidence remains retained for review');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('data/eta_prediction.js', 'utf8'), ctx);
const api = ctx.CUHK_ETA_PREDICTION;
assert(api.setModel(model));
assert.equal(api.fallbackSegment(100), 2);
assert.equal(api.fallbackDwell(), 14);
assert.equal(api.evidence({id: 'R', stops: ['a', 'b']}).covered, 1);
assert.equal(api.evidence({id: 'S', stops: ['a', 'b']}).covered, 0, 'distance estimates must not be labelled measured');
assert.equal(api.evidence({id: 'R', stops: ['a', 'c']}).covered, 0, 'changed routes cannot inherit old coverage');
const current = {_id: 'config', kind: 'latest', version: 6, intro: {key: 'keep'}, featureFlags: {driverLive: false}};
const patch = makeTermConfigUpdate(current, legacy, '2026-10-25T00:00:00Z');
assert.equal(patch.version, TERM_MODEL_VERSION);
assert.deepEqual(Object.keys(patch).sort(), ['etaModel', 'updatedAt', 'version']);
assert.equal(current.featureFlags.driverLive, false);
assert.throws(() => makeTermConfigUpdate(current, {...legacy, gpsSamples: []}, ''), /private/);
const mixed = JSON.parse(JSON.stringify(legacy));
mixed.predictionModel.training.summerRecordsUsed = 1;
assert.throws(() => makeTermConfigUpdate(current, mixed, ''), /term-only/);
const miniPath = '/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
const reads = [];
const native = vm.createContext({require: createRequire(miniPath), Page: () => {},
  wx: {getStorageSync: key => { reads.push(key); return key === 'cuhk-mini-eta-calibration-v3' ? {segments: {'a->b': {minutes: 999}}} : null; }},
  setTimeout, clearTimeout, setInterval, clearInterval});
vm.runInContext(fs.readFileSync(miniPath, 'utf8'), native);
const bundled = vm.runInContext('require("../../data/etaModel.js")', native);
assert.equal(bundled.version, TERM_MODEL_VERSION);
const before = vm.runInContext('ETA_PREDICTION.offset(MAP_DATA.routes.find(r=>r.id==="8"),3)', native);
const old = JSON.parse(JSON.stringify(bundled));
old.version = 7;
for (const item of Object.values(old.routes)) item.profiles.all.offsets = item.profiles.all.offsets.map(value => value * 2);
native.oldConfig = {enabled: true, version: 100, etaModel: {predictionModel: old}};
vm.runInContext('applyRemoteAppConfig(oldConfig)', native);
assert.equal(vm.runInContext('ETA_PREDICTION.offset(MAP_DATA.routes.find(r=>r.id==="8"),3)', native), before,
  'a newer outer config must not revive an older mixed-period prediction model');
assert.equal(Object.keys(vm.runInContext('loadEtaCalibration().segments', native)).length, 0);
assert(reads.includes('cuhk-mini-eta-calibration-main-term-2026-09-07-v1'));
assert(!reads.includes('cuhk-mini-eta-calibration-v3'), 'old calibration remains stored separately and is never mixed into the new cache');
const web = vm.createContext({});
for (const file of ['data/eta_prediction.js', 'data/eta_model.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), web);
vm.runInContext(fs.readFileSync('data/cuhk_bus_routes.js', 'utf8').replace('root.CUHK_BUS_UTILS = {',
  'root.CUHK_BUS_UTILS = { routeSegmentTravelMinutes, routeStopDistances,'), web);
vm.runInContext(fs.readFileSync('data/transport_route_schemes.js', 'utf8'), web);
web.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(web.CUHK_BUS_DATA, '2026-09');
const route = web.CUHK_BUS_DATA.routes.find(row => row.id === '8');
const changed = {...route, stops: route.stops.slice(1)};
const distances = web.CUHK_BUS_UTILS.routeStopDistances(changed);
assert.equal(web.CUHK_BUS_UTILS.routeSegmentTravelMinutes(changed, 1),
  web.CUHK_ETA_PREDICTION.fallbackSegment(Math.max(0, distances[1] - distances[0])),
  'changed route fallback must use the term model, never old summer constants');
assert.equal(web.CUHK_ETA_PREDICTION.evidence(changed).covered, 0);
const html = fs.readFileSync('index.html', 'utf8');
const assets = [...html.matchAll(/<script src="(data\/[^\"]+)"/g)].map(match => new URL(match[1], 'https://example.invalid/'));
const expectedAssets=['data/campus_updates.js','data/cuhk_bus_routes.js','data/eta_prediction.js','data/eta_model.js','data/transport_route_schemes.js','data/cuhk_dining_pois.js','data/campus_guide.js'];
assert.equal(new Set(assets.map(asset=>asset.pathname)).size,assets.length,'Do not load duplicate data modules');
for(const file of expectedAssets)assert(assets.some(asset=>asset.pathname==='/'+file),file);
for (const asset of assets) {
  assert(asset.searchParams.get('v'),'Every released data asset needs a cache key');
  assert(fs.existsSync(asset.pathname.slice(1)));
}
console.log('PASS: term-only fitting, summer/transition/interpolation separation, completed dwell, neutral fallback, honest coverage and narrowly scoped cloud patch');
