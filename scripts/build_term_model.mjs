import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {makeRoadCatalog, buildEvidence, availabilityIndex} from './rebuild_eta_analysis.mjs';
import {academicPeriod} from './study_eta_periods.mjs';
import {localDate, weightedMedian} from './experiment_eta_models.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TERM_MODEL_VERSION = 10;
export const TERM = {id: 'main_term', start: '2026-09-07', end: '2026-12-05', label: '2026-27 Term 1'};
const round = value => Math.round(value * 100) / 100;
const mean = rows => rows.reduce((sum, value) => sum + value, 0) / rows.length;
const key = (from, to) => `${from}->${to}`;
const group = (rows, get) => { const result = new Map(); rows.forEach(row => {
  const id = get(row); if (!result.has(id)) result.set(id, []); result.get(id).push(row);
}); return result; };
const rowDate = row => localDate(row.fromTimestamp || row.observedAt || row.timestamp || row.startedAt || row.board?.timestamp);

export function generateTermModel(dataset, catalog, evidence, currentRoutes, snapshotDate) {
  const measured = evidence.reported.filter(row => row.period === TERM.id && row.routeScheme === '2026-09'
    && row.source === 'direct_observed' && row.eligibleForSegmentTraining && row.leg);
  if (!measured.length) throw new Error('No usable direct measurements in the current academic term');
  const dwell = dataset.dwellObservations.filter(row => academicPeriod(rowDate(row)) === TERM.id && row.routeScheme === '2026-09'
    && row.eligibleForDwellTraining && !row.censoredAtRideEnd && row.source === 'stop_visit');
  const roads = group(measured, row => row.leg.roadId);
  const station = row => {
    const definition = catalog.definitions.get(`${row.routeScheme}:${row.routeId}`);
    const direction = definition?.stopDirections?.[row.stopIndex] || '';
    return `${row.stopId}${direction ? '@' + direction : ''}`;
  };
  const waits = group(dwell, station);
  const secondsPerMeter = weightedMedian(measured.map(row => ({value: row.seconds / row.leg.meters, weight: 1})));
  if (!(secondsPerMeter > 0 && Number.isFinite(secondsPerMeter))) throw new Error('Invalid same-term distance estimate');
  const dates = [...measured.map(row => rowDate(row)), ...dwell.map(rowDate)].filter(Boolean).sort();
  const model = {schema: 'cuhk_eta_prediction_v1', version: TERM_MODEL_VERSION, routeScheme: '2026-09',
    trainedThrough: dates.at(-1), dataSnapshotThrough: snapshotDate, trainingPeriod: TERM,
    training: {directSegments: measured.length, independentSessions: new Set(measured.map(row => row.sessionId)).size,
      measuredRoads: roads.size, completeDwellObservations: dwell.length, summerRecordsUsed: 0,
      transitionRecordsUsed: 0, interpolatedLabelsUsed: 0, presenceCorrectionsEnabled: false},
    fallback: {source: 'main_term_observed_arrival_rate', arrivalSecondsPerMeter: secondsPerMeter,
      unobservedDwellSeconds: 14, minimumSegmentMinutes: 0.2,
      meaning: 'Same-term arrival-to-arrival distance estimate, already including typical dwell; do not add dwell again.'},
    routes: {}};
  const legacy = {trainingPeriod: TERM, routes: {}, segments: {}, routeSegments: {}, stopDwell: {}, predictionModel: model};
  const changes = [];
  for (const route of currentRoutes) {
    const offsets = [0], dwellSeconds = [], segmentEvidence = [], dwellEvidence = [];
    for (let i = 1; i < route.stops.length; i++) {
      const leg = catalog.entries.get(`2026-09:${route.id}:${i - 1}`);
      if (!leg) throw new Error(`Missing current geometry: ${route.id}/${i - 1}`);
      const observations = roads.get(leg.roadId) || [];
      const seconds = observations.length ? mean(observations.map(row => row.seconds)) : leg.meters * secondsPerMeter;
      const minutes = round(Math.max(0.2, seconds / 60));
      offsets.push(round(offsets.at(-1) + minutes));
      const stopWaits = waits.get(leg.station) || [];
      const rawDwell = stopWaits.length ? mean(stopWaits.map(row => row.seconds)) : 14;
      const appliedDwell = round(Math.min(180, rawDwell, minutes * 60 * 0.45));
      dwellSeconds.push(appliedDwell);
      segmentEvidence.push({samples: observations.length, estimated: !observations.length,
        source: observations.length ? 'main_term_direct_observed' : 'main_term_distance_estimate'});
      dwellEvidence.push({samples: stopWaits.length, estimated: !stopWaits.length, observedSeconds: round(rawDwell), appliedSeconds: appliedDwell});
      const segment = {minutes, samples: observations.length, source: segmentEvidence.at(-1).source,
        estimated: !observations.length, period: TERM.id};
      legacy.routeSegments[`${route.id}:${key(leg.from, leg.to)}`] = segment;
      if (route.etaRouteId && route.etaRouteId !== route.id) legacy.routeSegments[`${route.etaRouteId}:${key(leg.from, leg.to)}`] = segment;
      changes.push({routeId: route.id, fromStopId: leg.from, toStopId: leg.to, minutes, ...segmentEvidence.at(-1), meters: round(leg.meters)});
    }
    dwellSeconds.push(0); dwellEvidence.push({samples: 0, estimated: true, terminal: true, appliedSeconds: 0});
    const item = {stopIds: route.stops, profiles: {all: {offsets, dwellSeconds}}, segmentEvidence, dwellEvidence};
    model.routes[route.id] = item;
    legacy.routes[route.id] = {routeId: route.id, stops: Object.fromEntries(offsets.map((offsetMinutes, i) => [i, {
      offsetMinutes, source: 'main_term_direct_or_distance_estimate', period: TERM.id}]))};
  }
  // Only expose shared stop-pair entries when all reviewed paths agree.
  for (const [pair, rows] of group(measured, row => key(row.fromStopId, row.toStopId))) {
    if (new Set(rows.map(row => row.leg.roadId)).size !== 1) continue;
    legacy.segments[pair] = {minutes: round(Math.max(0.2, mean(rows.map(row => row.seconds)) / 60)), samples: rows.length,
      source: 'main_term_direct_observed', period: TERM.id, estimated: false};
  }
  for (const [stopId, rows] of group(dwell, row => row.stopId)) legacy.stopDwell[stopId] = {
    seconds: round(mean(rows.map(row => row.seconds))), samples: rows.length, source: 'main_term_complete_stop_visit', period: TERM.id};
  return {model, legacy, changes, measured, dwell,
    review: evidence.reported.filter(row => row.period === TERM.id && row.source === 'direct_observed' && !row.eligibleForSegmentTraining)};
}

