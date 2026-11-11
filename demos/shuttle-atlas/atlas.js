(() => {
  const $=selector=>document.querySelector(selector);
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon=name=>`<i data-lucide="${name}"></i>`;
  const data=JSON.parse(JSON.stringify(window.CUHK_BUS_DATA));
  CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(data,'2026-09');
  const params=new URLSearchParams(location.search),comparing=params.get('compare')==='1';
  const geographic=!comparing&&['geographic','semi-topology'].includes(params.get('layout'));
  const schematize=geographic&&params.get('layout')==='semi-topology';
  const atlas=geographic?GeographicAtlas.build(data,ShuttleAtlas,{schematize}):ShuttleAtlas;
  const designs=AtlasDesigns,baseRoutes=geographic?atlas.routes:atlas.build(data,{includeMeetClass:true}),stations=atlas.stations;
  const state={route:null,station:null,group:'all',zoom:1,x:0,y:0,fit:1,design:designs.get(comparing?params.get('style'):'a').id};
  let profile=designs.get(state.design),routes=designs.colorize(baseRoutes,profile);
  const map=$('#map'),svg=$('#network'),drawing=$('#drawing'),detail=$('#detail');
  let compact=matchMedia('(max-width:760px)').matches;
  const dimensions=()=>[atlas.width,atlas.height];
  const badge=r=>`<span class="route-badge" style="--route-color:${r.color};--route-ink:${r.ink||'#fff'}">${r.id}</span>`;
  const routeById=id=>routes.find(r=>r.id===id);
  const serves=(r,id)=>r.source.stops.includes(id);
  const inGroup=r=>atlas.inGroup(r,state.group);
  const enabled=r=>inGroup(r) && (!state.route || r.id===state.route) && (!state.station || serves(r,state.station));
  const memberIds=Object.keys(stations).filter(id=>routes.some(r=>serves(r,id)));
  function renderMap(){
    svg.dataset.design=profile.id;
    svg.dataset.geographic=String(geographic);
    $('#diagram-style').textContent=designs.svgCss(profile)+(geographic?GeographicAtlas.svgCss(profile):'');
    drawing.innerHTML=(geographic?GeographicAtlas:designs).diagram({atlas,routes,data,design:profile,activeIds:new Set(routes.filter(enabled).map(r=>r.id)),selectedRoute:state.route,selectedStation:state.station});
  }
  function applyDesign(){
    profile=designs.get(state.design);routes=designs.colorize(baseRoutes,profile);
    document.body.dataset.design=profile.family||profile.id;
    document.body.dataset.variant=profile.id;
    document.body.dataset.presentation=comparing?'compare':'selected';
    for(const [key,value] of Object.entries(designs.variables(profile)))document.documentElement.style.setProperty(key,value);
    document.querySelector('meta[name="theme-color"]').content=profile.header;
    $('#design-tabs').innerHTML=designs.choices(profile.family).map(p=>`<button class="design-tab" data-design-choice="${p.id}" aria-label="方案 ${p.badge||p.id.toUpperCase()} ${p.name}" aria-pressed="${p.id===profile.id}"><b>${p.badge||p.id.toUpperCase()}</b><span>${p.name}</span></button>`).join('');
    $('.header-actions a').href=profile.family==='a'?'compare-a.html':'compare.html';
  }
  function renderList(){
    $('#route-list').innerHTML=routes.map(r=>`<button class="route-button${inGroup(r)?'':' dim'}" data-route="${r.id}" aria-pressed="${state.route===r.id}" aria-label="${r.id}号线 ${r.label}">${badge(r)}<span class="route-name">${r.id==='2S'?'新联线':r.label}</span>${icon(state.route===r.id?'check':'chevron-right')}</button>`).join('');
    document.querySelectorAll('[data-group]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.group===state.group));
  }
  function renderDetail(){
    detail.hidden=!state.route&&!state.station;
    $('.map-area').classList.toggle('with-detail',!detail.hidden);
    if(detail.hidden){detail.innerHTML='';return;}
    const close=`<button class="icon-button" data-close aria-label="关闭详情">${icon('x')}</button>`;
    if(state.route){
      const r=routeById(state.route);
      detail.style.setProperty('--route-color',r.color);
      detail.innerHTML=`<div class="detail-top">${badge(r)}<h3>${r.label}</h3>${close}</div><p class="detail-subtitle">${escape(r.source.schedule.summary)}</p>${(r.source.schedule.notes||[]).filter(t=>!/公众假期停驶|星期日及公众假期服务/.test(t)).map(t=>`<p class="detail-note">${escape(t)}</p>`).join('')}<ol>${r.source.stops.map((id,i)=>{
        const direction=r.source.stopDirections?.[i]||'';
        const note=atlas.conditional(r.source,i)||direction||(i===0?'起点':i===r.source.stops.length-1?'终点':'');
        return `<li><button class="stop-row" data-focus="${id}"><span>${stations[id].name}${direction&&note!==direction?' · '+direction:''}</span><small>${note}</small></button></li>`;
      }).join('')}</ol>`;
    }else{
      const id=state.station,s=stations[id],rs=routes.filter(r=>serves(r,id));
      detail.innerHTML=`<div class="detail-top"><h3>${escape(data.stops[id].name)}</h3>${close}</div><p class="detail-subtitle">${s.en}</p><div class="station-routes">${rs.map(r=>`<button class="station-route" data-route="${r.id}" aria-label="查看${r.id}号线">${badge(r)}</button>`).join('')}</div>${rs.map(r=>{
        const occurrences=r.source.stops.map((s,i)=>s===id?i:-1).filter(i=>i>=0);
        return `<p class="station-sequence"><b>${r.id}</b> ${occurrences.map(i=>`${r.source.stopDirections?.[i]||'第 '+(i+1)+' 站'}${atlas.conditional(r.source,i)?' · '+atlas.conditional(r.source,i):''}，${i<r.source.stops.length-1?'往 '+stations[r.source.stops[i+1]].name:'终点'}`).join('；')}</p>`;
      }).join('')}`;
    }
  }
  function render(){
    renderMap();renderList();renderDetail();lucide.createIcons();
    $('#map-caption').textContent=state.route?state.route+'号线 · '+routeById(state.route).label:state.station?stations[state.station].name:atlas.groupLabel(state.group);
    $('#map-count').textContent=`${routes.filter(enabled).length} 条线路 / ${memberIds.filter(id=>routes.some(r=>enabled(r)&&serves(r,id))).length} 站`;
  }
  function chooseRoute(id){state.route=state.route===id?null:id;state.station=null;if(state.route&&!inGroup(routeById(id)))state.group='all';render();detail.scrollTop=0;}
  function clear(){state.route=null;state.station=null;render();}
  document.addEventListener('click',event=>{
    const choice=event.target.closest('[data-design-choice]');
    if(choice){
      state.design=choice.dataset.designChoice;applyDesign();render();
      const url=new URL(location.href);url.searchParams.set('style',state.design);
      try{history.replaceState(null,'',url);}catch{}
      return;
    }
    if(event.target.closest('[data-close]')){clear();return;}
    const focus=event.target.closest('[data-focus]');if(focus){focusStation(focus.dataset.focus);return;}
    const r=event.target.closest('[data-route]');if(r){if(!suppressClick)chooseRoute(r.dataset.route);return;}
    const s=event.target.closest('[data-station]');if(s){if(!suppressClick){state.route=null;state.station=s.dataset.station;render();detail.scrollTop=0;}return;}
    const group=event.target.closest('[data-group]');if(group){state.group=group.dataset.group;state.route=null;state.station=null;render();}
  });
  svg.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.dataset.station){e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}});
  $('#reset').onclick=()=>{state.group='all';clear();fit();};
  function transform(){drawing.setAttribute('transform',`translate(${state.x} ${state.y}) scale(${state.zoom})`);svg.classList.toggle('zoomed',state.zoom>state.fit*1.4);$('#zoom-out').disabled=state.zoom<=state.fit*.75;$('#zoom-in').disabled=state.zoom>=state.fit*5;}
  function fit(initial=false){const w=map.clientWidth,h=map.clientHeight,[dw,dh]=dimensions();state.fit=Math.min((w-38)/dw,(h-94)/dh);state.zoom=state.fit*(initial&&compact&&w<600?2.2:1);state.x=(w-dw*state.zoom)/2;state.y=(h-dh*state.zoom)/2+7;transform();}
  function zoomAt(value,x=map.clientWidth/2,y=map.clientHeight/2){const z=Math.max(state.fit*.75,Math.min(state.fit*5,value));state.x=x-(x-state.x)*z/state.zoom;state.y=y-(y-state.y)*z/state.zoom;state.zoom=z;transform();}
  function focusStation(id){const s=stations[id];state.zoom=Math.max(state.zoom,state.fit*2);state.x=map.clientWidth*.48-s.x*state.zoom;state.y=map.clientHeight*.3-s.y*state.zoom;transform();drawing.querySelectorAll('.station').forEach(g=>g.classList.toggle('selected',g.dataset.station===id));}
  $('#zoom-in').onclick=()=>zoomAt(state.zoom*1.3);$('#zoom-out').onclick=()=>zoomAt(state.zoom/1.3);$('#fit').onclick=()=>fit();
  map.addEventListener('wheel',e=>{e.preventDefault();const b=map.getBoundingClientRect();zoomAt(state.zoom*Math.exp(-e.deltaY*.0015),e.clientX-b.left,e.clientY-b.top);},{passive:false});
  const pointers=new Map();let gesture=null,suppressClick=false;
  map.addEventListener('pointerdown',e=>{if(e.button>0)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);const ps=[...pointers.values()];gesture={x:state.x,y:state.y,zoom:state.zoom,start:ps[0],center:ps.length>1?[(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2]:ps[0],distance:ps.length>1?Math.hypot(ps[1][0]-ps[0][0],ps[1][1]-ps[0][1]):0};suppressClick=false;});
  map.addEventListener('pointermove',e=>{if(!pointers.has(e.pointerId)||!gesture)return;pointers.set(e.pointerId,[e.clientX,e.clientY]);const ps=[...pointers.values()];if(ps.length>1&&gesture.distance){const b=map.getBoundingClientRect(),center=[(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2],distance=Math.hypot(ps[1][0]-ps[0][0],ps[1][1]-ps[0][1]);state.zoom=gesture.zoom;state.x=gesture.x;state.y=gesture.y;zoomAt(gesture.zoom*distance/gesture.distance,gesture.center[0]-b.left,gesture.center[1]-b.top);state.x+=center[0]-gesture.center[0];state.y+=center[1]-gesture.center[1];suppressClick=true;}else if(ps.length===1){const dx=ps[0][0]-gesture.start[0],dy=ps[0][1]-gesture.start[1];if(Math.hypot(dx,dy)>4)suppressClick=true;if(suppressClick){state.x=gesture.x+dx;state.y=gesture.y+dy;}}if(suppressClick){map.setPointerCapture(e.pointerId);map.classList.add('dragging');}transform();});
  function pointerEnd(e){pointers.delete(e.pointerId);const remaining=[...pointers.values()];gesture=remaining.length?{x:state.x,y:state.y,zoom:state.zoom,start:remaining[0],center:remaining[0],distance:0}:null;map.classList.remove('dragging');if(!pointers.size)setTimeout(()=>{suppressClick=false;},0);}
  map.addEventListener('pointerup',pointerEnd);map.addEventListener('pointercancel',pointerEnd);
  map.addEventListener('click',e=>{if(!suppressClick&&!e.target.closest('[data-route],[data-station]'))clear();});
  map.addEventListener('keydown',e=>{if(e.key==='Escape'){clear();return;}if(e.key==='+'||e.key==='='){zoomAt(state.zoom*1.3);e.preventDefault();}if(e.key==='-'){zoomAt(state.zoom/1.3);e.preventDefault();}if(e.key==='0'){fit();e.preventDefault();}});
  $('#export').onclick=()=>{
    const [width,height]=dimensions(),copy=svg.cloneNode(true);copy.setAttribute('viewBox',`0 -100 ${width} ${height+240}`);copy.setAttribute('width',width);copy.setAttribute('height',height+240);copy.querySelector('#drawing').removeAttribute('transform');
    copy.querySelectorAll('.line-hit,.station-hit').forEach(n=>n.remove());
    const bg=document.createElementNS('http://www.w3.org/2000/svg','rect');bg.setAttribute('width',width);bg.setAttribute('height',height+240);bg.setAttribute('y',-100);bg.setAttribute('fill',profile.paper);copy.insertBefore(bg,copy.querySelector('#drawing'));
    const key=document.createElementNS('http://www.w3.org/2000/svg','g');
    key.innerHTML=`<text x="50" y="-42" font-family="sans-serif" font-size="32" font-weight="700" fill="${profile.ink}">香港中文大学 · 校巴线路图 · ${profile.id.toUpperCase()}</text>${routes.map((r,i)=>{const x=50+(i%6)*(width-100)/6,y=height+25+Math.floor(i/6)*46;return `<rect x="${x}" y="${y-23}" width="43" height="30" rx="4" fill="${r.color}"/><text x="${x+21.5}" y="${y-2}" text-anchor="middle" font-family="sans-serif" font-size="21" font-weight="700" fill="${r.ink}">${r.id}</text><text x="${x+53}" y="${y-2}" font-family="sans-serif" font-size="21" fill="${profile.ink}">${r.label}</text>`;}).join('')}<text x="50" y="${height+125}" font-family="sans-serif" font-size="16" fill="${profile.muted}">2026 年 9 月线路方案 · ${geographic?'北向上，线路作平行偏移':'线路示意，非地理比例'} · 资料：中大交通处</text>`;
    copy.append(key);
    key.firstElementChild.textContent=`香港中文大学 · 校巴线路图 · ${profile.badge||profile.id.toUpperCase()}`;
    if(schematize)key.lastElementChild.textContent='2026 年 9 月线路方案 · 北向上，线路简化，非导航地图 · 资料：中大交通处';
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`CUHK-shuttle-${profile.badge||profile.id.toUpperCase()}.svg`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let previousSize=null;
  new ResizeObserver(()=>{
    const next=matchMedia('(max-width:760px)').matches,w=map.clientWidth,h=map.clientHeight;
    if(!previousSize||next!==compact){compact=next;fit(true);}
    else{
      const worldX=(previousSize.w/2-state.x)/state.zoom,worldY=(previousSize.h/2-state.y)/state.zoom;
      state.fit=Math.min((w-38)/atlas.width,(h-94)/atlas.height);
      state.zoom=Math.max(state.fit*.75,Math.min(state.fit*5,state.zoom));
      state.x=w/2-worldX*state.zoom;state.y=h/2-worldY*state.zoom;transform();
    }
    previousSize={w,h};
  }).observe(map);
  if(geographic){
    $('.map-footer > span').textContent=schematize?'北向上 · 线路示意':'北向上 · 地理位置版';
    $('.key-conditional').style.cssText='width:11px;height:11px;border:2px dashed var(--muted);border-radius:50%';
    $('.key-conditional + span').textContent='部分班次停靠';
  }
  applyDesign();render();fit(true);
})();
