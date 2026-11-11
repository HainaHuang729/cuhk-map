(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const DATA = window.CAMPUS_SAMPLE;
  const icon = (name) => `<i data-lucide="${name}" aria-hidden="true"></i>`;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icons = () => window.lucide.createIcons();
  const latlng = (coord) => [coord[1], coord[0]];
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const state = {theme:'light', reduced:media.matches, menu:false, sheet:null, selected:null, filter:'all', layers:{bus:true,stop:false,dining:false}, route:'1', saved:new Set(), courses:new Set()};
  const colors = {'1':'#613982','2':'#877199','8':'#b28732'};
  const vehicles = [
    {id:'1', progress:.32, next:'邵逸夫堂', eta:3},
    {id:'2', progress:.51, next:'新亚书院', eta:6},
    {id:'8', progress:.44, next:'科学馆', eta:8},
  ];
  const routes = new Map(DATA.routes.map(r => [r.id,window.MOTION_ROUTE_GEOMETRY.withShawTurnaround(r)]));
  const badge = id => `<span class="route-badge" style="--route:${colors[id] || '#613982'}">${escape(id)}</span>`;
  const layerGroups = {bus:L.layerGroup(),stop:L.layerGroup(),dining:L.layerGroup()};
  const selectedLayer = L.layerGroup();
  const routeLayer = L.layerGroup();
  const map = L.map('map',{zoomControl:false,attributionControl:false,preferCanvas:true,minZoom:15,maxZoom:19,zoomAnimation:!state.reduced,fadeAnimation:false}).setView([22.4196,114.2069],16);
  selectedLayer.addTo(map); routeLayer.addTo(map); layerGroups.bus.addTo(map);
  const night = () => state.theme === 'dark';
  const background = [];
  const polygons = DATA.background.features.filter(f => /Polygon/.test(f.geometry.type));
  const geo = (features,style) => { const layer=L.geoJSON(features,{interactive:false,style}).addTo(map); background.push(layer);return layer; };
  geo(polygons.filter(f => !f.properties.building && !f.properties.amenity && f.properties.natural !== 'water' && f.properties.landuse !== 'education'), () => ({stroke:false,fillOpacity:.7,fillColor:night()?'#30453a':'#d9e3d3'}));
  geo(polygons.filter(f => f.properties.natural==='water'||f.properties.leisure==='swimming_pool'), () => ({weight:.5,color:night()?'#405d66':'#bfd5da',fillColor:night()?'#304b54':'#d0e3e6',fillOpacity:1}));
  geo(polygons.filter(f => f.properties.building), () => ({weight:.7,color:night()?'#5b5666':'#cdd0cc',fillColor:night()?'#45424e':'#e0e2de',fillOpacity:1}));
  const roads=DATA.background.features.filter(f=>f.geometry.type==='LineString' && f.properties.highway);
  const roadWidth=f=>['motorway','secondary','tertiary'].includes(f.properties.highway)?8:['residential','unclassified','service'].includes(f.properties.highway)?5:1.2;
  geo(roads,f=>({weight:roadWidth(f)+1.5,color:night()?'#4b4e4c':'#cdd4cd',opacity:.9}));
  geo(roads,f=>({weight:roadWidth(f),color:night()?'#797480':'#fffefa',opacity:1,dashArray:f.properties.highway==='steps'?'2 3':null}));
  const majorLabels=['university_station','united_college','new_asia','shaw_college','sh_ho','university_admin','science_centre'];
  for (const id of majorLabels) {
    const s=DATA.stops[id];
    L.marker(latlng(s.coord),{interactive:false,icon:L.divIcon({className:'',html:`<div class="map-label ${id.includes('college')?'major':''}">${escape(s.name)}</div>`,iconSize:[0,0],iconAnchor:[0,-17]})}).addTo(map);
  }
  const routeMeasures=new Map();
  function positionAt(id,progress) {
    const path=routes.get(id).path;
    if(!routeMeasures.has(id)) {
      const lengths=[0];
      for(let i=1;i<path.length;i++) lengths.push(lengths[i-1]+Math.hypot((path[i][0]-path[i-1][0])*Math.cos(path[i][1]*Math.PI/180),path[i][1]-path[i-1][1]));
      routeMeasures.set(id,lengths);
    }
    const lengths=routeMeasures.get(id),distance=lengths.at(-1)*progress;
    let i=1;while(i<lengths.length-1 && lengths[i]<distance)i++;
    const a=path[i-1],b=path[i],t=(distance-lengths[i-1])/Math.max(.0000001,lengths[i]-lengths[i-1]);
    return {coord:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],heading:Math.atan2((b[0]-a[0])*Math.cos(a[1]*Math.PI/180),b[1]-a[1])*180/Math.PI};
  }
  for(const v of vehicles) {
    const pos=positionAt(v.id,v.progress);
    v.marker=L.marker(latlng(pos.coord),{zIndexOffset:400,icon:L.divIcon({className:'',html:`<button class="map-vehicle" aria-label="${v.id}号校巴" style="--route:${colors[v.id]};--heading:${pos.heading}deg"><span class="vehicle-arrow"></span><span class="vehicle-number">${v.id}</span></button>`,iconSize:[44,44],iconAnchor:[22,22]})}).addTo(layerGroups.bus);
    v.marker.on('click',()=>selectBus(v.id));
  }
  for(const [id,s] of Object.entries(DATA.stops)) {
    if(!routes.get('1').stops.includes(id) && !['new_asia','united_college','science_centre','shaw_college'].includes(id))continue;
    L.marker(latlng(s.coord),{icon:L.divIcon({className:'',html:`<div class="poi-shell"><button class="poi-button stop" aria-label="${escape(s.name)}站">站</button></div>`,iconSize:[40,40],iconAnchor:[20,20]})}).addTo(layerGroups.stop).on('click',()=>selectPlace({id:`stop:${id}`,name:s.name,coord:s.coord,type:'stop',detail:'校巴站点'}));
  }
  const diningIds=['node/2036916798','node/5995002268','node/2036864525','fno/wys-student-canteen'];
  const diningNames={'node/2036916798':'善衡书院学生膳堂','node/5995002268':'庞万伦 Paper & Coffee','node/2036864525':'联合书院学生膳堂','fno/wys-student-canteen':'伍宜孙书院学生膳堂'};
  const dining=DATA.dining.filter(d=>diningIds.includes(d.id)).map(d=>({...d,name:diningNames[d.id],type:'dining',detail:d.floor}));
  for(const d of dining) L.marker(latlng(d.coord),{icon:L.divIcon({className:'',html:`<div class="poi-shell"><button class="poi-button" aria-label="${escape(d.name)}">食</button></div>`,iconSize:[40,40],iconAnchor:[20,20]})}).addTo(layerGroups.dining).on('click',()=>selectPlace(d));
  const buildingIds=['science_centre','yasumoto','shaw_hall','university_library'];
  const places=[...dining,...Object.entries(DATA.stops).map(([id,s])=>({id:`stop:${id}`,...s,type:'stop',detail:'校巴站点'})),...buildingIds.map(id=>({id:`building:${id}`,...DATA.stops[id],type:'building',detail:'教学与校园设施'}))];
  const courses=[{id:'course-1',name:'人工智能导论',code:'CSCI 3230',time:'周一 10:30 - 12:15',place:'科学馆',building:'science_centre'}, {id:'course-2',name:'中国文化与社会',code:'UGEA 1000',time:'周三 14:30 - 16:15',place:'康本国际学术园',building:'yasumoto'}, {id:'course-3',name:'设计思维',code:'DESN 2001',time:'周五 11:30 - 13:15',place:'邵逸夫堂',building:'shaw_hall'}];
  let searchTimer, toastTimer, closeTimer, confirmTimer, lastFocus;
  const sheet=$('sheet');
  function reduced() { return state.reduced || media.matches; }
  function setReduced(value) {state.reduced=value;document.documentElement.dataset.reduced=String(reduced());$('reduce-motion').checked=reduced();}
  media.addEventListener('change',()=>setReduced(state.reduced));
  setReduced(state.reduced);
  function theme(value) {
    state.theme=value;document.documentElement.dataset.theme=value;
    background.forEach(layer=>layer.resetStyle());
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===value)));
    $('theme-button').innerHTML=icon(value==='dark'?'sun':'moon');
    $('theme-button').setAttribute('aria-label',value==='dark'?'切换浅色':'切换深色');
    $('theme-button').title=value==='dark'?'切换浅色':'切换深色';icons();
  }
  function closeSearch() {clearTimeout(searchTimer);$('search-panel').hidden=true;$('search').setAttribute('aria-expanded','false');}
  function menu(open) {
    if(open){closeSheet(false);closeSearch();lastFocus=document.activeElement;}
    state.menu=open;$('sidebar').classList.toggle('open',open);$('sidebar').setAttribute('aria-hidden',String(!open));$('sidebar').inert=!open;
    $('menu-scrim').hidden=!open;$('menu-button').setAttribute('aria-expanded',String(open));$('menu-button').setAttribute('aria-label',open?'关闭侧边栏':'打开侧边栏');
    if(open)$('reset').focus({preventScroll:true});else if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
  }
  function showSheet(kind,html) {
    clearTimeout(closeTimer);clearTimeout(confirmTimer);closeSearch();if(state.menu)menu(false);
    if(!state.sheet)lastFocus=document.activeElement;
    state.sheet=kind;$('sheet-content').innerHTML=html;
    sheet.inert=false;sheet.setAttribute('aria-hidden','false');sheet.style.transform='';sheet.classList.add('open');$('sheet-scrim').hidden=false;$('dock').classList.add('hidden');$('dock').inert=true;
    $('sheet-content').scrollTop=0;icons();$('sheet-handle').focus({preventScroll:true});
  }
  function clearSelection() {routeLayer.clearLayers();selectedLayer.clearLayers();vehicles.forEach(v=>v.marker.getElement()?.querySelector('.map-vehicle').classList.remove('selected'));state.selected=null;}
  function closeSheet(restore=true) {
    clearTimeout(confirmTimer);state.sheet=null;sheet.classList.remove('open','dragging');sheet.style.transform='';sheet.inert=true;sheet.setAttribute('aria-hidden','true');$('sheet-scrim').hidden=true;$('dock').classList.remove('hidden');$('dock').inert=false;clearSelection();
    closeTimer=setTimeout(()=>{if(!state.sheet)$('sheet-content').innerHTML='';},reduced()?0:270);
    if(restore && lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
  }
  function toast(message) {
    clearTimeout(toastTimer);$('toast-text').textContent=message;$('toast').classList.remove('visible');
    void $('toast').offsetWidth;$('toast').classList.add('visible');toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2400);
  }
  function drawRoute(id) {
    routeLayer.clearLayers();
    const coords=routes.get(id).path.map(latlng);
    L.polyline(coords,{weight:8,color:night()?'#28252f':'#ffffff',opacity:.95,interactive:false}).addTo(routeLayer);
    L.polyline(coords,{weight:4,color:colors[id],opacity:.9,interactive:false}).addTo(routeLayer);
  }
  function selectBus(id) {
    clearSelection();const v=vehicles.find(v=>v.id===id);state.selected={type:'bus',id};drawRoute(id);
    v.marker.getElement()?.querySelector('.map-vehicle').classList.add('selected');
    const route=routes.get(id);let next=route.progress.findIndex(p=>p>v.progress);if(next<0)next=1;
    const stops=route.stops.slice(Math.max(0,next-1),next+3);
    showSheet('bus',`<div class="sheet-heading">${badge(id)}<div><h2 id="sheet-title">${escape(route.name)}</h2><p>穿梭校巴</p></div>${icon('bus-front')}</div><div class="eta-line"><div><p>下一站</p><strong>${escape(v.next)}</strong></div><div class="eta-value"><b>${v.eta}</b><span>分钟</span></div></div><ol class="stop-list">${stops.map((stop,i)=>`<li class="${i===0?'passed':i===1?'next':''}"><span>${escape(DATA.stops[stop].name)}</span>${i===0?'<small>已驶离</small>':i===1?'<small>预计到达</small>':''}</li>`).join('')}</ol><div class="sheet-actions"><button data-sheet-action="refresh-eta">${icon('refresh-cw')}刷新预估</button><button data-sheet-action="board" data-route="${id}">${icon('log-in')}上车</button></div>`);
  }
  function selectPlace(place) {
    closeSearch();$('search').blur();clearSelection();state.selected=place;
    selectedLayer.addLayer(L.marker(latlng(place.coord),{interactive:false,zIndexOffset:500,icon:L.divIcon({className:'',html:'<div class="pin-focus"></div>',iconSize:[18,18],iconAnchor:[9,9]})}));
    // Keep the selected location above the sheet, without tying camera motion to selection clearing.
    const offset=innerWidth<=600?100:130;
    const point=map.project(latlng(place.coord),map.getZoom());
    map.panTo(map.unproject(point.add([0,offset]),map.getZoom()),{animate:!reduced(),duration:.25});
    let details=place.type==='dining'?`<div class="info-line">${icon('map-pin')}<span>${escape(place.detail)}</span></div><div class="info-line">${icon('clock-3')}<span>11:00 - 20:00</span></div>`:place.type==='stop'?`<div class="info-line">${icon('bus-front')}<span>途经线路</span></div><div class="bus-shortcuts">${vehicles.map(v=>`<button class="bus-shortcut" data-sheet-action="bus" data-route="${v.id}">${badge(v.id)}<span><strong>${v.eta}</strong><small>分钟</small></span></button>`).join('')}</div>`:`<div class="info-line">${icon('map-pin')}<span>${escape(place.detail)}</span></div><div class="info-line">${icon('calendar-days')}<span>今天暂无日程</span></div>`;
    showSheet('place',`<div class="sheet-heading"><div><h2 id="sheet-title">${escape(place.name)}</h2><p>香港中文大学</p></div>${icon(place.type==='dining'?'utensils':place.type==='stop'?'map-pin':'building-2')}</div>${details}<div class="sheet-actions"><button data-sheet-action="save" aria-pressed="${state.saved.has(place.id)}">${icon(state.saved.has(place.id)?'check':'bookmark')}${state.saved.has(place.id)?'已收藏':'收藏'}</button><button data-sheet-action="back-map">${icon('map')}回到地图</button></div>`);
  }
  function boarding(id='1') {
    clearSelection();state.route=id;
    showSheet('board',`<div class="sheet-heading"><div><h2 id="sheet-title">选择校巴</h2><p>你正在乘坐哪条线路？</p></div>${icon('bus-front')}</div><div class="boarding-location">${icon('map-pin')}邵逸夫堂</div><div class="choice-list">${vehicles.map(v=>`<button class="route-choice ${v.id===id?'selected':''}" data-sheet-action="choose-route" data-route="${v.id}" aria-pressed="${v.id===id}">${badge(v.id)}<span class="choice-text">${escape(routes.get(v.id).name)}<small>${escape(v.id==='8'?'往科学馆、新亚书院':v.id==='2'?'往新亚书院、联合书院':'往行政楼、善衡书院')}</small></span><span class="choice-circle">${icon('check')}</span></button>`).join('')}</div><button class="primary pressable" data-sheet-action="confirm-board">确认上车 ${icon('arrow-up-right')}</button><p class="local-note">演示操作，不发送真实广播</p>`);
  }
  function confirmBoard(button) {
    if(button.disabled)return;button.disabled=true;button.textContent='正在确认';
    const id=state.route;
    confirmTimer=setTimeout(()=>{
      showSheet('success',`<div class="confirm-state"><div class="success-mark">${icon('check')}</div><h2 id="sheet-title">已确认上车</h2><p>邵逸夫堂 · ${escape(id)} 号线<br>这条广播仅在样品中展示</p><div class="receipt">${badge(id)}<span>有人在邵逸夫堂上车</span></div></div><button class="primary pressable" data-sheet-action="back-map">回到地图 ${icon('arrow-right')}</button>`);
    },650);
  }
  function showCourses() {
    showSheet('courses',`<div class="sheet-heading"><div><h2 id="sheet-title">我的课程</h2><p>2026 - 27 · Term 1</p></div>${icon('calendar-days')}</div><div class="course-list">${courses.map(c=>`<div class="course-row"><div><strong>${escape(c.name)}</strong><p>${escape(c.code)}<br>${escape(c.time)} · ${escape(c.place)}</p></div><button class="add-course" data-sheet-action="course" data-course="${c.id}" aria-label="${state.courses.has(c.id)?'移除':'添加'}${escape(c.name)}" aria-pressed="${state.courses.has(c.id)}" title="${state.courses.has(c.id)?'移除课程':'添加课程'}">${icon(state.courses.has(c.id)?'check':'plus')}</button></div>`).join('')}</div><p class="local-note">示例课程，仅保留在本次预览中</p>`);
  }
  const fold=s=>s.toLowerCase().replace(/[\s\u3000]/g,'').replace(/書/g,'书').replace(/學/g,'学').replace(/館/g,'馆').replace(/聯/g,'联').replace(/亞/g,'亚').replace(/膳堂|饭堂|食堂/g,'餐厅');
  function renderResults() {
    const term=fold($('search').value);
    const rows=places.filter(p=>(state.filter==='all'||p.type===state.filter)&&(!term||fold(p.name+' '+p.detail).includes(term)));
    const shown=(term?rows:rows.filter(p=>['dining','building'].includes(p.type)||state.filter==='stop')).slice(0,6);
    $('search-results').setAttribute('aria-busy','false');
    $('search-results').innerHTML=shown.length?`<div class="result-head">${term?'搜索结果':'校园地点'}</div>${shown.map(p=>`<button class="result-row" data-place-id="${escape(p.id)}"><span class="result-icon">${icon(p.type==='dining'?'utensils':p.type==='stop'?'bus-front':'building-2')}</span><span><strong>${escape(p.name)}</strong><small>${escape(p.type==='dining'?'餐厅':p.type==='stop'?'校巴站点':'教学与校园设施')}</small></span>${icon('arrow-up-left')}</button>`).join('')}`:'<div class="no-results">没有找到相关地点</div>';
    icons();
  }
  function search(loading=false) {
    if(state.sheet)closeSheet(false);if(state.menu)menu(false);
    clearTimeout(searchTimer);$('search-panel').hidden=false;$('search').setAttribute('aria-expanded','true');$('search-clear').hidden=!$('search').value;
    if(!loading){renderResults();return;}
    $('search-results').setAttribute('aria-busy','true');$('search-results').innerHTML=Array.from({length:3},()=>'<div class="skeleton-row" aria-hidden="true"><div class="skeleton square"></div><div class="skeleton-lines"><div class="skeleton"></div><div class="skeleton"></div></div></div>').join('');
    searchTimer=setTimeout(renderResults,550);
  }
  $('search').addEventListener('focus',()=>search());$('search').addEventListener('input',()=>search(true));
  $('search').addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();$('search-results').querySelector('button')?.focus();}if(e.key==='Enter'){$('search-results').querySelector('button')?.click();}});
  $('search-clear').onclick=()=>{$('search').value='';$('search').focus();search();};
  document.querySelectorAll('[data-filter]').forEach(button=>button.onclick=()=>{state.filter=button.dataset.filter;document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});search(true);});
  $('search-results').onclick=e=>{const b=e.target.closest('[data-place-id]');if(b)selectPlace(places.find(p=>p.id===b.dataset.placeId));};
  $('menu-button').onclick=()=>menu(!state.menu);$('menu-scrim').onclick=()=>menu(false);$('theme-button').onclick=()=>theme(night()?'light':'dark');
  document.querySelectorAll('[data-theme-choice]').forEach(b=>b.onclick=()=>theme(b.dataset.themeChoice));
  document.querySelectorAll('[data-layer]').forEach(b=>b.onclick=()=>{const id=b.dataset.layer;state.layers[id]=!state.layers[id];b.classList.toggle('active',state.layers[id]);b.setAttribute('aria-pressed',String(state.layers[id]));if(state.layers[id])layerGroups[id].addTo(map);else map.removeLayer(layerGroups[id]);});
  $('courses-button').onclick=showCourses;$('reduce-motion').onchange=e=>setReduced(e.target.checked);
  $('board-button').onclick=()=>boarding();$('sheet-scrim').onclick=()=>closeSheet();
  $('bus-shortcuts').innerHTML=vehicles.map(v=>`<button class="bus-shortcut" data-route="${v.id}" aria-label="查看${v.id}号校巴">${badge(v.id)}<span><strong>${v.eta}</strong><small>分钟</small></span></button>`).join('');
  $('bus-shortcuts').onclick=e=>{const b=e.target.closest('[data-route]');if(b)selectBus(b.dataset.route);};
  $('sheet-content').onclick=e=>{
    const b=e.target.closest('[data-sheet-action]');if(!b)return;
    switch(b.dataset.sheetAction){
      case 'board':boarding(b.dataset.route);break;
      case 'choose-route':state.route=b.dataset.route;document.querySelectorAll('.route-choice').forEach(r=>{r.classList.toggle('selected',r===b);r.setAttribute('aria-pressed',String(r===b));});break;
      case 'confirm-board':confirmBoard(b);break;
      case 'back-map':closeSheet();break;
      case 'bus':selectBus(b.dataset.route);break;
      case 'save':{const id=state.selected?.id;if(!id)break;state.saved.has(id)?state.saved.delete(id):state.saved.add(id);const saved=state.saved.has(id);b.setAttribute('aria-pressed',String(saved));b.innerHTML=icon(saved?'check':'bookmark')+(saved?'已收藏':'收藏');icons();toast(saved?'已收藏地点':'已取消收藏');break;}
      case 'refresh-eta':{const value=document.querySelector('.eta-value b');value.textContent=String(Number(value.textContent)===3?2:3);value.classList.remove('rolling');void value.offsetWidth;value.classList.add('rolling');toast('示例预估已更新');break;}
      case 'course':{const id=b.dataset.course;state.courses.has(id)?state.courses.delete(id):state.courses.add(id);const selected=state.courses.has(id),course=courses.find(c=>c.id===id);b.setAttribute('aria-pressed',String(selected));b.setAttribute('aria-label',(selected?'移除':'添加')+course.name);b.title=selected?'移除课程':'添加课程';b.innerHTML=icon(selected?'check':'plus');icons();toast(selected?'课程已添加':'课程已移除');break;}
    }
  };
  function reset() {
    menu(false);closeSheet(false);closeSearch();clearTimeout(toastTimer);$('toast').classList.remove('visible');$('search').value='';$('search-clear').hidden=true;state.saved.clear();state.courses.clear();state.route='1';state.filter='all';theme('light');setReduced(media.matches);
    document.querySelectorAll('[data-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.filter==='all');b.setAttribute('aria-pressed',String(b.dataset.filter==='all'));});
    document.querySelectorAll('[data-layer]').forEach(b=>{const id=b.dataset.layer,on=id==='bus';state.layers[id]=on;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));on?layerGroups[id].addTo(map):map.removeLayer(layerGroups[id]);});
    map.setView([22.4196,114.2069],16,{animate:false});toast('样品已重置');$('menu-button').focus({preventScroll:true});
  }
  $('reset').onclick=reset;$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('recenter').onclick=()=>map.setView([22.4196,114.2069],16,{animate:!reduced()});
  map.on('click',()=>{closeSearch();if(state.sheet)closeSheet();});map.on('dragstart',closeSearch);
  document.addEventListener('pointerdown',e=>{
    if(!e.target.closest('.search-wrap'))closeSearch();
    const b=e.target.closest('.pressable,.layer-button');if(!b||reduced()||b.disabled)return;
    const rect=b.getBoundingClientRect(),wave=document.createElement('span');wave.className='press-wave';wave.style.setProperty('--x',`${e.clientX-rect.left}px`);wave.style.setProperty('--y',`${e.clientY-rect.top}px`);b.append(wave);wave.addEventListener('animationend',()=>wave.remove(),{once:true});
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){if(state.sheet)closeSheet();else if(state.menu)menu(false);else{closeSearch();$('search').blur();}return;}
    if(e.key!=='Tab')return;
    const container=state.menu?$('sidebar'):state.sheet?sheet:null;if(!container)return;
    const controls=[...container.querySelectorAll('button:not(:disabled), input, a[href]')].filter(el=>!el.hidden && el.getClientRects().length);
    const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  });
  let drag=null,suppressClick=false;
  $('sheet-handle').addEventListener('pointerdown',e=>{drag={id:e.pointerId,start:e.clientY,delta:0};$('sheet-handle').setPointerCapture(e.pointerId);});
  $('sheet-handle').addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;drag.delta=Math.max(0,e.clientY-drag.start);if(drag.delta>4){sheet.classList.add('dragging');sheet.style.transform=`${innerWidth>600?'translateX(-50%) ':''}translateY(${drag.delta}px)`;}});
  function endDrag(e,cancelled=false){if(!drag||drag.id!==e.pointerId)return;const delta=drag.delta;drag=null;suppressClick=delta>4;sheet.classList.remove('dragging');sheet.style.transform='';if(!cancelled&&delta>85)closeSheet();}
  $('sheet-handle').addEventListener('pointerup',e=>endDrag(e));$('sheet-handle').addEventListener('pointercancel',e=>endDrag(e,true));$('sheet-handle').onclick=()=>{if(suppressClick){suppressClick=false;return;}closeSheet();};
  new ResizeObserver(()=>map.invalidateSize({animate:false})).observe($('map'));
  icons();
})();
