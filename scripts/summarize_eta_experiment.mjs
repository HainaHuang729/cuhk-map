import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareEvidence, chooseSplit, trainingRows, fitModel, localDate, metrics} from './experiment_eta_models.mjs';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: node scripts/summarize_eta_experiment.mjs dataset.json experiment-directory');
const directory = path.resolve(output);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (directory === repo || directory.startsWith(repo + path.sep)) throw new Error('Private evidence must stay outside the public repository');
const read = name => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
const save = (name, value) => fs.writeFileSync(path.join(directory, name), value, {mode: 0o600, flag: 'wx'});
const json = (name, value) => save(name, JSON.stringify(value, null, 2) + '\n');
const source = fs.readFileSync(input, 'utf8'), dataset = JSON.parse(source);
const manifest = read('split-manifest.json'), report = read('experiment-report.json');
const selection = read('validation-selection.json'), results = read('heldout-results.json');
if (crypto.createHash('sha256').update(source).digest('hex') !== manifest.datasetSha256) throw new Error('Dataset differs from the frozen split');
if (selection.chosenId !== report.selection.chosenId || results.chosenId !== selection.chosenId) throw new Error('Inconsistent frozen selection');
const evidence = prepareEvidence(dataset), split = chooseSplit(evidence), cutoff = manifest.cutoff;
if (split.cutoff !== cutoff) throw new Error('Chronological split changed');
const heldout = row => (row.date || localDate(row.fromTimestamp || row.observedAt || row.timestamp || row.startedAt)) >= cutoff
  || row.sessionId && [...(split.sessionDates.get(row.sessionId) || [])].some(date => date >= cutoff);
const tally = (rows, getKey) => rows.reduce((total, row) => {
  const key = getKey(row) || 'unknown'; total[key] = (total[key] || 0) + 1; return total;
}, {});
const dates = rows => [...new Set(rows.map(row => row.date))].filter(Boolean).sort();
const trainSegments = trainingRows(evidence.segments, cutoff, split.sessionDates);
const trainPresence = trainingRows(evidence.presence, cutoff, split.sessionDates);
const plain = fitModel(evidence, {id: 'all_mean', estimate: 'mean'}, cutoff, split.sessionDates);
const rows = results.rows.map(row => {
  const predicted = plain.predict(row);
  return {...row, allDataMeanPrediction: {predictedSeconds: predicted.minutes * 60,
    errorSeconds: (predicted.minutes - row.value) * 60, supported: predicted.supported}};
});
const plainPredictions = rows.map(row => ({...row, ...row.allDataMeanPrediction}));
if (metrics(plainPredictions).maeSeconds !== report.finalTest.find(row => row.id === 'all_mean').arrival.maeSeconds) {
  throw new Error('All-data mean predictions changed since the frozen experiment');
}
const perRoute = [...new Set(rows.map(row => row.routeId))].sort().map(routeId => ({routeId,
  allDataMean: metrics(plainPredictions.filter(row => row.routeId === routeId)),
  selected: metrics(rows.filter(row => row.routeId === routeId).map(row => ({...row, ...row.selectedPrediction})))}));
