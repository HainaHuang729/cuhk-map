import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const DAY = 86400000;
const HK = 8 * 3600000;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const round = value => finite(value) ? Math.round(value * 100) / 100 : null;
const key = (from, to) => `${from}->${to}`;
const timestamp = row => Date.parse(row.fromTimestamp || row.timestamp || row.observedAt || '');
export const localDate = value => Number.isFinite(Date.parse(value)) ? new Date(Date.parse(value) + HK).toISOString().slice(0, 10) : '';
const dateOf = row => localDate(row.fromTimestamp || row.timestamp || row.observedAt);
const dayStart = date => Date.parse(`${date}T00:00:00+08:00`);
const unique = values => [...new Set(values)];
const countBy = (rows, getKey) => rows.reduce((result, row) => {
  const value = getKey(row) || 'unknown'; result[value] = (result[value] || 0) + 1; return result;
}, {});

export function weightedMean(rows) {
  const weight = rows.reduce((sum, row) => sum + row.weight, 0);
  return weight ? rows.reduce((sum, row) => sum + row.value * row.weight, 0) / weight : null;
}

export function weightedMedian(rows) {
  const sorted = rows.filter(row => finite(row.value) && row.weight > 0).sort((a, b) => a.value - b.value);
  const middle = sorted.reduce((sum, row) => sum + row.weight, 0) / 2;
  let total = 0;
  for (let index = 0; index < sorted.length; index++) {
    const row = sorted[index];
    total += row.weight;
    if (total === middle && sorted[index + 1]) return (row.value + sorted[index + 1].value) / 2;
    if (total >= middle) return row.value;
  }
  return null;
}

function profile(at) {
  const date = new Date(at + HK), minute = date.getUTCHours() * 60 + date.getUTCMinutes();
  const day = date.getUTCDay(), type = day === 0 ? 'sunday' : day === 6 ? 'saturday' : 'weekday';
  const bucket = minute < 360 ? 'overnight' : minute < 450 ? 'early_morning' : minute < 570 ? 'morning_peak'
    : minute < 690 ? 'morning' : minute < 840 ? 'lunch' : minute < 990 ? 'afternoon' : minute < 1170 ? 'evening_peak' : 'night';
  return `${type}_${bucket}`;
}

