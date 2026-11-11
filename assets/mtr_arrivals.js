// Shared by the map, station page and web. No location or persistent storage.
(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  else root.CUHK_MTR = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const URL = 'https://rt.data.gov.hk/v1/transport/mtr/getSchedule.php?line=EAL&sta=UNI&lang=TC';
  const SOURCE = 'https://data.gov.hk/en-data/dataset/mtr-data2-nexttrain-data';
  const INTERVAL = 30000, MAX_AGE = 120000;
  const NAMES = { ADM:'金钟', EXC:'会展', HUH:'红磡', MKK:'旺角东', KOT:'九龙塘', TAW:'大围', SHT:'沙田', FOT:'火炭', RAC:'马场', UNI:'大学', TAP:'大埔墟', TWO:'太和', FAN:'粉岭', SHS:'上水', LOW:'罗湖', LMC:'落马洲' };
  function hkTime(value) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(String(value || ''));
    if (!m) return NaN;
    const [y,mon,d,h,min,s] = m.slice(1).map(Number);
    const utc = Date.UTC(y,mon-1,d,h,min,s);
    if (new Date(utc).toISOString().slice(0,19).replace('T',' ') !== value) return NaN;
    return utc - 8 * 3600000;
  }
  function blank(status, notice) { return { status, notice, directions:[], updatedText:'', delayed:false }; }
  function officialUrl(value) {
    return /^https:\/\/(?:www\.)?mtr\.com\.hk\//i.test(String(value||'')) ? String(value).slice(0,1500) : '';
  }
  function normalize(snapshot, now = Date.now()) {
    if (!snapshot || !snapshot.ok || !snapshot.payload) return blank('error', '暂时无法读取港铁资料，请稍后重试');
    const raw = snapshot.payload;
    if (Number(raw.status) === 0) return { ...blank('alert', String(raw.message || '港铁正在实施特别服务安排').slice(0,300)), alertUrl:officialUrl(raw.url) };
    if (Number(raw.status) !== 1 || !raw.data || !raw.data['EAL-UNI']) return blank('error', '港铁暂未提供大学站资料');
    const station = raw.data['EAL-UNI'];
    const stamp = hkTime(station.curr_time || raw.curr_time);
    // Anchor to the cloud server clock; web requests use their receipt time.
    const clock = Number.isFinite(snapshot.servedAt) && Number.isFinite(snapshot.receivedAt)
      ? snapshot.servedAt + Math.max(0,now-snapshot.receivedAt) : now;
    const delayed = String(raw.isdelay || raw.Isdelay).toUpperCase() === 'Y';
    if (!Number.isFinite(stamp)) return { ...blank('empty', '港铁暂未提供列车时间'), delayed };
    if (clock-stamp > MAX_AGE || stamp-clock > 60000) return blank('stale', '列车资料已过期，请刷新');
    const directions = [['UP','往罗湖 / 落马洲方向'],['DOWN','往金钟方向']].map(([key,label]) => {
      const seen = new Set();
      const trains = (Array.isArray(station[key]) ? station[key] : []).map(row => {
        if (!row || typeof row !== 'object') return null;
        const time = hkTime(row.time), diff = time-clock;
        if (!Number.isFinite(time) || diff < -30000 || diff > 86400000 || !/^[A-Z]{3}$/.test(row.dest || '')) return null;
        const type = String(row.timeType || row.timetype || '').toUpperCase();
        const action = type === 'A' ? '预计到站' : type === 'D' ? '预计开出' : '预计时间';
        const imminent = type === 'A' ? '即将到站' : type === 'D' ? '即将开出' : '即将';
        const id = [row.dest,row.time,row.plat,type].join('/');
        if (seen.has(id)) return null;
        seen.add(id);
        return { id, destinationCode:row.dest, destination:NAMES[row.dest] || row.dest, platform:/^\d{1,2}$/.test(String(row.plat)) ? String(row.plat) : '',
          via:row.route === 'RAC' ? '经马场' : '', action, time:row.time.slice(11,16), timestamp:time,
          eta:diff < 60000 ? imminent : Math.ceil(diff/60000) + ' 分钟' };
      }).filter(Boolean).sort((a,b) => a.timestamp-b.timestamp).slice(0,4);
      return { key,label,trains };
    });
    return { status:directions.some(d=>d.trains.length) ? 'ready' : 'empty', directions,
      notice:directions.some(d=>d.trains.length) ? '' : '暂无列车时间，不代表已停运',
      updatedText:(station.curr_time || raw.curr_time).slice(11,19), delayed, clock, alertUrl:officialUrl(raw.url) };
  }
  function createPoller(fetchSnapshot, onChange, options = {}) {
    const now = options.now || Date.now, later = options.setTimeout || setTimeout, cancel = options.clearTimeout || clearTimeout;
    let active = false, generation = 0, timer = null, pending = false, lastAttempt = -Infinity, snapshot = null;
    function schedule(ms) { cancel(timer); if (active) timer = later(refresh, ms); }
    function refresh() {
      if (!active || pending) return;
      if (now()-lastAttempt < INTERVAL) { schedule(INTERVAL-(now()-lastAttempt)); return; }
      cancel(timer); pending = true; lastAttempt = now();
      const token = generation;
      onChange({ ...normalize(snapshot,now()), loading:true, notice:snapshot ? normalize(snapshot,now()).notice : '正在读取列车时间' });
      return Promise.resolve().then(() => active && token === generation ? fetchSnapshot() : null).then(result => {
        if (!active || token !== generation) return;
        snapshot = { ...result, receivedAt:now() };
        onChange({ ...normalize(snapshot,now()), loading:false });
        schedule(result.ok ? INTERVAL : 30000);
      }).catch(() => {
        if (!active || token !== generation) return;
        snapshot = null;
        onChange({ ...blank('error','暂时无法读取港铁资料，请稍后重试'), loading:false });
        schedule(30000);
      }).finally(() => { if (token === generation) pending = false; });
    }
    function stop() { active = false; generation++; pending = false; cancel(timer); timer = null; }
    return { start() { stop(); active = true; onChange({ ...normalize(snapshot,now()), loading:false }); return refresh(); }, stop, refresh };
  }
  function previewText(state) {
    const rows=['大学站 · 东铁线'];
    if(state.delayed) rows.push('港铁提示列车延误');
    if(state.notice) rows.push(state.notice.slice(0,90));
    for(const d of state.directions || []) {
      const t=d.trains[0];
      rows.push(t ? `往${t.destination}  ${t.eta}${t.platform?' · '+t.platform+'号月台':''}${t.via?' · '+t.via:''}` : `${d.key==='UP'?'北行':'南行'} 暂无列车时间`);
    }
    rows.push('详情 ›');
    return rows.join('\n');
  }
  function previewRows(state) {
    return (state.directions || []).map(d=>{
      const t=d.trains[0];
      return {key:d.key,destination:t?'往'+t.destination:(d.key==='UP'?'北行':'南行'),eta:t?t.eta:'暂无时间',meta:t?[t.platform?t.platform+'号月台':'',t.via].filter(Boolean).join(' · '):''};
    });
  }
  return { URL, SOURCE, INTERVAL, MAX_AGE, hkTime, normalize, createPoller, previewText, previewRows };
});