const baseline = report.finalTest.find(row => row.id === 'all_mean');
const selected = report.finalTest.find(row => row.id === selection.chosenId);
const summary = {
  schema: 'cuhk_eta_experiment_summary_v1', generatedAt: new Date().toISOString(),
  datasetSha256: manifest.datasetSha256, selectionFrozenBeforeTest: true, productionChanged: false,
  training: {before: cutoff, segments: trainSegments.length, sessions: new Set(trainSegments.map(row => row.sessionId)).size,
    dates: dates(trainSegments), sourceCounts: tally(trainSegments, row => row.source),
    nonExclusiveFlagCounts: tally(trainSegments.flatMap(row => row.flags), row => row), presence: trainPresence.length},
  test: {...report.split, observedSpanDates: dates(results.rows),
    allUnfilteredSegments: evidence.segments.filter(heldout).length,
    allUnfilteredPresence: evidence.presence.filter(heldout).length,
    allUnfilteredDwell: evidence.dwell.filter(heldout).length},
  selected: {id: selected.id, label: selected.label},
  allDataMean: baseline.arrival, selectedArrival: selected.arrival,
  comparison: report.plainMeanBaselineBootstrap, perRoute,
  findings: [
    'Validation selected the driving-plus-dwell candidate before the final test. No final-test winner was substituted.',
    'The selected candidate reduced mean error, but the fraction within 60 seconds fell and the paired session bootstrap includes zero improvement.',
    'The unfiltered presence-corrected mean was much worse than the simple unfiltered mean. Both are reported, without claiming that broadcasts have no predictive value.',
    'Discarding all legacy observations or keeping only recent observations did not beat the selected candidate on validation.',
    'No passenger-load or weather labels exist here. This experiment cannot claim to distinguish busy and quiet days reliably.',
    'The anchor is a recorded boarding time and each held-out target is a GPS stop visit. These are observed elapsed times, not verified door-open arrivals.'
  ],
  nextUse: [
    'Preserve all raw observations and their provenance; do not delete rows merely because they are excluded from a timing fit.',
    'Use observed adjacent intervals for runtime fits; keep allocated/interpolated intervals as uncertain spans rather than independent ground truth.',
    'Keep boarding observations as stop-presence constraints with uncertain vehicle/departure assignment, including censored origin dwell.',
    'Keep historical directed-pair sharing for sparse routes; learn time-dependent dwell with shrinkage rather than imposing one global delay.',
    'Freeze this candidate, then evaluate on newly collected trips before replacing production.'
  ]
};
json('analysis-summary.json', summary);
json('heldout-dataset.json', {
  schema: 'cuhk_eta_heldout_dataset_v1', cutoff, datasetSha256: manifest.datasetSha256,
  frozenSelectedCandidate: selection.chosenId, timezone: 'Asia/Hong_Kong',
  labelDefinition: 'Elapsed seconds from an observed boarding anchor to a later GPS stop visit; not precise door-open arrival time.',
  arrivalResults: rows,
  adjacentObservations: evidence.segments.filter(heldout),
  presenceObservations: evidence.presence.filter(heldout),
  dwellObservations: evidence.dwell.filter(heldout),
  stopObservations: dataset.stopObservations.filter(heldout),
  recordings: [...dataset.sessions, ...(dataset.nonSegmentRecordings || [])].filter(heldout),
  warning: 'Contains private GPS evidence. Do not commit or deploy. Unscored observations are retained with flags, not silently dropped.'
});
const num = value => typeof value === 'number' ? value.toFixed(1) : '-';
const table = report.finalTest.map(row => [row.label,
  num(report.validation.find(value => value.id === row.id).arrival.sessionBalancedMaeSeconds),
  num(row.arrival.maeSeconds), num(row.arrival.sessionBalancedMaeSeconds),
  num(row.arrival.within60SecondsPercent), num(row.arrival.p90AbsoluteErrorSeconds)].join(' | '));
