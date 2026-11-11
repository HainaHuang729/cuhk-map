(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CUHK_PUBLIC_BUS=factory();})(typeof globalThis==='object'?globalThis:this,function(){
  const INTERVAL=30000;
  function url(stop){
    if(stop.operator==='KMB' && /^[A-F0-9]{16}$/.test(stop.stopId))return 'https://data.etabus.gov.hk/v1/transport/kmb/stop-eta/'+stop.stopId;
    if(stop.operator==='GMB' && /^\d{8}$/.test(stop.stopId))return 'https://data.etagmb.gov.hk/eta/stop/'+stop.stopId;
    throw Error('invalid_stop');
  }
  function rows(stop,snapshot,now=Date.now()){
    const raw=snapshot && snapshot.ok && snapshot.payload;
    const served=Number(snapshot && snapshot.servedAt),received=Number(snapshot && snapshot.receivedAt);
    const at=Number.isFinite(served)&&Number.isFinite(received)?served+Math.max(0,now-received):now;
    const generated=raw && Date.parse(raw.generated_timestamp);
    const fresh=Number.isFinite(generated) && at-generated<=120000 && generated-at<=60000;
    const data=fresh && Array.isArray(raw.data)?raw.data:[];
    const result=[];
    for(const route of stop.routes || []){
      const key=route.key+'/'+route.stopSequence;
      if(result.some(r=>r.key===key))continue;
      const matches=data.filter(r=>stop.operator==='GMB'
        ? 'gmb/'+r.route_id+'/'+r.route_seq===route.key && Number(r.stop_seq)===Number(route.stopSequence) && r.enabled===true
        : r.route===route.route && r.dir===route.direction && String(r.service_type)===String(route.serviceType) && Number(r.seq)===Number(route.stopSequence));
      const estimates=(stop.operator==='GMB'?matches.flatMap(r=>r.eta || []):matches)
        .map(r=>({at:Date.parse(stop.operator==='GMB'?r.timestamp:r.eta),remark:stop.operator==='GMB'?(r.remarks_sc||r.remarks_tc||''):(r.rmk_sc||r.rmk_tc||'')}))
        .filter(r=>Number.isFinite(r.at) && r.at>=at-30000).sort((a,b)=>a.at-b.at);
      const next=estimates[0];
      result.push({key,route:route.route,destination:route.terminal?'由'+route.origin:'往'+route.destination,
        eta:next?(next.at-at<60000?'即将到站':Math.ceil((next.at-at)/60000)+' 分钟'):'暂无时间',
        timestamp:next?next.at:null,meta:next && /scheduled|原定|未开出|未開出/i.test(next.remark)?'计划班次':'',terminal:!!route.terminal});
    }
    return result.sort((a,b)=>Number(a.terminal)-Number(b.terminal) || (a.timestamp??Infinity)-(b.timestamp??Infinity) || a.route.localeCompare(b.route,'en',{numeric:true}));
  }
  function preview(stop,snapshot,now){
    const all=rows(stop,snapshot,now),visible=all.slice(0,4);
    return {arrivals:visible.map(r=>({...r,destination:r.route+' '+r.destination,meta:''})),notice:[visible.some(r=>r.meta)?'含计划班次':'',all.length>4?'另有 '+(all.length-4)+' 项线路方向':''].filter(Boolean).join(' · ')};
  }
  function createPoller(fetcher,onChange){
    let active=false,token=0,timer=null;
    async function refresh(){
      const current=token;
      try{const snapshot=await fetcher();if(active && current===token)onChange({...snapshot,receivedAt:Date.now()});}
      catch(_){if(active && current===token)onChange(null);}
      finally{if(active && current===token)timer=setTimeout(refresh,INTERVAL);}
    }
    return {start(){this.stop();active=true;onChange(null);return refresh();},stop(){active=false;token++;clearTimeout(timer);timer=null;}};
  }
  return {url,rows,preview,createPoller,INTERVAL};
});