function main() {
  const [input, rawDirectory, miniRoot, output, ...options] = process.argv.slice(2);
  if (!input || !rawDirectory || !miniRoot || !output) throw new Error('Usage: node scripts/build_term_model.mjs dataset.json raw-directory mini-project new-private-output [--apply]');
  const directory = path.resolve(output);
  if (directory === ROOT || directory.startsWith(ROOT + path.sep)) throw new Error('Keep GPS archives outside the public repository');
  fs.mkdirSync(directory, {mode: 0o700});
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  const source = fs.readFileSync(input, 'utf8'), dataset = JSON.parse(source);
  const sandbox = vm.createContext({});
  for (const file of ['data/cuhk_bus_routes.js', 'data/transport_route_schemes.js', 'data/eta_prediction.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox);
  sandbox.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(sandbox.CUHK_BUS_DATA, '2026-09');
  const catalog = makeRoadCatalog(dataset);
  const availability = availabilityIndex(dataset,
    JSON.parse(fs.readFileSync(path.join(rawDirectory, 'ride_gps_sessions.json'))),
    JSON.parse(fs.readFileSync(path.join(rawDirectory, 'ride_gps_sample_chunks.json'))));
  const evidence = buildEvidence(dataset, catalog, availability);
  const result = generateTermModel(dataset, catalog, evidence, sandbox.CUHK_BUS_DATA.routes, '2026-10-25');
  if (!sandbox.CUHK_ETA_PREDICTION.setModel(result.model)) throw new Error('Generated model failed the runtime validator');
  const names = ['summer-data.json', 'transition-data.json', 'term-data.json', 'unclassified-data.json'];
  const category = row => { const period = academicPeriod(rowDate(row)); return period.startsWith('summer_') ? 0 : period === 'pre_term_transition' ? 1 : period === 'main_term' ? 2 : 3; };
  const archiveCounts = {};
  for (let index = 0; index < names.length; index++) {
    const archive = {schema: 'cuhk_eta_period_archive_v1', trainingPeriod: index === 2 ? TERM : null,
      records: [...dataset.sessions, ...(dataset.nonSegmentRecordings || [])].filter(row => category(row) === index),
      segments: dataset.segmentObservations.filter(row => category(row) === index),
      stopObservations: dataset.stopObservations.filter(row => category(row) === index),
      dwellObservations: dataset.dwellObservations.filter(row => category(row) === index),
      presence: dataset.boardConstraints.filter(row => category(row) === index)};
    archiveCounts[names[index]] = {records: archive.records.length, segments: archive.segments.length, presence: archive.presence.length};
    save(names[index], archive);
  }
  save('prediction-model.json', result.model);
  save('eta-model-patch.json', result.legacy);
  save('training-inputs.json', {measured: result.measured, dwell: result.dwell, heldForReview: result.review});
  const oldContext = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/eta_model.js'), 'utf8'), oldContext);
  const oldModel = oldContext.CUHK_ETA_MODEL;
  const report = {schema: 'cuhk_term_model_release_report_v1', generatedAt: new Date().toISOString(),
    datasetSha256: crypto.createHash('sha256').update(source).digest('hex'), modelVersion: TERM_MODEL_VERSION, trainingPeriod: TERM,
    training: result.model.training, trainedThrough: result.model.trainedThrough, dataSnapshotThrough: result.model.dataSnapshotThrough,
    archiveCounts, heldForReview: result.review.length, routeChanges: Object.entries(result.model.routes).map(([routeId, item]) => ({routeId,
      previousMinutes: oldModel.routes[routeId]?.profiles.all.offsets.at(-1), newMinutes: item.profiles.all.offsets.at(-1),
      measuredLegs: item.segmentEvidence.filter(row => row.samples > 0).length, totalLegs: item.segmentEvidence.length})),
    segments: result.changes, appliedToLocalFiles: options.includes('--apply'), cloudPublished: false,
    cautions: ['Only current-term direct usable timing is averaged. Existing flags describing spatial/visit conflicts are retained for review, not deleted.',
      'Complete same-term stop visits inform animation dwell, capped to 45% of the segment; no dwell is added to an already measured arrival interval.',
      'Unobserved legs use the current-term median arrival-time-per-road-meter, not historical trip times, summer values or inferred pure driving times.',
      'Snapshot date is not the last GPS timing date. No claim of proven independent accuracy gain is made.']};
  save('release-report.json', report);
  if (options.includes('--apply')) {
    const targets = [path.join(ROOT, 'data/eta_model.js'), path.join(miniRoot, 'miniprogram/data/etaModel.js'),
      path.join(miniRoot, 'cloud/app_config_latest.example.json')];
    const backups = targets.map((target, index) => { const contents = fs.readFileSync(target); save(`before-${index}-${path.basename(target)}`, contents.toString('utf8')); return {target, sha256: crypto.createHash('sha256').update(contents).digest('hex')}; });
    save('local-backups.json', backups);
    const js = `(function(root){const model=${JSON.stringify(result.model)};if(typeof module!=="undefined"&&module.exports)module.exports=model;root.CUHK_ETA_MODEL=model;})(typeof window!=="undefined"?window:globalThis);\n`;
    for (const target of targets.slice(0, 2)) fs.writeFileSync(target, js);
    const config = JSON.parse(fs.readFileSync(targets[2], 'utf8'));
    const next = {...config, version: Math.max(TERM_MODEL_VERSION, Number(config.version) + 1), updatedAt: new Date().toISOString(), etaModel: result.legacy};
    fs.writeFileSync(targets[2], JSON.stringify(next, null, 2) + '\n');
    fs.writeFileSync(path.join(miniRoot, 'cloud/app_config_term_2026-10-25.json'), JSON.stringify(next, null, 2) + '\n');
  }
  console.log(JSON.stringify({directory, training: report.training, trainedThrough: report.trainedThrough,
    archiveCounts, routeChanges: report.routeChanges, applied: report.appliedToLocalFiles}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
