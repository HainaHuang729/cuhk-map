import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertPrivateOutput, errorSummary, intervalReview} from './validate_term_eta.mjs';
import {makeRoadCatalog, availabilityIndex, buildEvidence} from './rebuild_eta_analysis.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const records = d => [...d.sessions, ...(d.nonSegmentRecordings || [])];
const types = ['segmentObservations', 'stopObservations', 'dwellObservations', 'boardConstraints'];
const groups = (rows, key) => {const map = new Map(); for (const row of rows) {const k = key(row); if (!map.has(k)) map.set(k, []); map.get(k).push(row);} return map;};
const fingerprint = row => Array.isArray(row.gpsSamples) && row.gpsSamples.length
  ? hash([row.routeId, row.routeScheme || '', row.startedAt, row.endedAt, row.gpsSamples]) : null;

export function auditJourneys(dataset, cores = [], chunks = []) {
  const byId = groups(records(dataset), row => row.sessionId);
  const aliases = new Map(), conflicts = [], journeys = [];
  const exact = new Map();
  for (const [id, rows] of byId) {
    if (!id || new Set(rows.map(row => hash([row.routeId, row.startedAt, row.endedAt, row.gpsSamples]))).size > 1) {
      conflicts.push({sessionId: id, reason: 'conflicting_recording_identity', count: rows.length}); continue;
    }
    const row = rows[0], fp = fingerprint(row);
    const canonical = fp && exact.get(fp) || id;
    if (fp) exact.set(fp, canonical);
    aliases.set(id, canonical);
    journeys.push({sessionId: id, canonicalId: canonical, fingerprint: fp, routeId: row.routeId,
      startedAt: row.startedAt, endedAt: row.endedAt, duplicateRows: rows.length - 1,
      rawCoreCount: cores.filter(core => [core.id, core._id, core.sessionId].includes(id)).length,
      rawChunkCount: chunks.filter(chunk => [chunk.sessionId, chunk.parentPayloadId].includes(id)).length,
      counts: Object.fromEntries(types.map(type => [type, (dataset[type] || []).filter(item => item.sessionId === id).length]))});
  }
  const unmatched = Object.fromEntries(types.map(type => [type, (dataset[type] || []).filter(row => !aliases.has(row.sessionId))]));
  const rawAliases = new Map();
  for (const core of cores) {
    const matches = [...new Set([core.id, core._id, core.sessionId].filter(id => aliases.has(id)).map(id => aliases.get(id)))];
    if (matches.length === 1) for (const id of [core.id, core._id, core.sessionId].filter(Boolean)) {
      if (!rawAliases.has(id)) rawAliases.set(id, new Set()); rawAliases.get(id).add(matches[0]);
    }
  }
  const chunkLinks = chunks.map((chunk, index) => {
    const matches = new Set();
    for (const id of [chunk.sessionId, chunk.parentPayloadId].filter(Boolean)) {
      if (aliases.has(id)) matches.add(aliases.get(id));
      for (const match of rawAliases.get(id) || []) matches.add(match);
    }
    return {index, chunkId: chunk._id || chunk.id, canonicalId: matches.size === 1 ? [...matches][0] : null,
      status: matches.size === 1 ? 'linked' : matches.size ? 'ambiguous' : 'unmatched'};
  });
  return {aliases, journeys, conflicts, unmatched, chunkLinks,
    summary: {recordings: records(dataset).length, uniqueRecordingIds: byId.size,
      canonicalRecordings: new Set(aliases.values()).size, exactTrackAliases: journeys.filter(row => row.sessionId !== row.canonicalId).length,
      conflictingIds: conflicts.length, unmatchedObservations: Object.fromEntries(types.map(type => [type, unmatched[type].length])),
      chunks: Object.fromEntries(['linked', 'unmatched', 'ambiguous'].map(status => [status, chunkLinks.filter(row => row.status === status).length]))}};
}

export function freezePair(dataset, baseline, candidate, runtimeSource, geometry, now = new Date()) {
  if (baseline.version !== 10 || candidate.version !== 11) throw new Error('Expected v10 / v11');
  const body = {schema: 'cuhk_paired_eta_validation_v1', frozenAt: now.toISOString(),
    models: {v10: baseline, v11: candidate}, runtimeSource, geometry,
    knownIds: [...new Set(records(dataset).map(row => hash(row.sessionId)))],
    knownTracks: [...new Set(records(dataset).map(fingerprint).filter(Boolean))],
    target: 'Boarding timestamp to subsequent GPS stop-zone entry; not exact door-open arrival.',
    selection: 'New complete whole recordings starting after freeze; exact duplicates counted once; no automatic model updates.'};
  return {...body, digest: hash(body)};
}

