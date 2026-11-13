window.CUHK_GPS_TRANSPORT = (()=>{
  const config=window.CUHK_WEB_GPS_CONFIG,key='cuhk-web-gps-upload-token-v1';
  let token='',authorizing,lastRequest=0;
  try{token=localStorage.getItem(key)||'';}catch{}
  function configured(){return config.enabled===true&&/^https:\/\//.test(config.endpoint||'');}
  async function request(data,credential=token) {
    if(!configured())throw Error('网页上传尚未启用，轨迹仍在本机，可先导出');
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,600-(Date.now()-lastRequest))));lastRequest=Date.now();
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000);
    try {
      const response=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(credential?{Authorization:'Bearer '+credential}:{})},body:JSON.stringify(data),signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer',cache:'no-store'});
      let result;
      try{result=await response.json();}catch{throw Error(response.status===429?'上传请求较多，请稍后重试，轨迹仍在本机':'上传服务暂不可用，轨迹仍在本机');}
      if(response.status===429)return {ok:false,code:'daily_limit',message:result.message||'上传请求较多，请稍后重试，轨迹仍在本机'};
      if(!response.ok&&!result.code)throw Error('上传未确认，轨迹仍在本机');
      return result;
    } catch(error) {
      if(error.name==='AbortError')throw Error('上传超时，轨迹仍在本机，可重试或导出');
      throw error;
    } finally {clearTimeout(timer);}
  }
  async function authorize() {
    if(!authorizing)authorizing=(async()=>{
      const result=await request({action:'authorize'});
      if(!result.ok||typeof result.token!=='string')throw Error(result.message||'无法建立上传身份，请稍后重试');
      token=result.token;try{localStorage.setItem(key,token);}catch{}return token;
    })().finally(()=>{authorizing=null;});
    return authorizing;
  }
  async function call(data) {
    if(!token)await authorize();
    let result=await request(data);
    if(result.code==='unauthenticated'){await authorize();result=await request(data);}
    return result;
  }
  async function hash(text) {
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  return {configured,call,hash};
})();