function distance(a, b) {
  if (!a || !b) return null;
  const rad = Math.PI / 180, lat = (b[1] - a[1]) * rad, lon = (b[0] - a[0]) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(lon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function prepareEvidence(dataset) {
  const definitions = new Map();
  for (const [scheme, routes] of Object.entries(dataset.routeDefinitions)) {
    const label = scheme === 'current' ? '2026-09' : 'legacy';
    for (const route of routes) definitions.set(`${label}:${route.id}`, route);
  }
  const segments = dataset.segmentObservations.filter(row => finite(row.minutes) && row.minutes > 0 && dateOf(row) && row.fromStopId && row.toStopId)
    .map((row, index) => ({...row, uid: `segment:${index}`, date: dateOf(row), at: timestamp(row), value: row.minutes,
      pair: key(row.fromStopId, row.toStopId), path: [key(row.fromStopId, row.toStopId)]}));
  const presence = dataset.boardConstraints.filter(row => dateOf(row) && row.routeId && row.stopId)
    .map((row, index) => ({...row, uid: `presence:${index}`, date: dateOf(row), at: timestamp(row)}));
  const dwell = dataset.dwellObservations.filter(row => finite(row.seconds) && row.seconds >= 0 && dateOf(row))
    .map(row => ({...row, date: dateOf(row), at: timestamp(row), value: row.seconds / 60}));
  const grouped = new Map();
  dataset.stopObservations.forEach(row => {
    if (!grouped.has(row.sessionId)) grouped.set(row.sessionId, []);
    grouped.get(row.sessionId).push(row);
  });
  const spans = [];
  for (const [sessionId, visits] of grouped) {
    const trusted = visits.filter(row => row.eligibleForArrivalTraining && dateOf(row))
      .sort((a, b) => a.stopIndex - b.stopIndex || timestamp(a) - timestamp(b));
    const anchor = trusted[0];
    if (!anchor) continue;
    const route = definitions.get(`${anchor.routeScheme}:${anchor.routeId}`);
    if (!route || route.stops[anchor.stopIndex] !== anchor.stopId) continue;
    for (const target of trusted.slice(1)) {
      const elapsed = (timestamp(target) - timestamp(anchor)) / 60000;
      if (!(target.stopIndex > anchor.stopIndex && elapsed > 0) || route.stops[target.stopIndex] !== target.stopId) continue;
      const stops = route.stops.slice(anchor.stopIndex, target.stopIndex + 1);
      spans.push({uid: `span:${sessionId}:${anchor.stopIndex}:${target.stopIndex}`, sessionId, routeId: anchor.routeId,
        routeScheme: anchor.routeScheme, fromStopId: anchor.stopId, toStopId: target.stopId,
        fromStopIndex: anchor.stopIndex, toStopIndex: target.stopIndex, fromTimestamp: anchor.observedAt,
        toTimestamp: target.observedAt, date: dateOf(anchor), at: timestamp(anchor), value: elapsed,
        fromSource: anchor.source, toSource: target.source,
        path: stops.slice(1).map((stop, index) => key(stops[index], stop)),
        labelMeaning: 'GPS stop-proximity timestamps; elapsed from first observed stop includes dwell, not an exact door-open arrival'});
    }
  }
  return {segments, presence, dwell, spans, definitions, stops: dataset.stops,
    structuralExclusions: {segments: dataset.segmentObservations.length - segments.length,
      presence: dataset.boardConstraints.length - presence.length, dwell: dataset.dwellObservations.length - dwell.length}};
}

export function chooseSplit(evidence) {
  const dates = unique(evidence.segments.filter(row => row.routeScheme === '2026-09' && row.eligibleForSegmentTraining).map(row => row.date)).sort();
  if (dates.length < 12) throw new Error('Too few independent measurement dates for chronological tuning and a final holdout');
  const testDateCount = Math.max(5, Math.ceil(dates.length * 0.2));
  const cutoff = dates[dates.length - testDateCount];
  const earlier = dates.filter(date => date < cutoff);
  const validationDates = earlier.slice(-9);
  const folds = [];
  for (let index = 0; index < validationDates.length; index += 3) {
    folds.push({start: validationDates[index], end: validationDates[index + 3] || cutoff});
  }
  const sessionDates = new Map();
  for (const rows of [evidence.segments, evidence.presence, evidence.dwell, evidence.spans]) {
    for (const row of rows) {
      if (!row.sessionId) continue;
      if (!sessionDates.has(row.sessionId)) sessionDates.set(row.sessionId, new Set());
      for (const value of [row.date, localDate(row.toTimestamp)]) {
        if (value) sessionDates.get(row.sessionId).add(value);
      }
    }
  }
  return {cutoff, finalMeasurementDates: dates.filter(date => date >= cutoff), validationFolds: folds,
    sessionDates, rule: 'Latest 20% of current-scheme trusted GPS measurement dates, minimum five dates. All evidence on/after cutoff is held out; whole sessions cannot cross partitions.'};
}

export function trainingRows(rows, before, sessionDates) {
  return rows.filter(row => row.date < before && (!row.sessionId || [...(sessionDates.get(row.sessionId) || [])].every(date => date < before)));
}

const CANDIDATES = [
  {id: 'all_mean_presence', label: '全量均值＋全部上车约束', estimate: 'mean', presence: 'all'},
  {id: 'all_mean', label: '全量均值（不做广播校正）', estimate: 'mean'},
  {id: 'all_median', label: '全量中位数', estimate: 'median'},
  {id: 'no_interpolation', label: '仅排除插值分摊', estimate: 'mean', noInterpolation: true},
  {id: 'quality_mean', label: '排除已标记的不可靠计时', estimate: 'mean', quality: true},
  {id: 'quality_median', label: '可靠计时＋中位数', estimate: 'median', quality: true},
  {id: 'quality_recent_weight', label: '可靠计时＋近期加权', estimate: 'median', quality: true, halfLife: 30},
  {id: 'quality_recent_only', label: '仅保留近45天可靠计时', estimate: 'median', quality: true, recentDays: 45},
  {id: 'current_scheme_only', label: '仅使用9月新站序数据', estimate: 'median', quality: true, currentOnly: true},
  {id: 'time_pooling', label: '可靠计时＋时段收缩', estimate: 'median', quality: true, timeShrink: 6},
  {id: 'route_pooling', label: '可靠计时＋线路收缩', estimate: 'median', quality: true, routeShrink: 4},
  {id: 'driving_and_dwell', label: '分离行驶与停站时间', estimate: 'median', quality: true, separateDwell: true},
  {id: 'observed_spans', label: '可靠计时＋实测跨站区间约束', estimate: 'median', quality: true, spanShrink: 6},
  {id: 'quality_presence', label: '可靠计时＋保守上车约束', estimate: 'median', quality: true, presence: 'quality'},
];

function schedules() {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(repo, 'data/campus_updates.js'), 'utf8'), context);
  const source = fs.readFileSync(path.join(repo, 'data/cuhk_bus_routes.js'), 'utf8')
    .replace('root.CUHK_BUS_UTILS = {', 'root.CUHK_BUS_UTILS = { todayRules, departuresForRule,');
  vm.runInContext(source, context);
  const legacy = JSON.parse(JSON.stringify(context.CUHK_BUS_DATA.routes));
  vm.runInContext(fs.readFileSync(path.join(repo, 'data/transport_route_schemes.js'), 'utf8'), context);
  context.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(context.CUHK_BUS_DATA, '2026-09');
  const routes = new Map();
  legacy.forEach(route => routes.set(`legacy:${route.id}`, route));
  context.CUHK_BUS_DATA.routes.forEach(route => routes.set(`2026-09:${route.id}`, route));
  const miniPath = '/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
  const calendarContext = vm.createContext({require: createRequire(miniPath), Page: () => {}, wx: {getStorageSync: () => null}, setTimeout, clearTimeout, setInterval, clearInterval});
  vm.runInContext(fs.readFileSync(miniPath, 'utf8'), calendarContext);
  const ruleApplies = vm.runInContext('routeScheduleRuleAppliesToday', calendarContext);
  const cache = new Map();
  return function lookup(row) {
    const cacheKey = `${row.routeScheme}:${row.routeId}:${row.date}`;
    const route = routes.get(`${row.routeScheme}:${row.routeId}`);
    if (!cache.has(cacheKey)) {
      const result = [];
      if (route) {
        for (const offset of [-1, 0]) {
          const midnight = dayStart(row.date) + offset * DAY;
          const date = new Date(midnight + 12 * 3600000);
          const clock = context.CUHK_BUS_UTILS.hongKongClock(date);
          const rules = context.CUHK_CAMPUS_UPDATES.suspensionForRoute(route.id, clock.dateString) ? []
            : route.schedule.rules.filter(rule => ruleApplies(route, rule, clock));
          const departures = unique(rules.flatMap(rule => context.CUHK_BUS_UTILS.departuresForRule(rule)));
          for (const departure of departures) {
            const at = midnight + departure * 60000;
            result.push(at);
          }
        }
      }
      cache.set(cacheKey, result);
    }
    return {route, departures: cache.get(cacheKey).filter(at => row.at >= at - 60000 && row.at <= at + ((route.schedule?.estimatedTripMinutes || 30) + 30) * 60000)};
  };
}

