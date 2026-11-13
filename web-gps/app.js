(() => {
  const $=id=>document.getElementById(id),core=CUHK_WEB_GPS,store=CUHK_GPS_STORE,transport=CUHK_GPS_TRANSPORT;
  const routes=[['1','本部线'],['2','新联线'],['2S','新联线 S'],['3','逸夫线'],['4','环迴线'],['8','西部线'],['N','晚间线'],['H','假日线'],['5','上行线'],['6A','下行线'],['6B','下行短线'],['7','逸夫下行线'],['MINI-N','收费小巴上行'],['MINI-S','收费小巴下行']];
  routes.forEach(([id,name])=>{
    const option=document.createElement('option');option.value=id;option.textContent=id+' · '+name;$('route').append(option);
    const button=document.createElement('button');button.className='line-choice'+(id.length>3?' line-choice-long':'');button.type='button';button.textContent=id;button.title=name;button.setAttribute('aria-pressed','false');
    button.onclick=()=>{$('route').value=id;$('direction').value='unknown';document.querySelectorAll('.line-choice').forEach(el=>el.setAttribute('aria-pressed',String(el===button)));$('picker-status').textContent='';};
    $('line-grid').append(button);
  });
  const map=L.map('map',{zoomControl:false,attributionControl:true}).setView([22.420,114.205],15);
  const bounds=[[22.404947145813065,114.19103800180334],[22.438487661829633,114.2171651500193]];
  const backdrop=L.imageOverlay('../assets/campus-light.png',bounds).addTo(map);
  map.attributionControl.addAttribution('© OpenStreetMap');
  const line=L.polyline([],{color:'#75429a',weight:4}).addTo(map);
  let marker=null,rows=[],busy=false,recordingClock=null,lastWarning='',renderSequence=0,theme='light';
  try{theme=localStorage.getItem('cuhk-web-gps-theme-v1')==='dark'?'dark':'light';}catch{}
  function drawIcons(){lucide.createIcons();}
  function appearance(){document.body.classList.toggle('dark',theme==='dark');backdrop.setUrl('../assets/campus-'+theme+'.png');$('theme').innerHTML='<i data-lucide="'+(theme==='dark'?'sun':'moon')+'"></i><span>'+(theme==='dark'?'切换浅色':'切换深色')+'</span>';drawIcons();}
  appearance();
  $('theme').onclick=()=>{theme=theme==='light'?'dark':'light';try{localStorage.setItem('cuhk-web-gps-theme-v1',theme);}catch{}appearance();};
  $('menu').onclick=()=>$('menu-dialog').showModal();
  $('open-queue').onclick=()=>{$('menu-dialog').close();queue();$('queue-dialog').showModal();};
  $('privacy').onclick=()=>{$('menu-dialog').close();$('privacy-dialog').showModal();};
  $('ride-privacy').onclick=()=>$('privacy-dialog').showModal();
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{const r=dialog.getBoundingClientRect();if(event.target===dialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))dialog.close();}));
  const collector=new core.Collector({geo:navigator.geolocation,store,changed:render});
  function info(text){$('status').textContent=text;}
  function render(){
    const current=collector.current,points=current?.gpsSamples||[];
    $('route').disabled=$('direction').disabled=$('consent').disabled=!!current||busy;
    $('action').disabled=$('start').disabled=busy;
    document.querySelectorAll('.line-choice').forEach(button=>{button.disabled=busy||!!current;});
    $('recording-badge').hidden=!current;
    $('action').innerHTML=current?'<i data-lucide="bus-front"></i><span>下车</span>':'<i data-lucide="bus-front"></i><span>上车</span>';
    $('state').textContent=current?current.routeId+' · 采集中':'尚未开始';
    $('points').textContent=points.length;
    $('accuracy').textContent=points.length?'±'+Math.round(points.at(-1).accuracy)+' m':'—';
    const seconds=current?Math.max(0,Math.floor((Date.now()-Date.parse(current.startedAt))/1000)):0;
    $('elapsed').textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    if(collector.warning && collector.warning!==lastWarning){info(collector.warning);lastWarning=collector.warning;}
    if(current && !collector.warning){info('仅记录本次校内乘车轨迹');lastWarning='';}
    if(points.length){
      line.setLatLngs(points.map(p=>[p.lat,p.lon]));
      const point=points.at(-1);
      if(!marker)marker=L.marker([point.lat,point.lon],{icon:L.divIcon({className:'position-dot',iconSize:[16,16],iconAnchor:[8,8]})}).addTo(map);
      else marker.setLatLng([point.lat,point.lon]);
      if(points.length===1)map.setView([point.lat,point.lon],17);
    }
    drawIcons();
  }
  const reasons={user_alight:'手动结束',page_hidden:'切出页面，已停止',page_closed:'页面关闭',reload_interrupted:'上次采集中断',duration_limit:'已到90分钟上限',sample_limit:'已到采样上限',outside_campus:'已离开校内采集范围',permission_denied:'定位权限被拒绝'};
  async function queue(){
    const sequence=++renderSequence;
    try{
      const all=await store.all();if(sequence!==renderSequence)return;
      rows=all.filter(r=>r.id!==collector.current?.id).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));
      $('queue-count').textContent=rows.length;
      $('queue').replaceChildren();
      if(!rows.length){const p=document.createElement('p');p.className='empty';p.textContent='没有待上传轨迹';$('queue').append(p);}
      rows.forEach(row=>{
        const section=document.createElement('article');section.className='queue-row';
        const heading=document.createElement('div');heading.className='queue-heading';
        const title=document.createElement('span');title.textContent=row.routeId+' 号线';
        const at=document.createElement('span');at.textContent=new Date(row.startedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});heading.append(title,at);
        const meta=document.createElement('p');meta.className='queue-meta';meta.textContent=new Date(row.startedAt).toLocaleDateString('zh-CN')+' · '+row.gpsSamples.length+' 个点 · '+(reasons[row.endReason]||'本机保存');
        const tools=document.createElement('div');tools.className='queue-tools';
        [['upload','cloud-upload','重试上传'],['export','download','导出轨迹'],['remove','trash-2','删除本机记录']].forEach(([action,glyph,label])=>{
          const button=document.createElement('button');button.className='icon';button.title=label;button.setAttribute('aria-label',label);button.innerHTML='<i data-lucide="'+glyph+'"></i>';button.disabled=busy||!!collector.current||(action==='upload'&&!row.gpsSamples.length);
          button.onclick=()=>action==='upload'?send(row):action==='export'?exportRecord(row):remove(row);tools.append(button);
        });
        section.append(heading,meta);
        if(row.uploadError){const error=document.createElement('p');error.className='queue-error';error.textContent=row.uploadError;section.append(error);}
        section.append(tools);$('queue').append(section);
      });drawIcons();
    }catch(_){info('无法读取本机记录，请检查浏览器存储权限');}
  }
  async function send(row){
    if(busy||collector.current)return;
    busy=true;render();await queue();
    try{
      await core.upload(row,transport.call,transport.hash,(done,total)=>info('正在上传 '+done+'/'+total));
      await store.remove(row.id);info('轨迹已完整上传，感谢您的数据支持');
    }catch(error){
      row.status='failed';row.uploadError=error.message||'上传失败，数据仍在本机';await store.put(row).catch(()=>{});info(row.uploadError);
    }finally{busy=false;render();await queue();}
  }
  function exportRecord(row){
    const blob=new Blob([JSON.stringify(row,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='cuhk-web-gps-'+row.startedAt.replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function remove(row){if(confirm('删除这条尚未上传的本机轨迹？删除后无法恢复。')){await store.remove(row.id);await queue();}}
  $('action').onclick=async()=>{
    if(busy)return;
    if(collector.current){busy=true;render();const row=await collector.stop('user_alight');clearInterval(recordingClock);recordingClock=null;await queue();busy=false;if(row&&transport.configured())await send(row);else{render();info('轨迹已保存本机；网页上传未启用，可先导出');}return;}
    $('picker-status').textContent='';$('ride-dialog').showModal();
  };
  $('start').onclick=async()=>{
    if(busy||collector.current)return;
    busy=true;render();
    try{
      if(!isSecureContext)throw Error('定位需要HTTPS，请通过GitHub Pages打开');
      if(!$('route').value)throw Error('请先选择校巴线路');
      const stored=await store.all();if(stored.length>=3)throw Error('本机已有3条待上传轨迹，请先上传或导出整理');
      collector.warning='';lastWarning='';
      line.setLatLngs([]);if(marker){marker.remove();marker=null;}
      await collector.start($('route').value,$('direction').value,$('consent').checked);
      $('ride-dialog').close();
      recordingClock=setInterval(()=>{
        if(!collector.current){clearInterval(recordingClock);recordingClock=null;queue();}
        else if(collector.lastSampleAt && Date.now()-collector.lastSampleAt>20000)collector.warning='定位超过20秒未更新，请保持页面打开';
        render();
      },1000);
    }catch(error){$('picker-status').textContent=error.message;}finally{busy=false;render();await queue();}
  };
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden && collector.current){collector.stop('page_hidden').then(queue);info('已停止采集并保存在本机，回来后可上传');}
  });
  window.addEventListener('pagehide',()=>{if(collector.current)collector.stop('page_closed');});
  window.addEventListener('beforeunload',event=>{if(collector.current||busy){event.preventDefault();event.returnValue='';}});
  $('upload-state').textContent=transport.configured()?'上传至项目腾讯云，原始轨迹不公开':'网页上传尚未启用；目前可本机采集和导出';
  (async()=>{
    try{for(const row of await store.all())if(row.status==='recording'){row.status='ready';row.endReason='reload_interrupted';row.endedAt=row.gpsSamples.at(-1)?.timestamp||row.startedAt;await store.put(row);}}
    catch(_){info('浏览器存储不可用，请检查隐私设置');}
    await queue();render();if(!transport.configured())info('云上传待启用；本机采集、保存和导出可用');
  })();
})();
