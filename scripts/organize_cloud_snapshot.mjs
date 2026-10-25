import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const time = value => Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
const id = value => String(value.id || value.payloadId || value._id || '');
const countBy = (items, key) => items.reduce((result, item) => {
  const value = String(key(item) || 'unknown');
  result[value] = (result[value] || 0) + 1;
  return result;
}, {});
const pointKey = point => `${point.timestamp}:${point.lon}:${point.lat}`;
const round = number => Math.round(number * 100) / 100;

export function recordingPoints(core, chunks = []) {
  const points = [...(core.gpsSamples || []), ...chunks.flatMap(chunk => chunk.gpsSamples || [])]
    .map(point => ({timestamp: point.timestamp, lon: Number(point.lon), lat: Number(point.lat), accuracy: point.accuracy == null ? null : Number(point.accuracy)}))
    .filter(point => time(point.timestamp) !== null && Number.isFinite(point.lon) && Number.isFinite(point.lat) && point.lon >= 113 && point.lon <= 115 && point.lat >= 22 && point.lat <= 23);
  return [...new Map(points.map(point => [pointKey(point), point])).values()].sort((a, b) => time(a.timestamp) - time(b.timestamp));
}

export function auditChunks(cores, chunks) {
  const grouped = new Map();
  const coreIds = new Set(cores.map(id));
  for (const chunk of chunks) {
    const parent = String(chunk.parentPayloadId || chunk.sessionId || '');
    if (!grouped.has(parent)) grouped.set(parent, []);
    grouped.get(parent).push(chunk);
  }
  const issues = [];
  for (const core of cores) {
    const expected = Number(core.gpsSampleChunkCount || 0);
    if (!expected) continue;
    const records = grouped.get(id(core)) || [];
    const indexes = new Set(records.map(chunk => Number(chunk.chunkIndex ?? Number(chunk.chunkNumber) - 1)));
    const missingIndexes = Array.from({length: expected}, (_, index) => index).filter(index => !indexes.has(index));
    const receivedSamples = records.reduce((sum, chunk) => sum + (chunk.gpsSamples || []).length, 0);
    const expectedSamples = Number(core.gpsSampleCount ?? core.sampleCount);
    const mismatchedRoute = records.some(chunk => chunk.routeId !== core.routeId);
    if (missingIndexes.length || records.length !== indexes.size || mismatchedRoute || receivedSamples !== expectedSamples) {
      issues.push({sessionId: id(core), routeId: core.routeId, expectedChunks: expected, receivedChunks: records.length,
        missingIndexes, expectedSamples, receivedSamples, mismatchedRoute, duplicateChunkIndexes: records.length - indexes.size});
    }
  }
  const orphans = [...grouped].filter(([parent]) => !coreIds.has(parent));
  return {sessionsWithExpectedChunks: cores.filter(core => Number(core.gpsSampleChunkCount) > 0).length,
    issues, orphanParentIds: orphans.map(([parent]) => parent), orphanChunks: orphans.reduce((sum, [, rows]) => sum + rows.length, 0)};
}