function addGroup(map, group, row) {
  if (!map.has(group)) map.set(group, []);
  map.get(group).push(row);
}

export function fitModel(evidence, config, before, sessionDates, scheduleLookup) {
  const all = trainingRows(evidence.segments, before, sessionDates);
  const selected = all.filter(row => (!config.quality || row.eligibleForSegmentTraining)
    && (!config.noInterpolation || !row.flags.includes('interpolated_not_measured'))
    && (!config.currentOnly || row.routeScheme === '2026-09')
    && (!config.recentDays || row.at >= dayStart(before) - config.recentDays * DAY));
  const pairs = new Map(), times = new Map(), routes = new Map(), drives = new Map(), dwells = new Map();
  const trainingDwell = trainingRows(evidence.dwell, before, sessionDates).filter(row => !config.quality || row.eligibleForDwellTraining && !row.censoredAtRideEnd);
  const weight = row => config.halfLife ? Math.max(0.01, 0.5 ** ((dayStart(before) - row.at) / DAY / config.halfLife)) : 1;
  const estimate = rows => (config.estimate === 'mean' ? weightedMean : weightedMedian)(rows || []);
  const rates = all.map(row => ({value: row.value / Math.max(40, distance(evidence.stops[row.fromStopId]?.coord, evidence.stops[row.toStopId]?.coord) || 40), weight: 1}));
  const minutesPerMeter = weightedMedian(rates) || 1 / 250;
  const fallback = pair => {
    const [from, to] = pair.split('->');
    return Math.max(0.1, (distance(evidence.stops[from]?.coord, evidence.stops[to]?.coord) || 200) * minutesPerMeter);
  };
  for (const row of selected) {
    const observation = {...row, weight: weight(row)};
    addGroup(pairs, row.pair, observation);
    addGroup(times, `${row.pair}:${profile(row.at)}`, observation);
    addGroup(routes, `${row.pair}:${row.routeScheme}:${row.routeId}`, observation);
    if (row.eligibleForDrivingTraining && row.drivingSeconds > 0) addGroup(drives, row.pair, {...observation, value: row.drivingSeconds / 60});
  }
  trainingDwell.forEach(row => addGroup(dwells, row.stopId, {...row, weight: weight(row)}));
  const globalDwell = weightedMedian(trainingDwell.map(row => ({value: row.value, weight: 1}))) ?? 0.25;
  const dwellAt = stop => estimate(dwells.get(stop)) ?? globalDwell;
  function predictLeg(pair, row, at) {
    const baseRows = pairs.get(pair) || [];
    let result = estimate(baseRows) ?? fallback(pair);
    const group = config.timeShrink ? times.get(`${pair}:${profile(at)}`) : config.routeShrink ? routes.get(`${pair}:${row.routeScheme}:${row.routeId}`) : null;
    if (group?.length) {
      const shrink = config.timeShrink || config.routeShrink;
      result = (estimate(group) * group.length + result * shrink) / (group.length + shrink);
    }
    if (config.separateDwell && (drives.get(pair)?.length || 0) >= 2) result = estimate(drives.get(pair)) + dwellAt(pair.split('->')[0]);
    return {minutes: Math.max(0.02, result), supported: baseRows.length > 0};
  }
  const spanAdjustments = new Map(), phaseAdjustments = new Map();
  function predict(row, corrections = true) {
    let value = 0, supported = true;
    row.path.forEach(pair => {
      const leg = predictLeg(pair, row, row.at + value * 60000);
      value += leg.minutes; supported &&= leg.supported;
    });
    if (corrections && config.spanShrink) value *= spanAdjustments.get(`${row.routeScheme}:${row.routeId}`) ?? 1;
    if (corrections && config.presence) value += (phaseAdjustments.get(`${row.routeScheme}:${row.routeId}:${row.toStopId}`) || 0)
      - (phaseAdjustments.get(`${row.routeScheme}:${row.routeId}:${row.fromStopId}`) || 0);
    return {minutes: Math.max(0.02, value), supported};
  }
  if (config.spanShrink) {
    const grouped = new Map();
    for (const row of trainingRows(evidence.spans, before, sessionDates)) {
      addGroup(grouped, `${row.routeScheme}:${row.routeId}`, {value: row.value / predict(row, false).minutes, weight: 1});
    }
    for (const [group, rows] of grouped) {
      const ratio = Math.max(0.5, Math.min(2, weightedMedian(rows)));
      spanAdjustments.set(group, (ratio * rows.length + config.spanShrink) / (rows.length + config.spanShrink));
    }
  }
  let phaseCandidates = 0, phaseMatched = 0;
  if (config.presence && scheduleLookup) {
    const grouped = new Map();
    for (const row of trainingRows(evidence.presence, before, sessionDates)) {
      if (config.presence === 'quality' && !row.eligibleForTimeConstraint) continue;
      phaseCandidates++;
      const association = associatePresence(row, predict, evidence.definitions, scheduleLookup, 60);
      if (!association) continue;
      const conservative = config.presence === 'quality';
      if (conservative && (Math.abs(association.signedResidualMinutes) > 10 || association.assignmentMarginMinutes < 2)) continue;
      addGroup(grouped, `${row.routeScheme}:${row.routeId}:${row.stopId}`, {value: association.signedResidualMinutes,
        weight: 1, date: row.date, sessionId: row.sessionId || row.constraintId || row.uid});
      phaseMatched++;
    }
    for (const [group, rows] of grouped) {
      if (config.presence === 'quality') {
        if (rows.length < 3 || unique(rows.map(row => row.date)).length < 2) continue;
        phaseAdjustments.set(group, Math.max(-3, Math.min(3, weightedMedian(rows))) * rows.length / (rows.length + 8));
      } else phaseAdjustments.set(group, weightedMean(rows));
    }
  }
  return {config, predict, training: {allNumericallyUsableSegments: all.length, fittedSegments: selected.length,
    fittedSegmentSessions: unique(selected.map(row => row.sessionId)).length, directedPairs: pairs.size,
    availableDwellRecords: trainingDwell.length, phaseCandidates, phaseMatched, phaseGroups: phaseAdjustments.size},
    parameters: {pairs: Object.fromEntries([...pairs].map(([pair, rows]) => [pair, {minutes: estimate(rows), samples: rows.length}])),
      spanAdjustments: Object.fromEntries(spanAdjustments), phaseAdjustments: Object.fromEntries(phaseAdjustments),
      fallbackMinutesPerMeter: minutesPerMeter, defaultDwellMinutes: globalDwell}};
}