export function evaluatePair(dataset, labels, audit, protocol) {
  const {digest, ...body} = protocol;
  if (digest !== hash(body) || protocol.schema !== 'cuhk_paired_eta_validation_v1' || !Number.isFinite(Date.parse(protocol.frozenAt))) throw new Error('Changed or invalid frozen protocol');
  const engines = Object.fromEntries(Object.entries(protocol.models).map(([name, model]) => {
    const context = vm.createContext({}); vm.runInContext(protocol.runtimeSource, context);
    if (!context.CUHK_ETA_PREDICTION.setModel(model)) throw new Error('Invalid frozen model');
    return [name, context.CUHK_ETA_PREDICTION];
  }));
  const sessions = new Map(records(dataset).map(row => [row.sessionId, row]));
  const knownIds = new Set(protocol.knownIds), knownTracks = new Set(protocol.knownTracks);
  const boundary = Date.parse(protocol.frozenAt), accepted = [], held = [], seen = new Map();
  for (const label of labels) {
    const row = sessions.get(label.sessionId), canonical = audit.aliases.get(label.sessionId);
    const start = Date.parse(row?.startedAt), end = Date.parse(row?.endedAt), target = Date.parse(label.toTimestamp);
    let reason = !canonical ? 'unresolved_journey' : knownIds.has(hash(label.sessionId)) || knownTracks.has(fingerprint(row)) ? 'known_before_freeze'
      : !(start >= boundary && end >= start && label.at >= start && target <= end && target > label.at) ? 'not_new_complete_journey'
      : label.period !== 'main_term' || label.routeScheme !== protocol.models.v11.routeScheme ? 'different_period_or_route_scheme' : '';
    const key = JSON.stringify([canonical, label.routeId, label.fromStopIndex, label.toStopIndex, label.at, label.toTimestamp]);
    const measurements = [label.seconds, label.fromStopId, label.toStopId];
    if (!reason && seen.has(key)) reason = JSON.stringify(seen.get(key).measurements) === JSON.stringify(measurements) ? 'duplicate_observation' : 'conflicting_observation';
    if (reason) {
      if (reason === 'conflicting_observation') {
        const previous = seen.get(key); previous.conflict = true;
      }
      held.push({sessionId: label.sessionId, reason, key}); continue;
    }
    const values = {};
    for (const [name, engine] of Object.entries(engines)) {
      const route = protocol.models[name].routes[label.routeId], a = label.fromStopIndex, b = label.toStopIndex;
      if (!route || !Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b <= a || route.stopIds[a] !== label.fromStopId || route.stopIds[b] !== label.toStopId
        || (label.legs && (label.legs.length !== b-a || label.legs.some((leg, i) => leg.from !== route.stopIds[a+i] || leg.to !== route.stopIds[a+i+1])))) continue;
      const at = new Date(label.at), r = {id: label.routeId, stops: route.stopIds};
      values[name] = (engine.offset(r, b, at) - engine.offset(r, a, at)) * 60;
    }
    if (Object.keys(values).length !== 2 || !Object.values(values).every(value => value > 0 && Number.isFinite(value)) || !(label.seconds > 0)) {
      held.push({sessionId: label.sessionId, reason: 'invalid_interval_or_route', key}); continue;
    }
    const item = {measurements, conflict: false, sessionId: canonical, originalSessionId: label.sessionId,
      routeId: label.routeId, date: label.date, fromStopIndex: label.fromStopIndex, toStopIndex: label.toStopIndex,
      timeBand: engines.v11.bucket(new Date(label.at)), actualSeconds: label.seconds,
      predictions: values, ...intervalReview(label)};
    seen.set(key, item); accepted.push(item);
  }
  const rows = accepted.filter(row => !row.conflict);
  const summarize = list => Object.fromEntries(['v10', 'v11'].map(name => [name, errorSummary(list.map(row => ({...row, predictedSeconds: row.predictions[name], errorSeconds: row.predictions[name] - row.actualSeconds})))]));
  const summary = summarize(rows);
  const affected = rows.filter(row => Math.abs(row.predictions.v11 - row.predictions.v10) > 1e-6);
  const cohorts = Object.fromEntries([['all', rows], ['affected', affected],
    ['without_distance_time_conflict', rows.filter(row => !row.reviewFlags.includes('route_distance_time_conflict'))],
    ['affected_without_distance_time_conflict', affected.filter(row => !row.reviewFlags.includes('route_distance_time_conflict'))]]
    .map(([name, list]) => [name, {metrics: summarize(list),
      latestObservedDate: list.map(row => row.date).sort().at(-1) || null,
      byServiceDate: [...groups(list, row => row.date)].map(([date, dayRows]) => ({date, metrics: summarize(dayRows)}))}]));
  const byGroup = [...groups(rows, row => JSON.stringify([row.routeId, row.fromStopIndex, row.toStopIndex, row.timeBand])).values()].map(list => ({routeId: list[0].routeId,
    fromStopIndex: list[0].fromStopIndex, toStopIndex: list[0].toStopIndex, timeBand: list[0].timeBand,
    latestObservedDate: list.map(row => row.date).sort().at(-1), metrics: summarize(list)}));
  return {status: rows.length ? 'descriptive_validation_no_auto_promotion' : 'awaiting_new_independent_journeys',
    frozenAt: protocol.frozenAt, summary, cohorts, byGroup, rows, held,
    sensitivityRule: 'Report both all rows and rows without pre-existing route_distance_time_conflict (>80 km/h implied route speed); no originals removed.',
    confidenceInterval: null,
    confidenceIntervalReason: 'Physical bus-run clusters unknown; no inferential interval claimed. Service-day summaries are descriptive.',
    heldCounts: Object.fromEntries([...groups(held, row => row.reason)].map(([reason, list]) => [reason, list.length])),
    caveats: ['Session-balanced statistics refer to passenger recordings, not identified physical bus runs.',
      'Flags retained in primary metrics; repeated stops distinguished by indices; no presence-to-arrival conversion.',
      'Uses frozen client current-time bucket. Boarding residual dwell is unknown; this is not whole scheduled-trip ETA accuracy.']};
}

