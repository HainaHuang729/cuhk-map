(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CUHK_WEB_GPS = api;
})(globalThis, function() {
  const MAX_SAMPLES = 5400, MAX_DURATION = 90 * 60 * 1000, CHUNK_SIZE = 180;
  const CONSENT_VERSION = 'web-gps-consent-20261113-v1';
  function inCampus(p) { return p.lon >= 114.18 && p.lon <= 114.24 && p.lat >= 22.39 && p.lat <= 22.45; }
  function point(position, now) {
    const c = position.coords || {}, timestamp = Number(position.timestamp);
    if (![c.longitude,c.latitude,c.accuracy,timestamp].every(Number.isFinite) || c.accuracy < 0 || Math.abs(timestamp-now) > 30000) return null;
    return {timestamp:new Date(timestamp).toISOString(),lon:c.longitude,lat:c.latitude,accuracy:c.accuracy};
  }
  class Collector {
    constructor({geo, store, changed = () => {}, now = Date.now, uuid = () => crypto.randomUUID(), timers = globalThis}) {
      Object.assign(this,{geo,store,changed,now,uuid,timers});
      this.current=null; this.watch=null; this.expiry=null; this.pendingSave=null; this.generation=0;
      this.persistChain=Promise.resolve(); this.warning=''; this.lastSampleAt=0;
    }
    async save(record) {
      const copy=JSON.parse(JSON.stringify(record));
      this.persistChain=this.persistChain.catch(()=>{}).then(()=>this.store.put(copy));
      try { await this.persistChain; return true; }
      catch (_) { this.warning='本地保存失败，请结束采集并导出；不要关闭页面。'; this.changed(); return false; }
    }
    async start(routeId,direction,consent) {
      if(this.current||this.starting)throw Error('正在采集中');
      if(!consent)throw Error('请先同意采集与上传说明');
      if(!this.geo)throw Error('此浏览器不支持定位');
      const now=this.now();
      const record={schema:'web_gps_session_v1',id:this.uuid(),source:'web_browser',recordPurpose:'research',routeScheme:'2026-09',routeId,direction,
        coordinateSystem:'browser_wgs84_unverified',consentVersion:CONSENT_VERSION,consentedAt:new Date(now).toISOString(),
        startedAt:new Date(now).toISOString(),endedAt:null,endReason:'',status:'recording',gpsSamples:[]};
      this.starting=true;
      if(!await this.save(record)){this.starting=false;throw Error('无法保存本地轨迹，未开始采集');}
      this.starting=false;
      this.current=record; this.warning='正在请求定位权限'; this.lastSampleAt=0;
      const generation=++this.generation;
      let handle;
      try{handle=this.geo.watchPosition(p=>this.receive(p,generation),e=>this.failed(e,generation),
        {enableHighAccuracy:true,maximumAge:0,timeout:15000});}
      catch(error){await this.stop('geolocation_error');throw error;}
      if(this.current && generation===this.generation)this.watch=handle;
      else this.geo.clearWatch(handle);
      if(this.current)this.expiry=this.timers.setTimeout(()=>this.stop('duration_limit'),MAX_DURATION);
      this.changed(); return record;
    }
    receive(position,generation) {
      if(!this.current || generation!==this.generation)return;
      const p=point(position,this.now());
      if(!p){this.warning='收到过期或无效定位，正在等待新位置';this.changed();return;}
      if(!inCampus(p)){this.stop('outside_campus');return;}
      const at=Date.parse(p.timestamp),last=this.current.gpsSamples.at(-1);
      if(last && at<=Date.parse(last.timestamp))return;
      // Keep native browser coordinates unchanged; never relabel these as GCJ-02.
      this.current.gpsSamples.push(p); this.lastSampleAt=this.now(); this.warning=p.accuracy>50?'定位精度较低，数据会保留供核验':'';
      if(!this.pendingSave)this.pendingSave=this.timers.setTimeout(()=>{this.pendingSave=null;if(this.current)this.save(this.current);},5000);
      if(this.current.gpsSamples.length>=MAX_SAMPLES)this.stop('sample_limit');
      this.changed();
    }
    failed(error,generation) {
      if(!this.current || generation!==this.generation)return;
      if(error.code===1){this.warning='定位权限被拒绝，可在浏览器设置中允许后重试';this.stop('permission_denied');}
      else {this.warning=error.code===3?'定位暂未更新，请保持页面打开':'暂时无法定位，请检查定位服务';this.changed();}
    }
    async stop(reason='user_alight') {
      if(!this.current)return null;
      ++this.generation;
      if(this.watch!==null)this.geo.clearWatch(this.watch);
      this.watch=null;
      this.timers.clearTimeout(this.expiry);this.timers.clearTimeout(this.pendingSave);
      this.expiry=this.pendingSave=null;
      const record=this.current;this.current=null;
      record.endedAt=new Date(this.now()).toISOString();record.endReason=reason;record.status='ready';
      this.changed();await this.save(record);this.changed();return record;
    }
  }
  function manifest(record,hashes) {
    return {schema:record.schema,id:record.id,source:'web_browser',recordPurpose:record.recordPurpose||'research',routeScheme:record.routeScheme,routeId:record.routeId,direction:record.direction,
      coordinateSystem:record.coordinateSystem,consentVersion:record.consentVersion,consentedAt:record.consentedAt,
      startedAt:record.startedAt,endedAt:record.endedAt,endReason:record.endReason,sampleCount:record.gpsSamples.length,chunkHashes:hashes};
  }
  async function upload(record,call,hash,progress=()=>{}) {
    if(record.status==='recording'||!record.endedAt)throw Error('请先结束采集');
    if(!record.gpsSamples.length)throw Error('没有定位点，不能上传');
    const chunks=[];
    for(let i=0;i<record.gpsSamples.length;i+=CHUNK_SIZE)chunks.push(record.gpsSamples.slice(i,i+CHUNK_SIZE));
    const hashes=await Promise.all(chunks.map(points=>hash(JSON.stringify(points))));
    const value=manifest(record,hashes), digest=await hash(JSON.stringify(value));
    const ack=(r)=>{if(!r||!r.ok)throw Error(r?.message||'服务器未确认保存');return r;};
    const begin=ack(await call({action:'init',manifest:value,digest}));
    if(begin.completed && begin.digest===digest)return {id:record.id,digest};
    for(let i=0;i<chunks.length;i++) {
      ack(await call({action:'chunk',id:record.id,digest,index:i,points:chunks[i]}));progress(i+1,chunks.length);
    }
    const done=ack(await call({action:'complete',id:record.id,digest}));
    if(!done.completed||done.digest!==digest)throw Error('服务器尚未确认完整轨迹');
    return {id:record.id,digest};
  }
  return {Collector,upload,manifest,point,inCampus,MAX_SAMPLES,MAX_DURATION,CHUNK_SIZE,CONSENT_VERSION};
});