function pathToStop(row, definitions) {
  const route = definitions.get(`${row.routeScheme}:${row.routeId}`);
  if (!route) return null;
  let index = row.stopIndex;
  if (!Number.isInteger(index) || route.stops[index] !== row.stopId) {
    const indexes = route.stops.flatMap((stop, i) => stop === row.stopId ? [i] : []);
    if (indexes.length !== 1) return null;
    index = indexes[0];
  }
  const stops = route.stops.slice(0, index + 1);
  return {route, path: stops.slice(1).map((stop, i) => key(stops[i], stop)), fromStopId: stops[0], toStopId: row.stopId};
}

function associatePresence(row, predict, definitions, lookup, windowSeconds) {
  const routePath = pathToStop(row, definitions);
  // Boarding at an origin does not establish the bus's departure or arrival there.
  if (!routePath || !routePath.path.length) return null;
  const {departures} = lookup(row);
  const candidates = departures.map(departure => {
    const prediction = predict({...row, ...routePath, at: departure});
    const arrival = departure + prediction.minutes * 60000;
    const lower = row.at - windowSeconds * 1000;
    const signedResidualMinutes = arrival < lower ? (lower - arrival) / 60000 : arrival > row.at ? (row.at - arrival) / 60000 : 0;
    return {arrival, errorMinutes: Math.abs(signedResidualMinutes), signedResidualMinutes};
  }).sort((a, b) => a.errorMinutes - b.errorMinutes);
  if (!candidates.length) return null;
  return {...candidates[0], assignmentMarginMinutes: candidates[1] ? candidates[1].errorMinutes - candidates[0].errorMinutes : Infinity};
}