function main() {
  const [datasetFile, rawDirectory, output, protocolFile] = process.argv.slice(2);
  if (!datasetFile || !rawDirectory || !output) throw new Error('Usage: node scripts/validate_dwell_trial.mjs dataset.json raw-directory new-private-output [existing-protocol.json]');
  assertPrivateOutput(output);
  const load = file => JSON.parse(fs.readFileSync(file, 'utf8'));
  const dataset = load(datasetFile), cores = load(path.join(rawDirectory, 'ride_gps_sessions.json')), chunks = load(path.join(rawDirectory, 'ride_gps_sample_chunks.json'));
  const geometry = Object.fromEntries(['data/cuhk_bus_routes.js', 'data/transport_route_schemes.js'].map(file => [file, hash(fs.readFileSync(path.join(ROOT, file), 'utf8'))]));
  const context = vm.createContext({}); vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/eta_model.js'), 'utf8'), context);
  const candidate = JSON.parse(JSON.stringify(context.CUHK_ETA_MODEL));
  const protocol = protocolFile ? load(protocolFile) : freezePair(dataset, load(path.join(rawDirectory, 'term-model-release/prediction-model.json')), candidate, fs.readFileSync(path.join(ROOT, 'data/eta_prediction.js'), 'utf8'), geometry);
  if (JSON.stringify(geometry) !== JSON.stringify(protocol.geometry)) throw new Error('Route geometry changed; frozen validation requires matching geometry');
  const audit = auditJourneys(dataset, cores, chunks), catalog = makeRoadCatalog(dataset);
  const evidence = buildEvidence(dataset, catalog, availabilityIndex(dataset, cores, chunks));
  const report = evaluatePair(dataset, evidence.labels, audit, protocol);
  const runtime = vm.createContext({}); vm.runInContext(protocol.runtimeSource, runtime);
  const bucket = row => runtime.CUHK_ETA_PREDICTION.bucket(new Date(row.at));
  const coverage = [...groups(evidence.labels, row => JSON.stringify([row.period, row.routeScheme, row.routeId, row.fromStopIndex, row.toStopIndex, bucket(row)])).values()].map(list => ({
    period: list[0].period, routeScheme: list[0].routeScheme, routeId: list[0].routeId, fromStopIndex: list[0].fromStopIndex, toStopIndex: list[0].toStopIndex,
    timeBand: bucket(list[0]), observations: list.length, recordings: new Set(list.map(row => audit.aliases.get(row.sessionId) || row.sessionId)).size,
    latestObservedDate: list.map(row => row.date).sort().at(-1)}));
  fs.mkdirSync(output, {mode: 0o700});
  const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  save('paired-protocol.json', protocol);
  save('journey-linkage.json', {...audit, aliases: Object.fromEntries(audit.aliases)});
  save('paired-validation.json', {...report, datasetSha256: hash(fs.readFileSync(datasetFile, 'utf8')), coverage});
  console.log(JSON.stringify({audit: audit.summary, validation: report.summary, status: report.status, held: report.heldCounts}, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
