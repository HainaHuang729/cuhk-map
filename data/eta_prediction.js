(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CUHK_ETA_PREDICTION=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  let model=null;
  function setModel(value){
    if(!value||value.schema!=="cuhk_eta_prediction_v1"||value.routeScheme!=="2026-09"||!value.routes||typeof value.routes!=="object"||Array.isArray(value.routes))return false;
    const routes=Object.values(value.routes);
    if(!routes.length||routes.some(item=>!item||!Array.isArray(item.stopIds)||!item.stopIds.length||item.stopIds.some(id=>typeof id!=="string"||!id)||!item.profiles||typeof item.profiles!=="object"||Array.isArray(item.profiles)||!item.profiles.all))return false;
    for(const item of routes)for(const p of Object.values(item.profiles)){
      if(!p||!Array.isArray(p.offsets)||!Array.isArray(p.dwellSeconds)||p.offsets.length!==item.stopIds.length||p.dwellSeconds.length!==item.stopIds.length)return false;
      if(p.offsets.some((x,i)=>!Number.isFinite(x)||x<0||x>180||(i>0&&x<=p.offsets[i-1])))return false;
      if(p.dwellSeconds.some(x=>!Number.isFinite(x)||x<0||x>180))return false;
    }
    model=value;return true;
  }
  function bucket(at){
    // Native mini-program engines do not consistently support Intl.formatToParts.
    const hk=new Date(at.getTime()+8*60*60*1000);
    const minutes=hk.getUTCHours()*60+hk.getUTCMinutes();
    const weekday=hk.getUTCDay();
    const day=weekday===0?"sunday":weekday===6?"saturday":"weekday";
    const period=minutes<330?"overnight":minutes<450?"early_morning":minutes<570?"morning_peak":minutes<690?"morning":minutes<840?"lunch":minutes<990?"afternoon":minutes<1170?"evening_peak":"night";
    return `${day}_${period}`;
  }
  function profile(route,at=new Date()){
    const item=model&&model.routes[String(route.id)];
    if(!item||item.stopIds.join("|")!==(route.stops||[]).join("|"))return null;
    return item.profiles[bucket(at)]||item.profiles.all||null;
  }
  function offset(route,index,at){const p=profile(route,at);return p&&Number.isFinite(p.offsets[index])?p.offsets[index]:NaN;}
  function segment(route,index,at){const p=profile(route,at);return p&&index>0?Math.max(0.2,p.offsets[index]-p.offsets[index-1]):NaN;}
  function dwell(route,index,at){const p=profile(route,at);return p&&Number.isFinite(p.dwellSeconds[index])?p.dwellSeconds[index]:NaN;}
  function fallbackSegment(meters){
    const f=model&&model.trainingPeriod&&model.fallback;
    return f&&Number.isFinite(meters)&&meters>=0&&Number.isFinite(f.arrivalSecondsPerMeter)&&f.arrivalSecondsPerMeter>0
      ?Math.max(0.2,meters*f.arrivalSecondsPerMeter/60):NaN;
  }
  function fallbackDwell(){const f=model&&model.trainingPeriod&&model.fallback;return f&&Number.isFinite(f.unobservedDwellSeconds)?f.unobservedDwellSeconds:NaN;}
  function evidence(route,upToStopIndex=Infinity){
    if(!model||!model.trainingPeriod||!route||!Array.isArray(route.stops))return null;
    const item=model.routes[String(route.id)];
    const limit=Math.min(route.stops.length-1,Number.isFinite(upToStopIndex)?Math.max(0,Math.floor(upToStopIndex)):route.stops.length-1);
    const rows=item&&item.stopIds.join("|")===route.stops.join("|")&&Array.isArray(item.segmentEvidence)?item.segmentEvidence.slice(0,limit):[];
    return {samples:rows.reduce((sum,row)=>sum+(Number(row.samples)||0),0),covered:rows.filter(row=>!row.estimated&&row.samples>0).length,total:limit,period:model.trainingPeriod.id};
  }
  return {setModel,bucket,profile,offset,segment,dwell,fallbackSegment,fallbackDwell,evidence};
});
