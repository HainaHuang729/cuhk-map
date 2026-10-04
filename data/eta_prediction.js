(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  root.CUHK_ETA_PREDICTION=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  let model=null;
  function setModel(value){
    if(!value||value.schema!=="cuhk_eta_prediction_v1"||value.routeScheme!=="2026-09"||!value.routes||typeof value.routes!=="object")return false;
    const routes=Object.values(value.routes);
    if(!routes.length||routes.some(item=>!Array.isArray(item.stopIds)||!item.stopIds.length||!item.profiles||!item.profiles.all))return false;
    for(const item of routes)for(const p of Object.values(item.profiles)){
      if(!Array.isArray(p.offsets)||!Array.isArray(p.dwellSeconds)||p.offsets.length!==item.stopIds.length||p.dwellSeconds.length!==item.stopIds.length)return false;
      if(p.offsets.some((x,i)=>!Number.isFinite(x)||x<0||x>180||(i>0&&x<=p.offsets[i-1])))return false;
      if(p.dwellSeconds.some(x=>!Number.isFinite(x)||x<0||x>180))return false;
    }
    model=value;return true;
  }
  function bucket(at){
    const parts=new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Hong_Kong",hour:"2-digit",minute:"2-digit",weekday:"short",hourCycle:"h23"}).formatToParts(at);
    const fields=Object.fromEntries(parts.map(p=>[p.type,p.value]));
    const minutes=Number(fields.hour)*60+Number(fields.minute);
    const day=fields.weekday==="Sun"?"sunday":fields.weekday==="Sat"?"saturday":"weekday";
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
  return {setModel,bucket,profile,offset,segment,dwell};
});