export function metrics(predictions) {
  if (!predictions.length) return {samples: 0, sessions: 0, maeSeconds: null, sessionBalancedMaeSeconds: null};
  const groups = new Map();
  predictions.forEach(row => addGroup(groups, row.sessionId || row.uid, Math.abs(row.errorSeconds)));
  const errors = predictions.map(row => Math.abs(row.errorSeconds)).sort((a, b) => a - b);
  return {samples: predictions.length, sessions: groups.size, maeSeconds: round(mean(errors)),
    sessionBalancedMaeSeconds: round(mean([...groups.values()].map(mean))),
    medianAbsoluteErrorSeconds: round(errors[Math.floor(errors.length * 0.5)]),
    p90AbsoluteErrorSeconds: round(errors[Math.min(errors.length - 1, Math.floor(errors.length * 0.9))]),
    biasSeconds: round(mean(predictions.map(row => row.errorSeconds))),
    within60SecondsPercent: round(errors.filter(value => value <= 60).length / errors.length * 100),
    supportedPercent: round(predictions.filter(row => row.supported).length / predictions.length * 100)};
}

function evaluate(model, rows) {
  const predictions = rows.map(row => {
    const result = model.predict(row);
    return {uid: row.uid, sessionId: row.sessionId, routeId: row.routeId, date: row.date,
      fromStopId: row.fromStopId, toStopId: row.toStopId, actualSeconds: row.value * 60,
      predictedSeconds: result.minutes * 60, errorSeconds: (result.minutes - row.value) * 60, supported: result.supported};
  });
  return {metrics: metrics(predictions), predictions};
}