const text = [
  'CUHK 到站预测离线实验，2026-10-25',
  '',
  '一、数据和隔离规则',
  `全量数据：${evidence.segments.length}条数值站间记录、${evidence.presence.length}条在站约束、${evidence.dwell.length}条停留记录。原始数据全部保留。`,
  `训练集：${cutoff}之前，${trainSegments.length}条站间记录、${trainPresence.length}条在站约束。基线不按旧质量规则过滤。`,
  `训练集包含${summary.training.sourceCounts.interpolated_observed_span || 0}条插值分摊记录；它们不是独立实测标签。`,
  `测试集：${cutoff}起，GPS区间实际日期为${dates(results.rows).join('、')}。`,
  `主评估：${report.split.testArrivalSessions}趟独立行程、${report.split.testArrivalSamples}个上车至后续站点区间；另有${report.split.testSegmentSamples}条相邻站间标签。`,
  `广播检验：${report.split.testPresenceSamples}条质量合格的在站记录；测试文件另保留全部${summary.test.allUnfilteredPresence}条在站记录和${summary.test.allUnfilteredSegments}条站间记录。`,
  '同一行程不得跨训练和测试；先按滚动日期验证选方案，再解封最终测试，未根据最终测试重新选冠军。',
  '所有主评估区间的起点都是上车记录，终点都是GPS停站识别。不是车门开启的精确时刻，也不是没有实测锚点时的下一辆车绝对ETA。',
  '',
  '二、主要结果',
  `验证集选中：${selected.label}。`,
  `与不做广播校正的全量均值相比：平均绝对误差${num(baseline.arrival.maeSeconds)}秒 -> ${num(selected.arrival.maeSeconds)}秒。`,
  `逐行程均衡误差${num(baseline.arrival.sessionBalancedMaeSeconds)}秒 -> ${num(selected.arrival.sessionBalancedMaeSeconds)}秒，避免长行程因检测点多而占过大权重。`,
  `一分钟内比例${num(baseline.arrival.within60SecondsPercent)}% -> ${num(selected.arrival.within60SecondsPercent)}%，并未全面改善。`,
  `90分位绝对误差${num(baseline.arrival.p90AbsoluteErrorSeconds)}秒 -> ${num(selected.arrival.p90AbsoluteErrorSeconds)}秒。`,
  `逐行程配对改善量${num(summary.comparison.improvementSeconds)}秒，95% bootstrap区间[${summary.comparison.ci95Seconds.map(num).join(', ')}]秒。区间包含零，尚不足以确认稳定改善。`,
  '当前直接把广播硬配给时刻表班次，反而明显变差。这说明当前匹配方法不合适，不代表广播无用。',
  '仅保留新路线、近45天或简单近期加权，都没有在验证集超过选中方案。不能简单地把旧数据全扔掉。',
  '',
  '三、全部预先声明的实验',
  '方案 | 验证行程均衡误差秒 | 最终平均误差秒 | 最终行程均衡误差秒 | 一分钟内% | 最终90分位误差秒',
  ...table,
  '',
  '四、线路样本覆盖',
  '线路 | 行程数 | 区间数 | 全量均值误差秒 | 选中方案误差秒',
  ...perRoute.map(row => [row.routeId, row.allDataMean.sessions, row.allDataMean.samples,
    num(row.allDataMean.maeSeconds), num(row.selected.maeSeconds)].join(' | ')),
  '多条线只有1趟，不能据此宣布该线路已校准；也有线路缺少直接样本，仍需距离回退。',
  '',
  '五、后续数据用法',
  '1. 原始记录不删，保留来源、质量标记、路线版本和日期。',
  '2. 实测相邻站间计时用于行驶时间；插值分摊改作跨站范围约束，不冒充各站独立标签。',
  '3. 短GPS、上车和下车记录保留为“此时此站有车”的约束；未确认班次前不硬写成到站时刻。',
  '4. 分开估计行驶和停站时间，数据稀疏时共享历史站对统计；时段参数向整体值收缩，避免少量样本带偏。',
  '5. 当前没有客流、天气等实际标签，还不能可靠划分忙日和闲日；不要凭误差大小反推客流。',
  '6. 冻结候选，等待新的独立GPS行程再验证。此次没有修改或部署线上模型，也没有更改云数据库。',
  '',
  '文件：heldout-dataset.json为测试资料与逐条预测；experiment-report.json为完整实验；candidate-model.json仅离线候选，不可直接部署。',
  ''
].join('\n');
save('analysis-summary.txt', text);
console.log(JSON.stringify({directory, selected: selection.chosenId, meanErrorSeconds: {
  allDataMean: baseline.arrival.maeSeconds, selected: selected.arrival.maeSeconds}, comparison: summary.comparison,
  heldout: {segments: summary.test.allUnfilteredSegments, presence: summary.test.allUnfilteredPresence}}, null, 2));
