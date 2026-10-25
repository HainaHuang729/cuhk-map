import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {academicPeriod, PERIODS} from './study_eta_periods.mjs';
import {prepareEvidence, localDate, metrics, weightedMedian} from './experiment_eta_models.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HK = 8 * 3600000;
const finite = Number.isFinite;
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const epoch = value => Date.parse(value || '');
const midnight = date => epoch(`${date}T00:00:00+08:00`);
const unique = rows => [...new Set(rows)];
const average = rows => rows.length ? rows.reduce((a, b) => a + b, 0) / rows.length : null;
const median = rows => weightedMedian(rows.map(value => ({value, weight: 1})));
const count = (rows, get) => rows.reduce((out, row) => { const key = get(row) || 'unknown'; out[key] = (out[key] || 0) + 1; return out; }, {});
const group = (rows, get) => { const out = new Map(); rows.forEach(row => { const key = get(row); if (!out.has(key)) out.set(key, []); out.get(key).push(row); }); return out; };

export function contextAt(at) {
  const date = new Date(at + HK), day = date.getUTCDay(), minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const bucket = minute < 450 ? 'early' : minute < 600 ? 'morning_peak' : minute < 690 ? 'morning'
    : minute < 840 ? 'lunch' : minute < 990 ? 'afternoon' : minute < 1170 ? 'evening_peak' : 'night';
  return {date: localDate(new Date(at).toISOString()), dayType: day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday', bucket};
}

function distance(a, b) {
  if (!a || !b) return 100;
  const rad = Math.PI / 180;
  return Math.hypot((b[0] - a[0]) * Math.cos((a[1] + b[1]) * rad / 2), b[1] - a[1]) * rad * 6371000;
}

export function availabilityIndex(dataset, cores = [], chunks = []) {
  const rows = new Map();
  const add = (id, at, recordedUpload = false) => {
    if (!id || !finite(at)) return;
    const previous = rows.get(id) || {at: -Infinity, recordedUpload: false};
    rows.set(id, {at: Math.max(at, previous.at), recordedUpload: recordedUpload || previous.recordedUpload});
  };
  for (const row of [...dataset.sessions, ...(dataset.nonSegmentRecordings || [])]) add(row.sessionId, epoch(row.endedAt || row.startedAt));
  for (const row of cores) {
    const id = row.id || row._id;
    const uploaded = epoch(row.cloudUploadedAt || row.serverUploadedAt || row.clientUploadedAt);
    add(id, epoch(row.endedAt || row.startedAt));
    add(id, uploaded, finite(uploaded));
  }
  for (const row of chunks) {
    const uploaded = epoch(row.cloudUploadedAt || row.serverUploadedAt || row.clientUploadedAt);
    add(row.sessionId || row.parentPayloadId, uploaded, finite(uploaded));
  }
  for (const row of [...dataset.segmentObservations, ...dataset.stopObservations]) {
    add(row.sessionId, epoch(row.toTimestamp || row.observedAt || row.fromTimestamp));
  }
  return rows;
}

export function makeRoadCatalog(dataset) {
  const entries = new Map(), definitions = new Map();
  for (const [scheme, list] of Object.entries(dataset.routeDefinitions)) {
    const name = scheme === 'current' ? '2026-09' : 'legacy';
    const sandbox = vm.createContext({});
    const source = fs.readFileSync(path.join(REPO, 'data/cuhk_bus_routes.js'), 'utf8')
      .replace('root.CUHK_BUS_UTILS = {', 'root.CUHK_BUS_UTILS = { routeDistanceProfile, routeStopDistances,');
    vm.runInContext(source, sandbox);
    if (name !== 'legacy') {
      vm.runInContext(fs.readFileSync(path.join(REPO, 'data/transport_route_schemes.js'), 'utf8'), sandbox);
      sandbox.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(sandbox.CUHK_BUS_DATA, name);
    }
    for (const definition of list) {
      definitions.set(`${name}:${definition.id}`, definition);
      const route = sandbox.CUHK_BUS_DATA.routes.find(row => row.id === definition.id);
      const matches = route && JSON.stringify(route.stops) === JSON.stringify(definition.stops);
      const utils = sandbox.CUHK_BUS_UTILS;
      const profile = matches ? utils.routeDistanceProfile(route) : null;
      const stops = matches ? utils.routeStopDistances(route) : [];
      for (let i = 1; i < definition.stops.length; i++) {
        const from = definition.stops[i - 1], to = definition.stops[i];
        const meters = stops[i] - stops[i - 1];
        const coordinates = profile && meters > 1 ? [utils.coordAtProgress(profile.coords, stops[i - 1] / profile.total).coord,
          ...profile.coords.filter((_, index) => profile.cumulative[index] > stops[i - 1] && profile.cumulative[index] < stops[i]),
          utils.coordAtProgress(profile.coords, stops[i] / profile.total).coord] : null;
        const signature = coordinates ? hash(JSON.stringify([from, to, coordinates.map(point => point.map(value => Math.round(value * 1e5)))]))
          : `unverified:${name}:${definition.id}:${i}`;
        const direction = definition.stopDirections?.[i - 1] || '';
        entries.set(`${name}:${definition.id}:${i - 1}`, {from, to, fromIndex: i - 1, toIndex: i,
          station: `${from}${direction ? '@' + direction : ''}`, shapeId: signature,
          roadId: `${name}:${signature}`, meters: meters > 1 ? meters : Math.max(20, distance(dataset.stops[from]?.coord, dataset.stops[to]?.coord)),
          geometryVerifiedInSnapshot: !!coordinates, routeId: definition.id, routeScheme: name});
      }
    }
  }
  return {entries, definitions};
}

export function buildEvidence(dataset, catalog, availability) {
  const prepared = prepareEvidence(dataset), issues = [];
  const recordings = new Map([...dataset.sessions, ...(dataset.nonSegmentRecordings || [])].map(row => [row.sessionId, row]));
  const decorate = row => {
    const at = epoch(row.fromTimestamp || row.observedAt || row.timestamp);
    return {...row, at, date: localDate(new Date(at).toISOString()), period: academicPeriod(localDate(new Date(at).toISOString())),
      availableAt: Math.max(availability.get(row.sessionId)?.at || at, epoch(row.toTimestamp) || at)};
  };
  const roadFor = row => {
    const definition = catalog.definitions.get(`${row.routeScheme}:${row.routeId}`);
    if (!definition) return null;
    const choices = definition.stops.flatMap((stop, index) => stop === row.fromStopId && definition.stops[index + 1] === row.toStopId
      ? [catalog.entries.get(`${row.routeScheme}:${row.routeId}:${index}`)] : []).filter(Boolean);
    const indexed = Number.isInteger(row.fromStopIndex) && choices.find(leg => leg.fromIndex === row.fromStopIndex);
    return indexed || (unique(choices.map(leg => leg.roadId)).length === 1 ? choices[0] : null);
  };
  const reported = prepared.segments.map(row => ({...decorate(row), seconds: row.value * 60, leg: roadFor(row)}));
  const dwell = [], spans = [], drives = [], labels = [];
  for (const [sessionId, all] of group(dataset.stopObservations, row => row.sessionId)) {
    const recording = recordings.get(sessionId);
    const definition = catalog.definitions.get(`${all[0].routeScheme}:${all[0].routeId}`);
    const visits = all.filter(row => {
      const valid = finite(epoch(row.observedAt)) && definition?.stops[row.stopIndex] === row.stopId
        && ['board_event', 'stop_visit'].includes(row.source);
      if (!valid) issues.push({sessionId, stopId: row.stopId, stopIndex: row.stopIndex, reason: 'unresolved_station_timestamp_or_source', retained: true});
      return valid;
    }).sort((a, b) => a.stopIndex - b.stopIndex);
    for (const row of visits.filter(row => row.source === 'stop_visit')) {
      const start = epoch(row.visitStartedAt), end = epoch(row.visitEndedAt), seconds = (end - start) / 1000;
      if (!(seconds >= 0 && finite(seconds))) continue;
      const direction = definition.stopDirections?.[row.stopIndex] || '';
      dwell.push({...decorate(row), kind: 'dwell', seconds, station: `${row.stopId}${direction ? '@' + direction : ''}`,
        censored: Math.abs(end - epoch(recording?.endedAt)) < 3000 || Math.abs(start - epoch(recording?.startedAt)) < 3000});
    }
    const makeSpan = (from, to) => {
      const seconds = (epoch(to.observedAt) - epoch(from.observedAt)) / 1000;
      if (!(seconds > 0 && to.stopIndex > from.stopIndex)) return null;
      const legs = [];
      for (let i = from.stopIndex; i < to.stopIndex; i++) {
        const leg = catalog.entries.get(`${from.routeScheme}:${from.routeId}:${i}`);
        if (!leg) return null;
        legs.push(leg);
      }
      return {...decorate({...from, fromTimestamp: from.observedAt, toTimestamp: to.observedAt}),
        uid: `${sessionId}:${from.stopIndex}:${to.stopIndex}`, sessionId, routeId: from.routeId, routeScheme: from.routeScheme,
        fromStopId: from.stopId, toStopId: to.stopId, fromStopIndex: from.stopIndex, toStopIndex: to.stopIndex,
        originKind: from.source === 'board_event' ? 'boarding_remaining' : 'arrival_dwell',
        seconds, legs, flags: unique([...(from.flags || []), ...(to.flags || [])])};
    };
    for (let i = 1; i < visits.length; i++) {
      const from = visits[i - 1], to = visits[i], span = makeSpan(from, to);
      if (!span) { issues.push({sessionId, from: from.stopIndex, to: to.stopIndex, reason: 'nonpositive_or_unmapped_interval', retained: true}); continue; }
      spans.push(span);
      const driving = (epoch(to.observedAt) - epoch(from.visitEndedAt)) / 1000;
      if (span.legs.length === 1 && from.source === 'stop_visit' && finite(driving) && driving >= 0) {
        drives.push({...span, kind: 'driving', seconds: driving, leg: span.legs[0]});
      }
    }
    const anchor = visits.find(row => row.source === 'board_event' && row.eligibleForArrivalTraining);
    if (anchor) {
      for (const target of visits.filter(row => row.source === 'stop_visit' && row.eligibleForArrivalTraining && row.stopIndex > anchor.stopIndex)) {
        const label = makeSpan(anchor, target);
        if (label) labels.push(label);
      }
    }
  }
  const presence = prepared.presence.map(row => ({...row, period: academicPeriod(row.date), context: contextAt(row.at),
    observationMeaning: 'Vehicle present at this recorded time; not an exact arrival, departure, load measurement or identified scheduled trip.'}));
  return {reported, spans, drives, dwell, labels, presence, issues, recordings, catalog, availability};
}

export function historicalRows(rows, before) {
  return rows.filter(row => row.date < before && row.availableAt < midnight(before));
}

// Coordinate minimization of a nonnegative convex Huber/squared/one-sided loss.
export function solveComponents(equations, initial, delta = Infinity, maxSweeps = 1200) {
  equations = equations.map(row => {
    const terms = new Map();
    row.terms.forEach(([i, a]) => terms.set(i, (terms.get(i) || 0) + a));
    return {...row, terms: [...terms].filter(([, a]) => a)};
  });
  const values = [...initial], predictions = equations.map(row => row.terms.reduce((sum, [i, a]) => sum + a * values[i], 0));
  const byVariable = values.map(() => []);
  equations.forEach((row, index) => row.terms.forEach(([i, coefficient]) => byVariable[i].push([index, coefficient])));
  let sweeps = 0, largestChange = Infinity;
  for (; sweeps < maxSweeps; sweeps++) {
    largestChange = 0;
    for (let i = 0; i < values.length; i++) {
      const derivative = alternative => byVariable[i].reduce((sum, [index, a]) => {
        const row = equations[index], residual = predictions[index] + a * (alternative - values[i]) - row.seconds;
        const bounded = row.lowerBound ? Math.min(0, residual) : residual;
        const threshold = row.prior ? Infinity : delta;
        return sum + row.weight * a * Math.max(-threshold, Math.min(threshold, bounded));
      }, 0);
      let next = 0;
      if (derivative(0) < 0) {
        let low = 0, high = Math.max(1, values[i] * 2);
        while (derivative(high) < 0 && high < 1e9) high *= 2;
        for (let j = 0; j < 30; j++) {
          const middle = (low + high) / 2;
          if (derivative(middle) < 0) low = middle; else high = middle;
        }
        next = (low + high) / 2;
      }
      const change = next - values[i];
      largestChange = Math.max(largestChange, Math.abs(change));
      values[i] = next;
      byVariable[i].forEach(([index, a]) => { predictions[index] += a * change; });
    }
    if (largestChange < 0.002) break;
  }
  return {values, sweeps: Math.min(sweeps + 1, maxSweeps), converged: sweeps < maxSweeps, lastMaximumStepSeconds: largestChange};
}

export const CANDIDATES_V2 = [
  {id: 'period_all_mean', label: '同期全部计时均值', estimator: 'mean'},
  {id: 'period_all_median', label: '同期全部计时中位数', estimator: 'median'},
  {id: 'period_measured_mean', label: '同期计时均值，不把插值当独立实测', estimator: 'mean', measuredOnly: true},
  {id: 'period_components_squared', label: '同期行驶＋停站＋上车后剩余停站', components: true},
  {id: 'period_components_robust', label: '同期分量模型＋稳健损失', components: true, delta: 60},
  {id: 'period_components_time', label: '同期分量模型＋稳健损失＋分时段', components: true, delta: 60, time: true},
  {id: 'period_components_road_prior', label: '同上，仅行驶部分可借用同形道路历史', components: true, delta: 60, time: true, roadPrior: true},
];

export function fitV2(evidence, config, before) {
  const training = Object.fromEntries(['reported', 'spans', 'drives', 'dwell'].map(field => [field, historicalRows(evidence[field], before)]));
  const estimate = config.estimator === 'median' ? median : average;
  const grouped = group(training.reported.filter(row => row.leg && (!config.measuredOnly || row.source !== 'interpolated_observed_span')),
    row => `${row.period}|${row.leg.roadId}`);
  const phaseRates = new Map();
  for (const [period, rows] of group(training.reported.filter(row => row.leg), row => row.period)) {
    phaseRates.set(period, median(rows.map(row => row.seconds / row.leg.meters)));
  }
  const totalFallback = (period, leg) => Math.max(1, leg.meters * (phaseRates.get(period) || 0.25));
  if (!config.components) return {predict(row) {
    let seconds = 0, missing = 0;
    for (const leg of row.legs) {
      const rows = grouped.get(`${row.period}|${leg.roadId}`) || [];
      seconds += rows.length ? estimate(rows.map(row => row.seconds)) : totalFallback(row.period, leg);
      if (!rows.length) missing++;
    }
    return {seconds, supported: !missing, missingRoads: missing};
  }, training: {allRecords: training.reported.length, usedTimingRows: [...grouped.values()].flat().length,
    oldQualityFlagsFiltered: false, crossPeriodTotalsUsed: false}, parameters: Object.fromEntries([...grouped].map(([key, rows]) => [key, {seconds: estimate(rows.map(row => row.seconds)), n: rows.length}]))};

  const variableNames = [], indices = new Map(), initial = [], equations = [], supportedRoads = new Set(), priorUses = [];
  const phaseDwell = new Map([...group(training.dwell.filter(row => !row.censored), row => row.period)]
    .map(([period, rows]) => [period, median(rows.map(row => row.seconds))]));
  const phaseDriving = new Map([...group(training.drives, row => row.period)]
    .map(([period, rows]) => [period, median(rows.map(row => row.seconds / row.leg.meters))]));
  const previousDriving = group(training.drives.filter(row => row.leg.geometryVerifiedInSnapshot), row => row.leg.shapeId);
  const currentDriving = group(training.drives, row => `${row.period}|${row.leg.roadId}`);
  function parameter(name, prior, parent = null) {
    if (indices.has(name)) return indices.get(name);
    const i = initial.length;
    indices.set(name, i); variableNames.push(name); initial.push(Math.max(0, prior));
    equations.push({terms: parent === null ? [[i, 1]] : [[i, 1], [parent, -1]], seconds: parent === null ? prior : 0,
      weight: parent === null ? 0.1 : 0.5, prior: true});
    return i;
  }
  function driveParameter(period, leg) {
    let prior = leg.meters * (phaseDriving.get(period) ?? Math.max(0.01, (phaseRates.get(period) || 0.25) * 0.8));
    if (config.roadPrior && !currentDriving.has(`${period}|${leg.roadId}`) && leg.geometryVerifiedInSnapshot) {
      const periodStart = PERIODS.find(row => row.id === period)?.start;
      const old = (previousDriving.get(leg.shapeId) || []).filter(row => row.period !== period && periodStart && row.at < midnight(periodStart));
      if (old.length) {
        prior = median(old.map(row => row.seconds));
        const id = `${period}|${leg.roadId}`;
        if (!priorUses.includes(id)) priorUses.push(id);
      }
    }
    return parameter(`drive|${period}|${leg.roadId}`, prior);
  }
  function waitParameter(period, station, at, remaining) {
    const kind = remaining ? 'remaining' : 'dwell', value = (phaseDwell.get(period) ?? 15) * (remaining ? 0.5 : 1);
    const baseName = `${kind}|${period}|${station}`, base = parameter(baseName, value);
    if (!config.time) return base;
    const clock = contextAt(at);
    return parameter(`${baseName}|${clock.dayType}|${clock.bucket}`, value, base);
  }
  function spanTerms(row) {
    return row.legs.flatMap((leg, index) => [[driveParameter(row.period, leg), 1],
      [waitParameter(row.period, leg.station, row.at, !index && row.originKind === 'boarding_remaining'), 1]]);
  }
  const trainingSignals = [];
  training.spans.forEach(row => {
    trainingSignals.push({...row, terms: spanTerms(row), category: 'observed_span'});
    row.legs.forEach(leg => supportedRoads.add(`${row.period}|${leg.roadId}`));
  });
  training.drives.forEach(row => trainingSignals.push({...row, terms: [[driveParameter(row.period, row.leg), 1]], category: 'driving'}));
  training.dwell.forEach(row => trainingSignals.push({...row,
    terms: [[waitParameter(row.period, row.station, row.at, false), 1]], category: 'dwell', lowerBound: row.censored}));
  const sizes = count(trainingSignals, row => row.sessionId);
  trainingSignals.forEach(row => equations.push({...row, weight: 1 / sizes[row.sessionId]}));
  const solved = solveComponents(equations, initial, config.delta || Infinity);
  // Test-only parameters receive a training-derived prior, never an observed test value.
  const valueAt = i => solved.values[i] ?? initial[i];
  return {predict(row) {
    const beforePrediction = equations.length;
    const terms = spanTerms(row);
    const seconds = terms.reduce((sum, [i, a]) => sum + a * valueAt(i), 0);
    const components = {driving: 0, boardingRemaining: 0, intermediateOrOriginDwell: 0};
    terms.forEach(([i, a]) => {
      const kind = variableNames[i].split('|')[0];
      components[kind === 'drive' ? 'driving' : kind === 'remaining' ? 'boardingRemaining' : 'intermediateOrOriginDwell'] += a * valueAt(i);
    });
    equations.length = beforePrediction;
    const missing = row.legs.filter(leg => !supportedRoads.has(`${row.period}|${leg.roadId}`)).length;
    return {seconds, supported: !missing, missingRoads: missing, components};
  }, training: {allRecords: training.reported.length, observedSpans: training.spans.length, driving: training.drives.length,
    dwell: training.dwell.length, censoredDwell: training.dwell.filter(row => row.censored).length,
    normalizedSessions: unique(trainingSignals.map(row => row.sessionId)).length, variables: solved.values.length,
    robustDeltaSeconds: config.delta || null, historicalDrivingPriors: priorUses.length,
    oldQualityFlagsFiltered: false, crossPeriodTotalsUsed: false, converged: solved.converged, sweeps: solved.sweeps,
    lastMaximumStepSeconds: solved.lastMaximumStepSeconds},
    parameters: Object.fromEntries(variableNames.slice(0, solved.values.length).map((name, i) => [name, solved.values[i]]))};
}

function evaluate(model, rows) {
  return rows.map(row => { const prediction = model.predict(row); return {uid: row.uid, sessionId: row.sessionId,
    date: row.date, routeId: row.routeId, fromStopId: row.fromStopId, toStopId: row.toStopId,
    actualSeconds: row.seconds, predictedSeconds: prediction.seconds, errorSeconds: prediction.seconds - row.seconds,
    supported: prediction.supported, missingRoads: prediction.missingRoads, components: prediction.components}; });
}

function bootstrapByDay(baseline, candidate) {
  const other = new Map(candidate.map(row => [row.uid, row]));
  const sessions = group(baseline.filter(row => other.has(row.uid)), row => row.sessionId);
  const dates = group([...sessions.values()].map(rows => ({date: rows[0].date,
    delta: average(rows.map(row => Math.abs(row.errorSeconds) - Math.abs(other.get(row.uid).errorSeconds)))})), row => row.date);
  const blocks = [...dates.values()];
  if (!blocks.length) return null;
  let seed = 1357911;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const samples = Array.from({length: 2000}, () => average(blocks.flatMap(() => blocks[Math.floor(random() * blocks.length)]).map(row => row.delta))).sort((a, b) => a - b);
  return {days: blocks.length, sessions: sessions.size, improvementSeconds: average(blocks.flat().map(row => row.delta)),
    ci95Seconds: [samples[50], samples[1949]], positiveMeans: 'Lower session-balanced absolute error than the same-period unrestricted baseline. Days, not GPS points, are resampled.'};
}

function main() {
  const [input, rawDirectory, output] = process.argv.slice(2);
  if (!input || !rawDirectory || !output) throw new Error('Usage: node scripts/rebuild_eta_analysis.mjs dataset.json raw-snapshot-directory new-private-output-directory');
  const source = fs.readFileSync(input, 'utf8'), dataset = JSON.parse(source), directory = path.resolve(output);
  if (directory === REPO || directory.startsWith(REPO + path.sep)) throw new Error('Do not write private GPS evidence into the public repository');
  fs.mkdirSync(directory, {mode: 0o700});
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  const load = name => JSON.parse(fs.readFileSync(path.join(rawDirectory, name), 'utf8'));
  const cores = load('ride_gps_sessions.json'), chunks = load('ride_gps_sample_chunks.json');
  const catalog = makeRoadCatalog(dataset), availability = availabilityIndex(dataset, cores, chunks);
  const evidence = buildEvidence(dataset, catalog, availability);
  const dates = unique(evidence.labels.filter(row => row.period === 'main_term' && row.date >= '2026-09-14').map(row => row.date)).sort();
  const protocol = {schema: 'cuhk_eta_rebuild_protocol_v2', createdAt: new Date().toISOString(), datasetSha256: hash(source),
    analysisSourceSha256: hash(fs.readFileSync(fileURLToPath(import.meta.url))),
    periods: PERIODS, candidates: CANDIDATES_V2, evaluationDates: dates, warmup: '2026-09-07 through 2026-09-13',
    recentReferenceStart: '2026-09-27', untouchedTestAvailable: false,
    selection: 'Expanding daily retrospective replay; candidate for each day is selected only from prior-day prediction errors. Latest reference set is already inspected, not an independent test.',
    baseline: 'All numerically usable reported intervals within their own calendar period, without existing quality-flag filtering.',
    target: 'Observed boarding time to a subsequent GPS stop-visit time; not exact door-open arrival or next unobserved scheduled-bus ETA.',
    availability: 'Entire session and all exported chunks must have been uploaded before the prediction day; unknown upload time uses session completion and is flagged.',
    grouping: 'Periods are not pooled. Same reviewed path geometry can share road statistics; origin/target direction is retained. History may inform only a declared driving prior, never full elapsed time or dwell.',
    pendingConfirmation: 'Freeze a candidate after exploration and collect new independent trips before any accuracy or deployment claim.',
    roadSnapshotSha256: hash(fs.readFileSync(path.join(REPO, 'data/cuhk_bus_routes.js'))),
    routeSchemeSha256: hash(fs.readFileSync(path.join(REPO, 'data/transport_route_schemes.js')))};
  save('protocol.json', protocol);
  save('all-period-evidence.json', {schema: 'cuhk_eta_period_evidence_v2', periods: PERIODS, sourceDataset: input,
    rawSummary: dataset.summary, reported: evidence.reported, observedSpans: evidence.spans, driving: evidence.drives,
    dwell: evidence.dwell, presence: evidence.presence, issues: evidence.issues,
    originalStopObservations: dataset.stopObservations, originalDwellObservations: dataset.dwellObservations,
    originalSpanConstraints: dataset.spanConstraints, originalRecordingClassifications: dataset.excludedSessions,
    recordings: [...evidence.recordings.values()], availability: Object.fromEntries(availability),
    unresolvedRowsRetainedInSource: true, privacy: 'Private GPS dataset. Never commit or deploy.'});
  save('latest-reference-set.json', {schema: 'cuhk_eta_recent_reference_v2', independentBlindTest: false,
    labels: evidence.labels.filter(row => row.period === 'main_term' && row.date >= protocol.recentReferenceStart),
    presence: evidence.presence.filter(row => row.period === 'main_term' && row.date >= protocol.recentReferenceStart),
    statement: 'Retained unchanged as a previously inspected reference. Never used as old-model ground truth.'});
  const history = new Map(CANDIDATES_V2.map(config => [config.id, []])), folds = [], rollingPredictions = [];
  const failedModels = new Set();
  for (const date of dates) {
    const fittedModels = new Map(CANDIDATES_V2.map(config => [config.id, fitV2(evidence, config, date)]));
    for (const [id, model] of fittedModels) if (model.training.converged === false) failedModels.add(id);
    const availableHistory = CANDIDATES_V2.map(config => ({id: config.id, score: metrics(history.get(config.id))}))
      .filter(row => row.score.sessions >= 5 && !failedModels.has(row.id)).sort((a, b) => a.score.sessionBalancedMaeSeconds - b.score.sessionBalancedMaeSeconds);
    const chosenId = availableHistory[0]?.id || 'period_all_mean';
    const labels = evidence.labels.filter(row => row.date === date && row.period === 'main_term');
    const decision = {date, chosenId, basedOnEarlierDatesOnly: true, priorScores: availableHistory};
    save(`decision-${date}.json`, decision);
    const results = CANDIDATES_V2.map(config => {
      const model = fittedModels.get(config.id), predictions = evaluate(model, labels);
      history.get(config.id).push(...predictions);
      if (config.id === chosenId) rollingPredictions.push(...predictions);
      return {id: config.id, metrics: metrics(predictions), training: model.training};
    });
    folds.push({...decision, labels: labels.length, results});
    console.log(`Replay ${date}: ${labels.length} observed intervals; prior-day policy ${chosenId}`);
  }
  const baseline = history.get('period_all_mean');
  const results = CANDIDATES_V2.map(config => ({...config, metrics: metrics(history.get(config.id)),
    recentReference: metrics(history.get(config.id).filter(row => row.date >= protocol.recentReferenceStart)),
    optimizationConverged: !failedModels.has(config.id),
    vsSamePeriodBaseline: bootstrapByDay(baseline, history.get(config.id))}));
  const ranked = results.filter(row => row.metrics.samples && row.optimizationConverged).slice().sort((a, b) => a.metrics.sessionBalancedMaeSeconds - b.metrics.sessionBalancedMaeSeconds);
  const provisional = ranked[0];
  if (!provisional) throw new Error('No observed main-term labels for replay');
  const before = '2026-10-26', model = fitV2(evidence, CANDIDATES_V2.find(config => config.id === provisional.id), before);
  const inventory = PERIODS.map(period => ({...period,
    reported: evidence.reported.filter(row => row.period === period.id).length,
    spans: evidence.spans.filter(row => row.period === period.id).length,
    driving: evidence.drives.filter(row => row.period === period.id).length,
    dwell: evidence.dwell.filter(row => row.period === period.id).length,
    presence: evidence.presence.filter(row => row.period === period.id).length}));
  const candidatePredictions = history.get(provisional.id);
  const candidateById = new Map(candidatePredictions.map(row => [row.uid, row]));
  const pairedSupport = ['both_supported', 'baseline_only_supported', 'neither_supported'].map(kind => {
    const rows = baseline.filter(row => kind === 'both_supported' ? row.supported && candidateById.get(row.uid).supported
      : kind === 'baseline_only_supported' ? row.supported && !candidateById.get(row.uid).supported
      : !row.supported && !candidateById.get(row.uid).supported);
    return {kind, baseline: metrics(rows), provisional: metrics(rows.map(row => candidateById.get(row.uid)))};
  });
  const unannotated = dataset.sessions.filter(row => !row.hasOriginalCalibration);
  const report = {schema: 'cuhk_eta_rebuild_report_v2', generatedAt: new Date().toISOString(), inventory,
    evaluatedDates: dates, observationSources: {reported: evidence.reported.length, spans: evidence.spans.length,
      driving: evidence.drives.length, dwell: evidence.dwell.length, censoredDwell: evidence.dwell.filter(row => row.censored).length,
      presence: evidence.presence.length, unmappedReported: evidence.reported.filter(row => !row.leg).length,
      sessionsWithUploadTimes: [...availability.values()].filter(row => row.recordedUpload).length,
      sessionsWithoutVerifiedUploadTime: [...availability.values()].filter(row => !row.recordedUpload).length},
    results, retrospectiveProvisionalCandidate: provisional.id, independentAccuracyConfirmed: false, productionChanged: false,
    pairedSupport,
    unresolvedGpsAnnotation: {recordings: unannotated.length, gpsPoints: unannotated.reduce((sum, row) => sum + row.gpsSamples.length, 0),
      overTwoMinutes: unannotated.filter(row => row.durationSeconds >= 120).map(row => ({sessionId: row.sessionId, routeId: row.routeId,
        startedAt: row.startedAt, seconds: row.durationSeconds, points: row.gpsSamples.length, trackMeters: row.trackDistanceMeters})),
      meaning: 'Retained raw GPS without original stop annotations. Not declared invalid, and not silently treated as stop-to-stop labels.'},
    rollingPolicy: {metrics: metrics(rollingPredictions), vsBaseline: bootstrapByDay(baseline, rollingPredictions)},
    perRoute: unique(candidatePredictions.map(row => row.routeId)).sort().map(routeId => ({routeId,
      baseline: metrics(baseline.filter(row => row.routeId === routeId)),
      candidate: metrics(candidatePredictions.filter(row => row.routeId === routeId))})),
    limitations: ['All experiments are retrospective/exploratory because existing latest data were already inspected.',
      'Calendar phase is not measured passenger load. Public holidays and special events can differ inside a weekday bucket.',
      'Stop detections, GPS drift and partial visits create noisy labels. Unknown or contradictory observations remain archived, not silently erased.',
      'Historical road revisions within a route scheme cannot all be reconstructed; geometry identities describe the current reviewed catalog snapshot.',
      'Presence records do not identify departures or loads, so they are retained as timestamp constraints rather than fabricated adjacent runtimes.',
      'Boarding remaining dwell is a distinct learned parameter; absent evidence its declared prior is half the same-period observed dwell median.',
      'Lack of same-period evidence still requires an explicitly reported distance/parameter prior; a fitted prediction is not necessarily supported by direct observation.']};
  save('report.json', report);
  save('daily-predictions.json', {byCandidate: Object.fromEntries(history), rollingPolicy: rollingPredictions, folds});
  save('candidate-offline.json', {schema: 'cuhk_eta_offline_v2', deployable: false, independentAccuracyConfirmed: false,
    trainedBefore: before, config: CANDIDATES_V2.find(config => config.id === provisional.id), training: model.training,
    parameters: model.parameters, warning: 'Exploratory research artifact, not the mini-program runtime format.'});
  const num = value => finite(value) ? value.toFixed(1) : '-';
  save('summary.txt', ['CUHK 到站预测重做，按时期建模，2026-10-25', '',
    '一、纠正原则',
    '暑期与开学期是不同运行条件，不是旧数据与好数据的区别。所有数据保留，各时期分别统计；不把暑期总耗时直接平均进开学期。',
    '路线版本、道路形状和上下行单独处理。上车时刻是预测锚点，不是假设车辆刚从总站出发。',
    '上车后的剩余停站、途中行驶、途经站停站分开；不把目标站到站后的停留计入到站时间。',
    '广播全部保留为在站时间记录，不硬配时刻表班次、不当作精确开门或离站时间。', '',
    '二、全量资料',
    '时期 | 原计时记录 | 实测区间 | 行驶记录 | 停站记录 | 在站记录',
    ...inventory.map(row => [row.label, row.reported, row.spans, row.driving, row.dwell, row.presence].join(' | ')),
    `另有${report.observationSources.unmappedReported}条原计时暂无法唯一匹配道路，仍保留；${report.observationSources.censoredDwell}条截断停站按下界约束，而非完整停站时长。`, '',
    '三、历史按日回放，不是新盲测',
    '9月7日至13日作为开学初始积累；9月14日起逐日预测。当日训练只能看到此前已完整上传的行程及分块。',
    '每天的自动选型只使用之前日期的误差，先保存选择再计算当日预测。整体排行只能作探索候选，不能宣称独立验证更准。',
    '各方案相同评估目标：从已知上车时刻到后续GPS停站识别时刻，不以旧模型预测为标准。',
    '方案 | 区间数 | 行程数 | 平均误差秒 | 行程均衡误差秒 | 一分钟内% | 90分位误差秒',
    ...results.map(row => [row.label, row.metrics.samples, row.metrics.sessions, num(row.metrics.maeSeconds),
      num(row.metrics.sessionBalancedMaeSeconds), num(row.metrics.within60SecondsPercent), num(row.metrics.p90AbsoluteErrorSeconds)].join(' | ')),
    `按过去误差逐日选择的策略：平均误差${num(report.rollingPolicy.metrics.maeSeconds)}秒，行程均衡误差${num(report.rollingPolicy.metrics.sessionBalancedMaeSeconds)}秒。`,
    `全程回放暂选候选：${provisional.label}；与同期全量基线的按日bootstrap改善区间[${provisional.vsSamePeriodBaseline.ci95Seconds.map(num).join(', ')}]秒。`, '',
    '四、实测支持与回退必须分开看',
    '范围 | 区间数 | 同期全量均值误差秒 | 暂选候选误差秒',
    ...pairedSupport.map(row => [row.kind, row.baseline.samples, num(row.baseline.maeSeconds), num(row.provisional.maeSeconds)].join(' | ')),
    '整体误差下降的一部分来自插值标签被移除后的路程回退；不能把这种改善说成已学准开学停站时间。',
    `另有${unannotated.length}条无原始站点标注的GPS轨迹已完整保留，其中${report.unresolvedGpsAnnotation.overTwoMinutes.length}条超过2分钟；需要重新核对站点经过，不能直接判成无效或假定每站时间。`, '',
    '五、结论边界',
    '不根据以上数据宣布暑期与开学期没有差异，也不把误差当作客流标签。',
    '不删除短GPS或异常标记记录。无法提供区间计时的记录保留为在站证据或待核对资料。',
    '冻结候选后还需要新的开学期行程来检验。旧的已检查参考集不能重新变成独立测试集。',
    '未修改云数据库、网页或小程序线上模型；离线候选不能直接部署。', '',
    '文件：all-period-evidence.json 为全量分期资料；latest-reference-set.json 为最新已检查参考集；daily-predictions.json 为逐日逐条预测；report.json 为完整指标。', ''
  ].join('\n'));
  console.log(JSON.stringify({directory, provisional: provisional.id, results: results.map(row => ({id: row.id, metrics: row.metrics})), rollingPolicy: report.rollingPolicy}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