function main() {
  const args = process.argv.slice(2), supplements = [];
  let snapshot = '', previousFile = '', refreshGenerated = false;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--snapshot') snapshot = path.resolve(args[++index]);
    else if (args[index] === '--previous') previousFile = path.resolve(args[++index]);
    else if (args[index] === '--supplement') supplements.push(path.resolve(args[++index]));
    else if (args[index] === '--refresh-generated') refreshGenerated = true;
    else throw new Error(`Unexpected argument ${args[index]}`);
  }
  if (!snapshot || !previousFile) throw new Error('Usage: node scripts/organize_cloud_snapshot.mjs --snapshot directory --previous dataset.json [--supplement export.json]');
  const manifest = read(path.join(snapshot, 'snapshot-manifest.json'));
  if (!manifest.completedAt || Object.values(manifest.collections).some(item => !item.countMatched)) throw new Error('Cloud snapshot is incomplete or changed during export; review it before normalization');
  const cores = read(path.join(snapshot, 'ride_gps_sessions.json'));
  const chunks = read(path.join(snapshot, 'ride_gps_sample_chunks.json'));
  const broadcasts = read(path.join(snapshot, 'board_broadcasts.json'));
  const previous = read(previousFile);
  const out = path.join(snapshot, 'cuhk-modeling-data.json');
  if (fs.existsSync(out) && !refreshGenerated) throw new Error('Refusing to overwrite an existing modeling dataset; use --refresh-generated only for this generated output');
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  execFileSync(process.execPath, [path.join(scriptDir, 'build_prediction_dataset.mjs'),
    ...['ride_gps_sessions', 'ride_gps_sample_chunks', 'board_broadcasts'].map(name => path.join(snapshot, `${name}.json`)),
    ...supplements, '--out', out], {stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024});
  fs.chmodSync(out, 0o600);
  const dataset = read(out);
  const previousSessions = [...previous.sessions, ...previous.excludedSessions];
  const oldIds = new Set(previousSessions.map(session => session.sessionId));
  const currentIds = new Set([...dataset.sessions, ...dataset.excludedSessions].map(session => session.sessionId));
  const missingHistorical = previousSessions.filter(session => !currentIds.has(session.sessionId));
  if (missingHistorical.length) throw new Error(`Historical sessions are missing from normalization: ${missingHistorical.length}. Raw snapshot is preserved.`);
  const byId = new Map(dataset.sessions.map(session => [session.sessionId, session]));
  let restoredHistoricalPoints = 0;
  for (const old of previous.sessions) {
    const session = byId.get(old.sessionId);
    if (!session) continue;
    const points = new Map(session.gpsSamples.map(point => [pointKey(point), point]));
    for (const point of old.gpsSamples || []) {
      if (!points.has(pointKey(point))) { points.set(pointKey(point), point); restoredHistoricalPoints++; }
    }
    session.gpsSamples = [...points.values()].sort((a, b) => time(a.timestamp) - time(b.timestamp));
    session.gpsQuality.samples = session.gpsSamples.length;
    session.gpsQuality.accuracyOver50 = session.gpsSamples.filter(point => point.accuracy > 50).length;
  }
  const integrity = auditChunks(cores, chunks);
  const problemIds = new Set(integrity.issues.map(issue => issue.sessionId));
  dataset.sessions.forEach(session => { session.trackIntegrity = problemIds.has(session.sessionId) ? 'incomplete_or_inconsistent_chunks' : 'no_chunk_issue_detected'; });
  const newCores = cores.filter(core => !oldIds.has(id(core)));
  const retainedIds = new Set(dataset.sessions.map(session => session.sessionId));
  const segmentIds = new Set(dataset.segmentObservations.filter(item => item.eligibleForSegmentTraining).map(item => item.sessionId));
  const presenceIds = new Set(dataset.boardConstraints.filter(item => item.eligibleForTimeConstraint).map(item => item.sessionId));
  const chunksByParent = new Map();
  for (const chunk of chunks) {
    const parent = String(chunk.parentPayloadId || chunk.sessionId || '');
    if (!chunksByParent.has(parent)) chunksByParent.set(parent, []);
    chunksByParent.get(parent).push(chunk);
  }
  const excludedById = new Map(dataset.excludedSessions.map(session => [session.sessionId, session]));
  const shortEvent = value => value ? Object.fromEntries(['stopId', 'stopIndex', 'timestamp', 'lon', 'lat', 'accuracy', 'stopDistanceMeters'].map(key => [key, value[key] ?? null])) : null;
  dataset.nonSegmentRecordings = cores.filter(core => !retainedIds.has(id(core))).map(core => ({
    sessionId: id(core), routeId: core.routeId, startedAt: core.startedAt, endedAt: core.endedAt,
    reason: excludedById.get(id(core))?.reason || 'review_required',
    modelUse: presenceIds.has(id(core)) ? 'presence_only' : 'quarantine_for_review',
    eligibleForSegmentTraining: false,
    board: shortEvent(core.board), alight: shortEvent(core.alight),
    gpsSamples: recordingPoints(core, chunksByParent.get(id(core)) || []),
  }));
  const newSessions = newCores.map(core => ({sessionId: id(core), routeId: core.routeId,
    startedAt: core.startedAt, endedAt: core.endedAt,
    durationSeconds: time(core.startedAt) !== null && time(core.endedAt) !== null ? round((time(core.endedAt) - time(core.startedAt)) / 1000) : null,
    reportedSamples: Number(core.gpsSampleCount ?? core.sampleCount ?? 0),
    retainedTrajectoryOrCalibration: retainedIds.has(id(core)), usableSegmentTiming: segmentIds.has(id(core)),
    usablePresenceConstraint: presenceIds.has(id(core)), boardStopId: core.board?.stopId || '', alightStopId: core.alight?.stopId || ''}));
  const cloudIds = new Set(cores.map(id));
  const latest = rows => rows.map(row => row.serverUploadedAt || row.clientUploadedAt || row.createdAt).filter(value => time(value) !== null).sort().at(-1) || null;
  const report = {schema: 'cuhk_data_inventory_v1', generatedAt: new Date().toISOString(), timezone: 'Asia/Hong_Kong',
    cloud: Object.fromEntries(Object.entries(manifest.collections).map(([name, item]) => [name, {...item, latestUploadAt: latest(name === 'ride_gps_sessions' ? cores : name === 'ride_gps_sample_chunks' ? chunks : broadcasts)}])),
    previous: {file: path.basename(previousFile), summary: previous.summary},
    newSincePrevious: {coreRecords: newCores.length, routes: countBy(newCores, core => core.routeId),
      withUsableSegmentTiming: newSessions.filter(item => item.usableSegmentTiming).length,
      withUsablePresenceConstraint: newSessions.filter(item => item.usablePresenceConstraint).length,
      timingCandidates: dataset.segmentObservations.filter(item => newCores.some(core => id(core) === item.sessionId)).map(item => ({
        routeId: item.routeId, fromStopId: item.fromStopId, toStopId: item.toStopId, minutes: item.minutes,
        source: item.source, flags: item.flags, eligibleForSegmentTraining: item.eligibleForSegmentTraining,
      })),
      sessions: newSessions},
    historicalRetention: {sessionsAbsentFromCloudKeptLocally: previousSessions.filter(session => !cloudIds.has(session.sessionId)).length,
      missingAfterMerge: missingHistorical.length, restoredHistoricalPoints},
    chunkIntegrity: integrity,
    summary: dataset.summary,
    retainedSessionsByRoute: countBy(dataset.sessions, session => session.routeId),
    eligibleSegmentsByRoute: countBy(dataset.segmentObservations.filter(item => item.eligibleForSegmentTraining), item => item.routeId),
    presenceConstraintsByRoute: countBy(dataset.boardConstraints.filter(item => item.eligibleForTimeConstraint), item => item.routeId),
    shortSessions: {under90Seconds: cores.filter(core => time(core.startedAt) !== null && time(core.endedAt) !== null && time(core.endedAt) >= time(core.startedAt) && time(core.endedAt) - time(core.startedAt) < 90000).length,
      meaning: 'Short recordings can contribute reliable stop-presence constraints. They do not establish a complete trip or cross-stop travel time.'},
    limitations: ['No live database records were changed. No prediction model was trained or deployed.',
      'Legacy and 2026-09 route schemes remain separate. Do not train current routes using incompatible legacy stop sequences.',
      'Boarding constrains vehicle presence at a stop, not exact arrival, dwell length, or departure from the route origin.',
      'Weather and passenger counts are not observed. Do not classify congestion using only recording duration.',
      'Records excluded from segment timing remain in the raw exports and may retain valid presence observations.']};
  dataset.snapshotIntegrity = integrity;
  if (restoredHistoricalPoints) dataset.sourceFiles.push({name: path.basename(previousFile), restoredHistoricalPoints});
  dataset.historicalRetention = report.historicalRetention;
  dataset.newSincePrevious = report.newSincePrevious;
  dataset.summary.retainedGpsPoints = dataset.sessions.reduce((sum, session) => sum + session.gpsSamples.length, 0);
  dataset.summary.nonSegmentRecordings = dataset.nonSegmentRecordings.length;
  dataset.summary.nonSegmentGpsPoints = dataset.nonSegmentRecordings.reduce((sum, session) => sum + session.gpsSamples.length, 0);
  dataset.summary.presenceOnlyRecordings = dataset.nonSegmentRecordings.filter(session => session.modelUse === 'presence_only').length;
  dataset.summary.quarantinedRecordings = dataset.nonSegmentRecordings.filter(session => session.modelUse === 'quarantine_for_review').length;
  dataset.definitions.nonSegmentRecordings = 'Short/sparse/same-stop tracks are preserved here with their GPS points. Only independently eligible boardConstraints can be used for stop presence; do not use these recording durations as stop-to-stop travel times.';
  dataset.definitions.sessions += ' Chunk completeness is audited separately; retained does not mean complete or reliable end-to-end journey.';
  fs.writeFileSync(out, JSON.stringify(dataset, null, 2) + '\n', {mode: 0o600});
  const reportFile = path.join(snapshot, 'data-inventory.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({dataset: out, report: reportFile, summary: dataset.summary,
    newRecords: report.newSincePrevious, historicalRetention: report.historicalRetention,
    chunkIntegrity: {issues: integrity.issues.length, orphanChunks: integrity.orphanChunks}}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
