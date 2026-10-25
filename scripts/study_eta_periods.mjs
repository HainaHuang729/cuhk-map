import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {prepareEvidence, chooseSplit, trainingRows, fitModel, metrics} from './experiment_eta_models.mjs';

export const PERIODS = [
  {id: 'summer_session', label: '暑期课程及补课期', start: '2026-05-11', end: '2026-06-29'},
  {id: 'summer_break', label: '暑假后段', start: '2026-06-30', end: '2026-08-31'},
  {id: 'pre_term_transition', label: '开学前过渡期', start: '2026-09-01', end: '2026-09-06'},
  {id: 'main_term', label: '第一学期', start: '2026-09-07', end: '2026-12-05'},
];
const SOURCES = [
  'https://www.res.cuhk.edu.hk/wp-content/uploads/general-information/Calendar-for-Academic-Year-2025-26_Eng_20250612.pdf',
  'https://www.res.cuhk.edu.hk/sc/announcement/important-information-regarding-the-start-of-new-academic-year-2026-27-for-new-undergraduate-students/',
  'https://www.gs.cuhk.edu.hk/download/UniversityAlmanac202627.pdf.pdf',
];
export function academicPeriod(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return 'unknown';
  const at = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== date) return 'unknown';
  return PERIODS.find(period => date >= period.start && date <= period.end)?.id || 'unknown';
}

export function fitPeriodModels(evidence, before, sessionDates, estimate, crossPeriodFallback = false) {
  const mixed = fitModel(evidence, {estimate}, before, sessionDates);
  const models = new Map();
  for (const period of [...PERIODS.map(row => row.id), 'unknown']) {
    const data = {...evidence};
    for (const field of ['segments', 'presence', 'dwell', 'spans']) {
      data[field] = evidence[field].filter(row => academicPeriod(row.date) === period);
    }
    models.set(period, fitModel(data, {estimate}, before, sessionDates));
  }
  return {
    training: Object.fromEntries([...models].map(([period, model]) => [period, model.training])),
    predict(row) {
      const model = models.get(academicPeriod(row.date));
      let minutes = 0, supported = true, crossPeriodLegs = 0, distanceFallbackLegs = 0;
      for (const pair of row.path) {
        const leg = {...row, at: row.at + minutes * 60000, path: [pair]};
        let result = model.predict(leg);
        if (!result.supported && crossPeriodFallback) {
          const other = mixed.predict(leg);
          if (other.supported) { result = other; crossPeriodLegs++; }
        }
        minutes += result.minutes;
        supported &&= result.supported;
        if (!result.supported) distanceFallbackLegs++;
      }
      return {minutes, supported, crossPeriodLegs, distanceFallbackLegs};
    }
  };
}

const CANDIDATES = [
  {id: 'mixed_mean', label: '跨时期全量均值', estimate: 'mean'},
  {id: 'period_mean', label: '分时期均值，不混合其他时期', estimate: 'mean', byPeriod: true},
  {id: 'period_median', label: '分时期中位数，不混合其他时期', estimate: 'median', byPeriod: true},
  {id: 'period_mean_fallback', label: '同一时期优先，仅缺站对时回退历史', estimate: 'mean', byPeriod: true, fallback: true},
];