function groupedBootstrap(baseline, candidate) {
  const rows = new Map(candidate.map(row => [row.uid, row]));
  const groups = new Map();
  baseline.forEach(row => {
    const other = rows.get(row.uid);
    if (other) addGroup(groups, row.sessionId || row.uid, Math.abs(row.errorSeconds) - Math.abs(other.errorSeconds));
  });
  const deltas = [...groups.values()].map(mean);
  if (!deltas.length) return null;
  let seed = 47291;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const bootstrap = Array.from({length: 2000}, () => mean(deltas.map(() => deltas[Math.floor(random() * deltas.length)]))).sort((a, b) => a - b);
  return {sessions: deltas.length, improvementSeconds: round(mean(deltas)), ci95Seconds: [round(bootstrap[50]), round(bootstrap[1949])],
    interpretation: 'Positive means less absolute error than the all-data baseline. Resampling unit is a whole GPS session, not individual points.'};
}

function main() {
  const input = process.argv[2], output = process.argv[3];
  if (!input || !output) throw new Error('Usage: node scripts/experiment_eta_models.mjs dataset.json <new private output directory>');
  const source = fs.readFileSync(input, 'utf8'), dataset = JSON.parse(source);
  const out = path.resolve(output), repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (out === repo || out.startsWith(repo + path.sep)) throw new Error('Do not store private observations in the public repository');
  fs.mkdirSync(out, {mode: 0o700});
  const save = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n', {mode: 0o600});
  const evidence = prepareEvidence(dataset), split = chooseSplit(evidence), lookup = schedules();
  const testSegments = evidence.segments.filter(row => row.date >= split.cutoff && row.eligibleForSegmentTraining);
  const testSpans = evidence.spans.filter(row => row.date >= split.cutoff);
  const testPresence = evidence.presence.filter(row => row.date >= split.cutoff && row.eligibleForTimeConstraint);
  const testSessionIds = unique([...testSegments, ...testSpans, ...testPresence].map(row => row.sessionId).filter(Boolean));
  const finalTraining = trainingRows(evidence.segments, split.cutoff, split.sessionDates);
  if (finalTraining.some(row => testSessionIds.includes(row.sessionId))) throw new Error('Session leakage across final holdout');
  save('split-manifest.json', {schema: 'cuhk_eta_experiment_split_v1', createdAt: new Date().toISOString(),
    datasetSha256: crypto.createHash('sha256').update(source).digest('hex'), cutoff: split.cutoff, rule: split.rule,
    validationFolds: split.validationFolds, finalMeasurementDates: split.finalMeasurementDates,
    validationObjective: 'GPS-anchored arrival elapsed-time MAE, balanced by whole session. Final test is never used for model selection.',
    candidates: CANDIDATES, testSessionIds, testSegmentIds: testSegments.map(row => row.uid), testSpanIds: testSpans.map(row => row.uid), testPresenceIds: testPresence.map(row => row.uid)});
  const validation = CANDIDATES.map(config => {
    const spans = [], segments = [];
    const folds = split.validationFolds.map(fold => {
      const model = fitModel(evidence, config, fold.start, split.sessionDates, lookup);
      const eligible = row => row.date >= fold.start && row.date < fold.end && (!row.sessionId || [...(split.sessionDates.get(row.sessionId) || [])].every(date => date >= fold.start));
      const arrival = evaluate(model, evidence.spans.filter(eligible));
      const adjacent = evaluate(model, evidence.segments.filter(row => row.eligibleForSegmentTraining && eligible(row)));
      spans.push(...arrival.predictions); segments.push(...adjacent.predictions);
      return {...fold, arrival: arrival.metrics, segment: adjacent.metrics, training: model.training};
    });
    return {id: config.id, label: config.label, arrival: metrics(spans), segment: metrics(segments), folds};
  });
  const ranked = validation.filter(row => row.arrival.samples).slice().sort((a, b) => a.arrival.sessionBalancedMaeSeconds - b.arrival.sessionBalancedMaeSeconds);
  if (!ranked.length) throw new Error('No validation arrival labels');
  const chosenId = ranked[0].id;
  // Persist selection before looking at any final-test predictions.
  save('validation-selection.json', {chosenId, selectionUsedFinalTest: false, results: validation});
  console.log(`Validation selected ${chosenId}; final holdout begins ${split.cutoff}`);
  const final = CANDIDATES.map(config => {
    const model = fitModel(evidence, config, split.cutoff, split.sessionDates, lookup);
    return {id: config.id, label: config.label, model, arrival: evaluate(model, testSpans), segment: evaluate(model, testSegments)};
  });
  const baseline = final.find(row => row.id === 'all_mean_presence'), chosen = final.find(row => row.id === chosenId);
  const plainBaseline = final.find(row => row.id === 'all_mean');
  const presence = final.filter(row => row.id === baseline.id || row.id === chosen.id).map(row => ({id: row.id,
    diagnostics: [30, 60, 120].map(windowSeconds => {
      const associations = testPresence.map(item => associatePresence(item, row.model.predict, evidence.definitions, lookup, windowSeconds));
      const known = associations.filter(Boolean);
      return {windowSeconds, eligibleObservations: testPresence.length, observationsInNominalServiceWindow: known.length,
        noScheduleAssociation: associations.length - known.length, meanIntervalDistanceSeconds: round(mean(known.map(item => item.errorMinutes * 60))),
        consistentPercent: known.length ? round(known.filter(item => item.errorMinutes === 0).length / known.length * 100) : null};
    })}));
  const perRoute = unique(testSpans.map(row => row.routeId)).sort().map(routeId => ({routeId,
    baseline: metrics(baseline.arrival.predictions.filter(row => row.routeId === routeId)),
    selected: metrics(chosen.arrival.predictions.filter(row => row.routeId === routeId))}));
  const report = {schema: 'cuhk_eta_offline_experiment_v1', generatedAt: new Date().toISOString(),
    dataset: path.basename(input), datasetSummary: dataset.summary,
    evidence: {structuralExclusions: evidence.structuralExclusions, numericalSegmentLabels: evidence.segments.length,
      presenceRecordsLoaded: evidence.presence.length, dwellRecordsLoaded: evidence.dwell.length, trustedGpsSpans: evidence.spans.length,
      arrivalAnchorSources: countBy(testSpans, row => row.fromSource), arrivalTargetSources: countBy(testSpans, row => row.toSource)},
    split: {cutoff: split.cutoff, rule: split.rule, validationFolds: split.validationFolds, finalMeasurementDates: split.finalMeasurementDates,
      testSegmentSamples: testSegments.length, testSegmentSessions: unique(testSegments.map(row => row.sessionId)).length,
      testArrivalSamples: testSpans.length, testArrivalSessions: unique(testSpans.map(row => row.sessionId)).length,
      testPresenceSamples: testPresence.length},
    selection: {chosenId, selectedOn: 'rolling chronological validation only', productionModelChanged: false},
    validation, finalTest: final.map(row => ({id: row.id, label: row.label, training: row.model.training, arrival: row.arrival.metrics, segment: row.segment.metrics})),
    pairedSessionBootstrap: groupedBootstrap(baseline.arrival.predictions, chosen.arrival.predictions),
    plainMeanBaselineBootstrap: groupedBootstrap(plainBaseline.arrival.predictions, chosen.arrival.predictions),
    perRoute, presenceDiagnostics: presence,
    limitations: ['GPS labels are stop-proximity detections, not door-open timestamps. No verified vehicle IDs or actual origin departure times are available.',
      'Main ETA task is elapsed time from an observed anchor stop to a later observed stop, not absolute next-bus ETA for an unobserved scheduled vehicle.',
      'Some anchor/target stop observations originate from boarding or alighting events; they measure presence, not exact arrival. Their source counts are reported separately.',
      'Boarding/alighting times constrain vehicle presence and are not exact arrival labels. Schedule matching is latent and potentially ambiguous.',
      'Presence diagnostics are minimum distances to nominal timetable candidates within a declared dwell window; they are not arrival-accuracy percentages.',
      'Final-test results for non-selected candidates are descriptive only; switching to their winner requires a new untouched holdout.',
      'Unresolvable timestamps and station identities cannot enter numeric regression, but original records remain unchanged.',
      'No observed passenger counts, historical weather, or verified congested/quiet-day labels; time bins are proxies only.',
      'All candidates share a training-only distance fallback for unseen directed station pairs. Legacy rows are included unless an explicit candidate tests excluding them.']};
  save('experiment-report.json', report);
  save('heldout-results.json', {chosenId, cutoff: split.cutoff, labelMeaning: 'Actual GPS-observed elapsed time, not the old model output',
    rows: testSpans.map((row, index) => ({...row, baselinePrediction: baseline.arrival.predictions[index], selectedPrediction: chosen.arrival.predictions[index]}))});
  save('candidate-model.json', {schema: 'cuhk_eta_offline_candidate_v1', deployable: false, trainedBefore: split.cutoff,
    config: chosen.model.config, training: chosen.model.training, parameters: chosen.model.parameters,
    warning: 'Offline experimental artifact only. This is not a production runtime model.'});
  console.log(JSON.stringify({out, split: report.split, chosenId, baseline: baseline.arrival.metrics, selected: chosen.arrival.metrics,
    bootstrap: report.pairedSessionBootstrap, finalTest: report.finalTest.map(row => ({id: row.id, arrivalMaeSeconds: row.arrival.maeSeconds,
      balancedArrivalMaeSeconds: row.arrival.sessionBalancedMaeSeconds, segmentMaeSeconds: row.segment.maeSeconds}))}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
