(function(root, factory) {
  const data = factory();
  if (typeof module === 'object' && module.exports) module.exports = data;
  else root.CUHK_MTR_STATION = data;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  const data = {
    checkedAt:'2026-11-11',
    openingHours:'05:31–次日01:02',
    hoursSource:'https://www.mtr.com.hk/ch/customer/services/service_hours_search.php?query_type=search&station=71',
    facilitiesSource:'https://www.mtr.com.hk/ch/customer/services/free_search.php?station=71',
    faresSource:'https://opendata.mtr.com.hk/data/mtr_lines_fares.csv',
    layoutUrl:'https://www.mtr.com.hk/archive/ch/services/layouts/uni.pdf',
    streetUrl:'https://www.mtr.com.hk/archive/ch/services/maps/uni.pdf',
    exits:[
      {name:'A 出口',detail:'崇基学院方向 · 平层通道'},
      {name:'B 出口',detail:'泽祥街、公共运输交汇处方向 · 斜道'},
      {name:'C 出口',detail:'校巴站、车站路方向 · 闸外电梯'},
      {name:'D 出口',detail:'康本国际学术园、伍何曼原楼方向 · 斜道'}
    ],
    services:[
      {destination:'落马洲',first:'05:44',last:'21:55'},
      {destination:'罗湖',first:'05:41',last:'23:27'},
      {destination:'上水',first:'05:41',last:'次日00:50'},
      {destination:'金钟',first:'05:57',last:'次日00:22'},
      {destination:'红磡',first:'05:57',last:'次日00:52'}
    ],
    facilities:[
      {name:'A 出口',detail:'平层通道'},
      {name:'B、D 出口',detail:'斜道'},
      {name:'C 出口',detail:'闸外电梯'},
      {name:'收费区内',detail:'电梯、无障碍洗手间'},
      {name:'站内设施',detail:'宽闸机、引导径、感应环回系统、手携式或活动摺板'}
    ],
    fares:[
      {destination:'沙田',adult:'4.60',student:'2.20',single:'5.00'},
      {destination:'九龙塘',adult:'8.00',student:'3.90',single:'8.50'},
      {destination:'红磡',adult:'8.20',student:'4.00',single:'8.50'},
      {destination:'金钟',adult:'18.40',student:'9.20',single:'20.00'},
      {destination:'上水',adult:'6.50',student:'3.20',single:'6.50'},
      {destination:'罗湖',adult:'30.20',student:'30.20',single:'31.00'},
      {destination:'落马洲',adult:'30.20',student:'30.20',single:'31.00'}
    ]
  };
  const order = ['ADM','EXC','HUH','MKK','KOT','TAW','SHT','FOT','UNI','TAP','TWO','FAN','SHS','LOW'];
  const codes = ['SHT','KOT','HUH','ADM','SHS','LOW','LMC'];
  data.destinations = data.fares.map((fare,i) => ({...fare,code:codes[i],direction:i<4?'DOWN':'UP',lastService:i<3?'红磡':fare.destination}));
  // Service days continue through midnight; never derive a last train from the next-four feed.
  data.journey = function(state, code, now = Date.now()) {
    const d = data.destinations.find(d=>d.code===code);
    if (!d) return null;
    const trains = (state.directions || []).filter(r=>r.key===d.direction).flatMap(r=>r.trains).filter(t=>{
      const c = t.destinationCode;
      if (d.direction==='DOWN') return order.indexOf(c)>=0 && order.indexOf(c)<=order.indexOf(code);
      if (code==='LMC'||code==='LOW') return c===code;
      return c==='LMC'||order.indexOf(c)>=order.indexOf(code);
    });
    const service = data.services.find(r=>r.destination===d.lastService);
    const clock = Number.isFinite(state.clock) ? state.clock : now;
    const hk = new Date(clock+8*3600000);
    const minute = hk.getUTCHours()*60+hk.getUTCMinutes();
    const serviceMinute = minute<180 ? minute+1440 : minute;
    const parse = text => { const parts=text.replace('次日','').split(':').map(Number); return parts[0]*60+parts[1]+(text.includes('次日')?1440:0); };
    const left = parse(service.last)-serviceMinute;
    let reminder = '';
    if (left>=0 && left<=45) reminder=`往${d.destination}末班参考 ${service.last}，约${left}分钟后开出；至少提前5分钟入闸`;
    else if (left<0) reminder=`往${d.destination}当日末班参考时间已过；首班参考 ${service.first}`;
    else if (minute<parse(service.first)) reminder=`往${d.destination}首班参考 ${service.first}`;
    return {...d,trains,reminder,availability:trains.length?'':'当前没有可确认直达的班次，不代表停运',caution:'常规时刻表参考；特别安排以港铁公告及现场指示为准'};
  };
  data.lastTrainReminders = function(state, now = Date.now()) {
    return ['ADM','HUH','SHS','LOW','LMC'].map(code=>data.journey(state,code,now).reminder)
      .filter(text=>text.includes('末班参考') && text.includes('分钟后开出'));
  };
  return data;
});