function main() {
  const [input, previousDirectory, output] = process.argv.slice(2);
  if (!input || !previousDirectory || !output) throw new Error('Usage: node scripts/study_eta_periods.mjs dataset.json frozen-experiment-directory new-private-output-directory');
  const source = fs.readFileSync(input, 'utf8'), dataset = JSON.parse(source);
  const manifest = JSON.parse(fs.readFileSync(path.join(previousDirectory, 'split-manifest.json')));
  if (crypto.createHash('sha256').update(source).digest('hex') !== manifest.datasetSha256) throw new Error('Dataset differs from frozen experiment');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), directory = path.resolve(output);
  if (directory === repo || directory.startsWith(repo + path.sep)) throw new Error('Private data must stay outside the public repository');
  fs.mkdirSync(directory, {mode: 0o700});
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  const evidence = prepareEvidence(dataset), split = chooseSplit(evidence);
  if (split.cutoff !== manifest.cutoff) throw new Error('Frozen partition changed');
  save('study-protocol.json', {datasetSha256: manifest.datasetSha256, periods: PERIODS, sources: SOURCES,
    candidates: CANDIDATES, validationFolds: manifest.validationFolds,
    evaluation: 'Exploratory rolling validation only; do not rescore or select on the previously revealed final test.',
    restriction: 'All numeric training observations are retained within their own calendar period. No old quality filtering is applied.',
    caveats: ['Main-term membership is not measured congestion. Weekends, holidays, programme calendars and special events can differ within a period.',
      'The route-version boundary on 1 September is independent from the academic-term boundary on 7 September. Do not substitute one for the other.',
      'June includes a university summer session. Pre-September is not uniformly a no-teaching period.']});
  const train = {};
  for (const field of ['segments', 'presence', 'dwell', 'spans']) {
    train[field] = trainingRows(evidence[field], manifest.cutoff, split.sessionDates).map(row => ({...row, academicPeriod: academicPeriod(row.date)}));
  }
  save('period-labeled-training-data.json', {schema: 'cuhk_eta_calendar_labeled_training_v1', before: manifest.cutoff,
    periods: PERIODS, routeSchemeIsIndependent: true, ...train});
  const inventory = PERIODS.map(period => {
    const segments = train.segments.filter(row => row.academicPeriod === period.id);
    return {...period, segments: segments.length, trustedSegments: segments.filter(row => row.eligibleForSegmentTraining).length,
      sessions: new Set(segments.map(row => row.sessionId)).size,
      presence: train.presence.filter(row => row.academicPeriod === period.id).length,
      dwell: train.dwell.filter(row => row.academicPeriod === period.id).length};
  });
  const results = CANDIDATES.map(config => {
    const predictions = [];
    const folds = manifest.validationFolds.map(fold => {
      const model = config.byPeriod ? fitPeriodModels(evidence, fold.start, split.sessionDates, config.estimate, config.fallback)
        : fitModel(evidence, {estimate: config.estimate}, fold.start, split.sessionDates);
      const labels = evidence.spans.filter(row => academicPeriod(row.date) === 'main_term'
        && row.date >= fold.start && row.date < fold.end
        && [...(split.sessionDates.get(row.sessionId) || [])].every(date => date >= fold.start && date < fold.end));
      const rows = labels.map(row => {
        const prediction = model.predict(row);
        return {uid: row.uid, sessionId: row.sessionId, date: row.date, routeId: row.routeId,
          errorSeconds: (prediction.minutes - row.value) * 60, actualSeconds: row.value * 60,
          predictedSeconds: prediction.minutes * 60, supported: prediction.supported,
          crossPeriodLegs: prediction.crossPeriodLegs || 0, distanceFallbackLegs: prediction.distanceFallbackLegs || 0};
      });
      predictions.push(...rows);
      return {...fold, metrics: metrics(rows), training: model.training};
    });
    return {...config, metrics: metrics(predictions), folds, predictions};
  });
  const report = {schema: 'cuhk_eta_calendar_period_study_v1', createdAt: new Date().toISOString(),
    datasetSha256: manifest.datasetSha256, inventory, results,
    finalTestUsed: false, productionChanged: false, requiresNewIndependentTest: true,
    conclusionScope: 'Exploratory comparison within observed main-term rolling validation only. Do not claim independent-test accuracy or causal passenger-load effects.'};
  save('period-study-report.json', report);
  const num = value => typeof value === 'number' ? value.toFixed(1) : '-';
  save('period-study-summary.txt', [
    'CUHK 暑期与开学期分组检查，2026-10-25', '',
    '修正：此前把跨时期混合、近期数据和新路线版本混在一起讨论，不足以判断暑期数据能否直接用于开学后的预测。',
    '以下日期按学校校历划分，只是运行条件的特征，不等于已测得拥挤程度；研究生项目、周末和活动日另有差异。',
    '校历来源：', ...SOURCES, '',
    '9月27日前训练数据：时期 | 全量站间记录 | 旧规则合格站间记录 | 行程数 | 在站记录 | 停留记录',
    ...inventory.map(row => [row.label, row.segments, row.trustedSegments, row.sessions, row.presence, row.dwell].join(' | ')), '',
    '补充对照只使用原有滚动验证日期，绝不重跑已看过的最终测试集。所有模型都不按旧质量规则过滤站间记录，比较重点是时期分组。',
    '方案 | 验证平均误差秒 | 验证逐行程均衡误差秒 | 一分钟内% | 有实测站对覆盖%',
    ...results.map(row => [row.label, num(row.metrics.maeSeconds), num(row.metrics.sessionBalancedMaeSeconds),
      num(row.metrics.within60SecondsPercent), num(row.metrics.supportedPercent)].join(' | ')), '',
    '使用原则：旧数据不是坏数据，保留在所属时期；预测开学期优先用同期开学数据。',
    '是否允许跨时期回退应单独验证，并明确标注缺少同期样本，不能无条件拉回暑期平均。',
    '路线版本与时期分别标记；同名站对若实际经过道路不同，也不能自动当成相同路段。',
    '这些是探索性验证结果，不能当作新的独立测试证明。应冻结时期规则后等待新行程检验。',
    '原始文件、旧实验和线上模型均未修改。', ''
  ].join('\n'));
  console.log(JSON.stringify({directory, inventory, validationOnly: results.map(row => ({id: row.id, metrics: row.metrics})), finalTestUsed: false}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
