const number=value=>Number.isFinite(value)?value.toFixed(1):'—';
const text=value=>String(value).replace(/\r?\n/g,' ').replace(/\|/g,'\\|');
const status=value=>value==='no_observations'?'暂无验证区间':value==='sparse'?'样本不足':'仅作描述统计';
const sampleStatus=row=>status(row.sampleStatus)+(row.reviewRequiredObservations?`；${row.reviewRequiredObservations} 个观测距时冲突待核对`:'');
const bias=value=>!Number.isFinite(value)?'—':value===0?'无平均偏差':`预报${value<0?'早':'晚'} ${Math.abs(value).toFixed(1)} 秒`;
const modes=report=>[...report.replays.map(row=>({...row,name:row.kind==='upload_aware_replay'?'历史回放：按实际上传可用时间':'历史回看：假设观测及时可用'})),
  {...report.prospective,kind:'prospective',name:'冻结后独立验证'}];

export function renderStationMarkdown(report) {
  const lines=['# 按线路、站点的到站预测误差','',
    `模型版本：${text(report.modelVersion)}；开学期计时训练截至 ${text(report.trainedThrough)}。`,
    `历史参考日期：${report.referenceDates.map(text).join('、')}。`,'',
    '- 误差比较的是“上车时间 → 后续 GPS 近站时间”的用时，GPS 近站不等于精确开门时刻。',
    '- 预报早表示预测用时短于实测；预报晚表示预测用时长于实测。不是车辆相对官方班次的早晚点。',
    '- 同一趟行程的多个站点相关；同时查看观测数、行程数和日期数，不把它们当成独立样本。',
    '- 各站汇总可能包含不同上车点；下方另按上车点拆开，不能把累计误差当成相邻站用时误差。',
    '- 少于 5 趟或 3 天标“样本不足”，仅为显示提醒，未删除任何观测，也不代表达到门槛就已可靠。',
    '- 同名站按线路站序分开，保留上下行；无样本站显示“暂无验证区间”，不显示为零误差。',
    '- 旧参考数据已被查看，历史回放不是新的独立测试；暑假与开学期不混合。',''];
  lines.push('路线距离除以观测用时超过 80 km/h 时，标记“距时冲突待核对”。这是人工核对提醒，不是道路限速或自动删数据标准；可能是站点匹配、实际路径或定位时间不一致。以下统计仍包含该记录，不能把它的差值直接当成已确认的模型误差。','');
  for(const mode of modes(report)){
    lines.push(`## ${mode.name}`,'',`${mode.metrics.observations} 个观测 / ${mode.metrics.sessions} 趟行程 / ${mode.metrics.days} 天。`,'');
    if(mode.kind==='prospective')lines.push(`冻结时间：${text(report.prospective.frozenAt)}。新样本先验证、后训练。`,'');
    const groups=new Map();
    for(const row of mode.byRouteStop){if(!groups.has(row.routeId))groups.set(row.routeId,[]);groups.get(row.routeId).push(row);}
    for(const [id,rows] of groups){
      lines.push(`### ${text(id)} · ${text(rows[0].routeName)}`,'',
        '| 站序 | 目标站 | 观测 / 趟 / 天 | 平均绝对误差（秒） | 行程均衡误差（秒） | 平均偏差 | P90（秒） | 样本情况 |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |');
      for(const row of rows)lines.push(`| ${row.stopIndex+1} | ${text(row.stopLabel)} | ${row.observations} / ${row.sessions} / ${row.days} | ${number(row.maeSeconds)} | ${number(row.sessionBalancedMaeSeconds)} | ${bias(row.signedBiasSeconds)} | ${number(row.p90AbsoluteErrorSeconds)} | ${sampleStatus(row)} |`);
      const pairs=mode.byRouteStopPair.filter(row=>row.routeId===id);
      if(pairs.length){
        lines.push('','按上车点拆分（用时与误差单位：秒）：','',
          '| 上车站 → 目标站（站序） | 观测 / 趟 / 天 | 平均预测用时 | 平均实测用时 | 平均绝对误差 | 平均偏差 | 样本情况 |',
          '| --- | --- | --- | --- | --- | --- | --- |');
        for(const row of pairs)lines.push(`| ${text(row.fromStopLabel)} → ${text(row.toStopLabel)}（${row.fromStopIndex+1} → ${row.toStopIndex+1}） | ${row.observations} / ${row.sessions} / ${row.days} | ${number(row.meanPredictedSeconds)} | ${number(row.meanActualSeconds)} | ${number(row.maeSeconds)} | ${bias(row.signedBiasSeconds)} | ${sampleStatus(row)} |`);
      }
      lines.push('');
    }
  }
  lines.push('本报告只供本地分析，未改变线上预测，也未上传私人行程数据。','');
  return lines.join('\n');
}

// Quoted strings still need a formula guard when opened by spreadsheet software.
const csvCell=value=>{
  let cell=value==null?'':String(value);
  if(typeof value==='string'&&/^[\s\uFEFF]*[=+@-]/u.test(cell))cell="'"+cell;
  return '"'+cell.replace(/"/g,'""')+'"';
};

export function renderStationCsv(report) {
  const rows=[['验证方式','汇总类型','线路','线路名称','上车站序','上车站','目标站序','目标站','观测数','行程数','日期数',
    '平均预测用时_秒','平均实测用时_秒','平均绝对误差_秒','行程均衡绝对误差_秒','平均有符号偏差_秒_正为预报晚','P90绝对误差_秒','样本情况','待核对观测数']];
  for(const mode of modes(report)){
    for(const row of mode.byRouteStop)rows.push([mode.name,'目标站汇总',row.routeId,row.routeName,'','',row.stopIndex+1,row.stopLabel,
      row.observations,row.sessions,row.days,row.meanPredictedSeconds,row.meanActualSeconds,row.maeSeconds,
      row.sessionBalancedMaeSeconds,row.signedBiasSeconds,row.p90AbsoluteErrorSeconds,sampleStatus(row),row.reviewRequiredObservations||0]);
    for(const row of mode.byRouteStopPair)rows.push([mode.name,'上车点到目标站',row.routeId,row.routeName,row.fromStopIndex+1,row.fromStopLabel,row.toStopIndex+1,row.toStopLabel,
      row.observations,row.sessions,row.days,row.meanPredictedSeconds,row.meanActualSeconds,row.maeSeconds,
      row.sessionBalancedMaeSeconds,row.signedBiasSeconds,row.p90AbsoluteErrorSeconds,sampleStatus(row),row.reviewRequiredObservations||0]);
  }
  return '\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
}
