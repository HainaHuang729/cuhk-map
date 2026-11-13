(function(root) {
  function init(options) {
    const { map } = options, L = root.L, data = root.CUHK_CAMPUS_GUIDE, core = root.CUHK_GUIDE_CORE;
    const allowNavigation = options.allowNavigation === true;
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const host = document.createElement('div');
    host.className = 'guide';
    host.innerHTML = `<header class="guide-header">
      <button class="guide-icon" data-action="menu" aria-label="校园地图菜单" title="校园地图菜单">${icon('menu')}</button>
      <button class="guide-search-trigger" data-action="search">${icon('search')}<span>搜索地点</span></button>
    </header><div class="guide-layer" hidden><button class="guide-scrim" data-action="close" aria-label="关闭弹层"></button>
    <section class="guide-sheet" role="dialog" aria-modal="true" aria-label="地点搜索" tabindex="-1"></section></div>
    <div class="guide-navigation" hidden></div><div class="guide-toast" role="status" hidden></div>
    <button class="guide-icon guide-recenter" data-action="recenter" aria-label="查看校园全图" title="查看校园全图">${icon('scan')}</button>`;
    document.body.append(host);
    document.body.classList.add('guide-enabled');
    const layer = host.querySelector('.guide-layer'), sheet = host.querySelector('.guide-sheet');
    const navigation = host.querySelector('.guide-navigation'), toastBox = host.querySelector('.guide-toast');
    const selectedLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
    const campusBasemap = L.imageOverlay('assets/campus-light.png?v=' + data.version, data.basemap.bounds, { pane:'tilePane', interactive:false }).addTo(map);
    const campusBounds = L.latLngBounds(data.basemap.bounds);
    // The mini-program basemap is a finite image, not an infinite tile layer.
    function fitBasemapViewport() {
      map.setMinZoom(Math.max(14, map.getBoundsZoom(campusBounds, true)));
      map.panInsideBounds(campusBounds, { animate:false });
    }
    map.options.maxBoundsViscosity = 1;
    map.setMaxBounds(campusBounds);
    map.on('resize', fitBasemapViewport);
    fitBasemapViewport();
    const labels = L.layerGroup().addTo(map);
    let walkways = null;
    function renderLabels() {
      labels.clearLayers();
      const zoom = map.getZoom(), boxes = [], viewport = map.getSize();
      if (zoom < 15) return;
      if (walkways && walkways.isVisible() && root.CUHK_WALKWAY_DATA) root.CUHK_WALKWAY_DATA.routes.forEach(route => {
        const p = map.latLngToContainerPoint([route.labelCoord[1],route.labelCoord[0]]);
        boxes.push([p.x-16,p.y-40,p.x+16,p.y-8]);
      });
      data.basemap.labels.slice().sort((a,b) => b.area-a.area).forEach(label => {
        if (zoom < 17 && label.area < (zoom < 16 ? 14000 : 4000)) return;
        const point = map.latLngToContainerPoint([label.coord[1],label.coord[0]]);
        if (point.x < -100 || point.x > viewport.x + 100 || point.y < -30 || point.y > viewport.y + 30) return;
        const width = Math.min(180,label.name.length*11), box = [point.x-width/2,point.y-8,point.x+width/2,point.y+8];
        if (boxes.some(other => box[0] < other[2]+6 && box[2] > other[0]-6 && box[1] < other[3]+5 && box[3] > other[1]-5)) return;
        boxes.push(box);
        L.marker([label.coord[1],label.coord[0]], { interactive:false, icon:L.divIcon({
          className:'guide-map-label', html:escape(label.name), iconSize:[width,18], iconAnchor:[width/2,9] }) }).addTo(labels);
      });
    }
    map.on('zoomend moveend walkwayschange',renderLabels); renderLabels();
    let theme = 'light', selected = null, selectedMarker = null, results = [], query = '', category = 'all', menuPage = 'home';
    let mode = 'place', routeDestination = null, routeResult = null, walkingPromise = null, timer, focusReturn = null, routeToken = 0;
    let mtrPoller = null, mtrAbort = null, mtrPreview = null;
    let publicBusPoller=null,publicBusAbort=null,publicBusPreview=null;
    const stationBusLayer=L.layerGroup();
    const stationRaw=data.items.find(item=>item.id==='facility/mtr-exit/university-c');
    const stationItem=stationRaw && core.facility(stationRaw);
    const stationMarker=stationItem && L.marker([stationItem.webCoord[1],stationItem.webCoord[0]],{icon:markerIcon(stationItem),title:'大学站港铁',alt:'大学站港铁',zIndexOffset:2000}).addTo(map);
    if(stationMarker) {stationMarker.on('click',()=>openMtrPreview(stationItem,stationMarker));stationMarker.bindTooltip('大学站');}
    const stationBusMarkers=data.items.filter(item=>item.category==='public_transit' && /大学站|大學站/.test(item.name || '')).map(raw=>{
      const item=core.facility(raw);
      if(!item.locatable || !item.webCoord) return null;
      const marker=L.marker([item.webCoord[1],item.webCoord[0]],{icon:markerIcon(item),title:item.name,alt:item.name,zIndexOffset:900}).addTo(stationBusLayer);
      marker.bindTooltip(item.name); marker.on('click',()=>select(item));
      return {marker,item};
    }).filter(Boolean);
    function syncStationBusLayer(){
      if(options.layerVisible('stop')) stationBusLayer.addTo(map);
      else{
        map.removeLayer(stationBusLayer);
        if(selected && selected.category==='public_transit'){map.closePopup();selectedLayer.clearLayers();selected=null;}
        stopPublicBus();
      }
    }
    syncStationBusLayer();
    function stopPublicBus(){
      if(publicBusPoller)publicBusPoller.stop();
      if(publicBusAbort)publicBusAbort.abort();
      publicBusPoller=null;publicBusAbort=null;
    }
    function startPublicBus(item,popup){
      stopPublicBus();
      if(document.hidden)return;
      publicBusPoller=root.CUHK_PUBLIC_BUS.createPoller(async()=>{
        const controller=new AbortController();publicBusAbort=controller;
        const timer=setTimeout(()=>controller.abort(),8000);
        try{
          const response=await fetch(root.CUHK_PUBLIC_BUS.url(item),{signal:controller.signal,credentials:'omit',cache:'no-store'});
          if(!response.ok)throw Error('public_bus_unavailable');
          return {ok:true,payload:await response.json()};
        }finally{clearTimeout(timer);}
      },snapshot=>{
        const state=root.CUHK_PUBLIC_BUS.preview(item,snapshot);
        popup.innerHTML=`<div class="vehicle-popup-heading"><span class="mtr-popup-badge">${item.operator==='GMB'?'小巴':'九巴'}</span><strong>${escape(item.name)}</strong></div>${state.arrivals.map(row=>`<div class="vehicle-popup-next"><strong>${escape(row.destination)}</strong><b>${escape(row.eta)}</b></div>`).join('')}${state.notice?`<small>${escape(state.notice)}</small>`:''}`;
        const all=root.CUHK_PUBLIC_BUS.rows(item,snapshot);
        if(all.length>4){const more=document.createElement('details'),summary=document.createElement('summary');summary.textContent='全部线路';more.append(summary);const list=document.createElement('div');list.style.cssText='max-height:180px;overflow-y:auto;';list.innerHTML=all.map(row=>`<div class="vehicle-popup-next"><strong>${escape(row.route+' '+row.destination)}</strong><b>${escape(row.eta)}</b></div>`).join('');more.append(list);popup.append(more);}
      });
      publicBusPoller.start();
    }
    function openMtrPreview(item,marker) {
      close(); map.closePopup();
      const popup=document.createElement('div'); popup.className='guide guide-mtr-popup';
      const text=document.createElement('div'); text.className='guide-mtr-preview-text'; popup.append(text);
      const button=document.createElement('button'); button.textContent='详情';
      button.addEventListener('click',()=>details(item)); popup.append(button);
      text.className='vehicle-popup';
      const render=state=>{text.innerHTML=`<div class="vehicle-popup-heading"><span class="mtr-popup-badge">港铁</span><strong>大学站 · 东铁线</strong></div>${state.notice?`<small role="status">${escape(state.notice)}</small>`:state.delayed?'<small>港铁提示列车延误</small>':''}${root.CUHK_MTR.previewRows(state).map(r=>`<div class="vehicle-popup-next"><strong>${escape(r.destination)}</strong><b>${escape(r.eta)}</b></div>${r.meta?`<small>${escape(r.meta)}</small>`:''}`).join('')}`;};
      const bubble=L.popup({closeButton:false,maxWidth:Math.min(260,window.innerWidth-100),minWidth:190,autoPanPaddingTopLeft:[16,80],autoPanPaddingBottomRight:[70,140]}).setLatLng(marker.getLatLng()).setContent(popup).openOn(map);
      mtrPreview={marker,popup:bubble,render};
      bubble.once('remove',()=>{if(mtrPreview && mtrPreview.popup===bubble){mtrPreview=null;stopMtr();}});
      startMtr(render);
    }
    function mtrStationDetails() {
      const s = root.CUHK_MTR_STATION;
      if (!s) return '';
      const source = url => `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">官方来源</a>`;
      return `<div class="guide-mtr-static">
        <details><summary>首末班与开放时间</summary><p>车站开放 ${escape(s.openingHours)}</p>
        <table><thead><tr><th>往</th><th>首班</th><th>末班</th></tr></thead><tbody>${s.services.map(r => `<tr><td>${escape(r.destination)}</td><td>${escape(r.first)}</td><td>${escape(r.last)}</td></tr>`).join('')}</tbody></table>
        <p>末班开出前至少5分钟入闸；特别安排以港铁公告为准。</p>${source(s.hoursSource)}</details>
        <details><summary>出口与无障碍设施</summary><dl>${s.exits.concat(s.facilities.slice(3)).map(r => `<dt>${escape(r.name)}</dt><dd>${escape(r.detail)}</dd>`).join('')}</dl><p>设施资料不代表实时运行状态；需要协助可联系车站职员。</p>${source(s.facilitiesSource)}</details>
        <details><summary>常用目的地票价</summary><p>从大学站出发 · 港币 · 普通等</p><table><thead><tr><th>往</th><th>成人八达通</th><th>学生八达通</th></tr></thead><tbody>${s.fares.map(r => `<tr><td>${escape(r.destination)}</td><td>${escape(r.adult)}</td><td>${escape(r.student)}</td></tr>`).join('')}</tbody></table><p>学生票价须符合港铁学生优惠资格；不含头等及其他优惠，实际收费以港铁为准。</p>${source(s.faresSource)}</details>
        <p><a href="${s.layoutUrl}" target="_blank" rel="noopener noreferrer">官方车站平面图</a> · <a href="${s.streetUrl}" target="_blank" rel="noopener noreferrer">官方街道图</a></p><p>静态资料核对 ${escape(s.checkedAt)}</p></div>`;
    }
    function stopMtr() { if (mtrPoller) mtrPoller.stop(); if (mtrAbort) mtrAbort.abort(); mtrPoller = null; mtrAbort = null; }
    function renderMtr(state) {
      const box = sheet.querySelector('.guide-mtr');
      if (!box) return;
      const button = sheet.querySelector('[data-action="mtr-refresh"]');
      button.disabled = state.loading;
      box.setAttribute('aria-busy',String(state.loading));
      box.innerHTML = `${state.delayed ? '<p class="guide-mtr-notice">港铁提示列车延误</p>' : ''}
        ${(root.CUHK_MTR_STATION ? root.CUHK_MTR_STATION.lastTrainReminders(state) : []).map(text=>`<p class="guide-mtr-notice">${escape(text)}</p>`).join('')}
        ${state.notice ? `<p class="guide-mtr-notice" role="status">${escape(state.notice)}</p>` : ''}
        ${state.alertUrl ? `<a href="${escape(state.alertUrl)}" target="_blank" rel="noopener noreferrer">港铁特别安排</a>` : ''}
        ${state.directions.map(direction => `<section class="guide-mtr-direction"><h3>${escape(direction.label)}</h3>
        ${direction.trains.length ? `<div class="guide-mtr-table-labels"><span>目的地</span><span>预计时间</span><span>月台</span></div>`+direction.trains.map((train,i) => `<div class="guide-mtr-train ${i===0?'guide-mtr-nearest':''}"><div><strong>${escape(train.destination)}</strong>${train.via?`<span>${escape(train.via)}</span>`:''}</div><div class="guide-mtr-time"><strong>${escape(train.eta)}</strong><span>${escape(train.action)} ${escape(train.time)}</span></div><span class="guide-mtr-platform">${escape(train.platform)||'—'}</span></div>`).join('') : '<p>暂无列车时间</p>'}</section>`).join('')}
        ${state.updatedText ? `<div class="guide-mtr-footer"><span>更新 ${escape(state.updatedText)}</span></div>` : ''}`;
    }
    function startMtr(onChange=renderMtr) {
      stopMtr();
      if (document.hidden) return;
      mtrPoller = root.CUHK_MTR.createPoller(async () => {
        const controller = new AbortController(); mtrAbort = controller;
        const timeout = setTimeout(() => controller.abort(),8000);
        try {
          const response = await fetch(root.CUHK_MTR.URL, { signal:controller.signal, credentials:'omit', cache:'no-store' });
          if (!response.ok) throw new Error('mtr_http');
          const payload = await response.json();
          return { ok:true,payload,servedAt:Date.now() };
        } finally { clearTimeout(timeout); if (mtrAbort === controller) mtrAbort = null; }
      }, onChange);
      mtrPoller.start();
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {stopMtr();stopPublicBus();}
      else if(publicBusPreview && map.hasLayer(publicBusPreview.popup))startPublicBus(publicBusPreview.item,publicBusPreview.content);
      else if(mtrPreview && mtrPreview.popup.isOpen()) startMtr(mtrPreview.render);
      else if (!layer.hidden && sheet.dataset.layout === 'mtr') startMtr();
    });
    window.addEventListener('pagehide',stopMtr);
    window.addEventListener('pagehide',stopPublicBus);
    walkways = root.CUHK_WALKWAYS.create({ map, onError:message => toast(message) });
    try { theme = localStorage.getItem('cuhk-web-guide-theme') === 'dark' ? 'dark' : 'light'; } catch {}
    const drawIcons = () => root.lucide && root.lucide.createIcons({ root:host });
    function toast(message) { clearTimeout(timer); toastBox.textContent = message; toastBox.hidden = false; timer = setTimeout(() => { toastBox.hidden = true; }, 4500); }
    function setTheme(value) {
      theme = value; document.body.dataset.guideTheme = theme;
      campusBasemap.setUrl('assets/campus-' + theme + '.png?v=' + data.version);
      walkways.setTheme(theme);
      try { localStorage.setItem('cuhk-web-guide-theme', theme); } catch {}
      if (selectedMarker && selected) selectedMarker.setIcon(markerIcon(selected));
      if(stationMarker) stationMarker.setIcon(markerIcon(stationItem));
      stationBusMarkers.forEach(({marker,item})=>marker.setIcon(markerIcon(item)));
    }
    function show(html, label, layout = 'detail') {
      stopMtr();
      if (layer.hidden) { focusReturn = document.activeElement; map.closePopup(); }
      sheet.dataset.layout = layout;
      sheet.innerHTML = html; sheet.setAttribute('aria-label', label); layer.hidden = false;
      document.body.classList.add('guide-overlay-open');
      drawIcons(); sheet.focus();
    }
    function close() { stopMtr(); stopPublicBus(); layer.hidden = true; document.body.classList.remove('guide-overlay-open'); if (focusReturn && focusReturn.isConnected) focusReturn.focus(); }
    function menu(page = menuPage) {
      menuPage = page;
      const toggle = (key, label, glyph) => `<button class="guide-layer-toggle" data-action="toggle-layer" data-key="${key}" aria-pressed="${options.layerVisible(key)}">${icon(glyph)}<span>${label}</span><span class="guide-layer-state" aria-hidden="true"></span></button>`;
      const heading = page === 'home' ? `<div class="guide-menu-brand"><strong>中大校园</strong><span>CUHK Campus</span></div>` : `<div class="guide-menu-heading"><button class="guide-icon" data-action="menu-home" aria-label="返回主菜单">${icon('arrow-left')}</button><strong>地图显示</strong></div>`;
      const content = page === 'layers' ? `${toggle('bus','校巴','bus-front')}${toggle('stop','站点','map-pin')}${toggle('dining','餐厅','utensils')}${toggle('common','常用设施','hospital')}<button class="guide-layer-toggle" data-action="toggle-walkways" aria-pressed="${walkways.isVisible()}">${icon('footprints')}<span>步行道</span><span class="guide-layer-state" aria-hidden="true"></span></button>` : `
        <div class="guide-theme-control" role="group" aria-label="外观"><button data-action="theme" data-value="light" aria-pressed="${theme === 'light'}">${icon('sun')}浅色</button><button data-action="theme" data-value="dark" aria-pressed="${theme === 'dark'}">${icon('moon')}深色</button></div>
        <button data-action="view" data-value="map">${icon('map')}校园地图</button>
        <button data-action="view" data-value="metro">${icon('bus-front')}车辆到站</button>
        <a href="demos/shuttle-atlas/">${icon('route')}线路总览${icon('chevron-right')}</a><hr>
        <button data-action="menu-layers">${icon('map-pin')}地图显示${icon('chevron-right')}</button>
        <button data-action="facility-search">${icon('building-2')}校园设施${icon('chevron-right')}</button>
        <a href="web-gps/">${icon('map-pinned')}贡献轨迹${icon('chevron-right')}</a>`;
      show(`<div class="guide-menu">${heading}${content}</div>`, '校园地图菜单', 'menu');
    }
    function search(openMode = 'place') {
      mode = openMode;
      const tabs = [['all','全部'],['building','建筑'],['stop','站点'],['dining','餐厅'],['facility','设施']];
      show(`<div class="guide-search-row"><button class="guide-icon" data-action="close" aria-label="返回地图" title="返回地图">${icon('arrow-left')}</button><strong>地点搜索</strong></div>
        <div class="guide-input-row">${icon('search')}<input id="guideQuery" type="search" autocomplete="off" maxlength="120" aria-label="${mode === 'origin' ? '搜索起点' : '搜索地点'}" placeholder="地点名称、楼宇缩写" value="${escape(query)}"><button class="guide-icon" data-action="clear-search" aria-label="清空搜索" ${query ? '' : 'hidden'}>${icon('x')}</button></div>
        ${mode === 'origin' ? `<div class="guide-route-target">终点：${escape(routeDestination.name)}</div><button class="guide-current" data-action="current">${icon('locate-fixed')}当前位置</button>` : ''}
        <nav class="guide-tabs" role="tablist" aria-label="搜索类别">${tabs.map(([key,label]) => `<button role="tab" data-action="category" data-key="${key}" aria-selected="${category === key}">${label}</button>`).join('')}</nav>
        <div class="guide-search-status" role="status"></div><div class="guide-results"></div>`, mode === 'origin' ? '选择导航起点' : '地点搜索', 'search');
      renderResults(); sheet.querySelector('input').focus({ preventScroll:true });
    }
    function renderResults() {
      results = core.search(query, category, options.stops());
      const total = results.length;
      if (!query.trim() && category === 'all') {
        const common = ['UAB', 'YIA', 'UL', 'LSK', 'USC', 'SB'];
        results = common.map(code => results.find(item => item.shortName === code)).filter(Boolean);
      }
      sheet.querySelector('.guide-search-status').textContent = !query.trim() && category === 'all' ? '常用地点' : `找到 ${total} 个地点`;
      sheet.querySelector('[data-action="clear-search"]').hidden = !query;
      const symbols = { building:'building-2', stop:'bus-front', dining:'utensils', facility:'map-pin' };
      sheet.querySelector('.guide-results').innerHTML = results.length ? results.map((item,index) =>
        `<button class="guide-result ${item.statusLabel || item.hidden ? 'is-suspended' : ''}" data-action="result" data-index="${index}">
        <span class="guide-result-symbol">${item.category === 'mtr_exit' ? `<img src="${data.icons[theme].mtr}" alt="" aria-hidden="true" width="28" height="28">` : icon(symbols[item.kind] || 'map-pin')}</span><span class="guide-result-copy"><strong>${escape(core.displayNames(item).primary)}</strong>
        ${core.displayNames(item).secondary ? `<span class="guide-result-english">${escape(core.displayNames(item).secondary)}</span>` : ''}
        ${item.category === 'public_transit' ? `<span class="guide-result-routes">${escape(data.transitLines(item,2,query).join('\n'))}</span>` : ''}
        <small>${escape([item.label, item.locations && item.locations.slice(0,2).join('、'), !item.navigable && !item.locatable ? item.status : ''].filter(Boolean).join(' · '))}</small></span>${icon('chevron-right')}</button>`).join('') : `<div class="guide-empty">${icon('search')}<span>没有找到匹配地点</span></div>`;
      drawIcons();
    }
    function paragraphs(item, full) {
      const source = item.kind === 'facility' ? data.sources[item.source] : null;
      const rows = [item.building && item.building.address, item.locations && item.locations.join('\n'),
        ...(item.category === 'public_transit' ? data.transitLines(item,full ? Infinity : 3,query) : []),
        item.category === 'public_transit' ? '线路目录，非实时班次' : '',
        item.statusLabel || (!item.navigable ? item.status : ''), item.floor, item.scheduleSummary,
        !item.poolSchedule || full ? item.hours : '', full ? item.scheduleDetails : '', item.hoursNote, item.access,
        full || item.kind === 'building' ? item.note : '', full ? item.menu_note : '', item.accessibilityWarning,
        item.kind === 'facility' ? item.navigable ? '位置为所在建筑，非设备或室内入口精确坐标。' : item.status : ''];
      return Array.from(new Set(rows.filter(Boolean))).map(row => `<p>${escape(row)}</p>`).join('') + (full && source ?
        `<p class="guide-meta">资料来源：${escape(source.name)}${source.updatedAt ? '（' + escape(source.updatedAt) + '）' : ''}<br>核对日期：${escape(item.checkedAt || data.checkedAt)}</p>` : '');
    }
    function links(item) {
      const contacts = (item.contacts || (item.contact_phone ? [{ label:'联系电话', phone:item.contact_phone }] : [])).map(contact => {
        const tel = core.phone(contact.phone);
        return tel ? `<a href="tel:${tel}">${icon('phone')}${escape(contact.label)} ${escape(contact.phone)}</a>` : '';
      });
      const source = item.kind === 'facility' && data.sources[item.source];
      const list = (item.links || []).concat(item.menu_links || [], source ? [{ label:'官方资料', url:source.url }] : []);
      return '<div class="guide-actions">' + contacts.join('') + list.map(link => {
        const url = core.safeUrl(link.url);
        return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}${escape(link.label)}</a>` : '';
      }).join('') + '</div>';
    }
    function details(item) {
      map.closePopup();
      selected = item;
      const isMtr = item.category === 'mtr_exit';
      show(`<div class="guide-search-row"><button class="guide-icon" data-action="back-search" aria-label="返回搜索">${icon('arrow-left')}</button><strong>${escape(item.label || '地点资料')}</strong></div>
      <div class="guide-detail-body">${isMtr ? '' : `<h2>${escape(core.displayNames(item).primary)}</h2><div class="guide-detail-english">${escape(core.displayNames(item).secondary)}</div>`}
      ${isMtr ? `<div class="guide-mtr-heading"><div><strong>大学站</strong><small>东铁线</small></div><button class="guide-icon" data-action="mtr-refresh" aria-label="刷新列车时间" title="刷新列车时间">${icon('refresh-cw')}</button></div><div class="guide-mtr"></div><h3 class="guide-mtr-info-heading">车站资料</h3>${mtrStationDetails()}` : paragraphs(item,true)+links(item)}
      ${item.navigable || item.locatable ? `<div class="guide-actions"><button data-action="select-map">${icon('map-pin')}地图位置</button>${allowNavigation && item.navigable ? `<button data-action="navigate">${icon('navigation')}导航至建筑</button>` : ''}</div>` : ''}</div>`, item.name, isMtr ? 'mtr' : 'detail');
      if (isMtr) startMtr();
    }
    function markerIcon(item) {
      if(item.category==='public_transit') return L.divIcon({html:`<div class="bus-stop-marker" role="img" aria-label="公共巴士站 ${escape(item.name)}"><span aria-hidden="true">站</span></div>`,iconSize:[24,24],iconAnchor:[12,12],popupAnchor:[0,-14],className:'guide-selected-marker'});
      return L.icon({ iconUrl:data.icons[theme][item.icon] || data.icons[theme].service,
        iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-18], className:'guide-selected-marker' });
    }
    function select(item, mapOnly = false) {
      routeToken++; routeLayer.clearLayers(); routeResult = null;
      selected = item;
      if (!item.navigable && !item.locatable) { navigation.hidden = true; selectedLayer.clearLayers(); details(item); return; }
      close(); options.setViewMode('map'); selectedLayer.clearLayers();
      selectedMarker = L.marker([item.webCoord[1],item.webCoord[0]], { icon:markerIcon(item), zIndexOffset:1800 }).addTo(selectedLayer);
      if (item.category === 'mtr_exit') {
        selectedMarker.on('click', () => openMtrPreview(item,selectedMarker));
        map.setView([item.webCoord[1],item.webCoord[0]], Math.max(map.getZoom(),17));
        showNavigation();
        if (!mapOnly) openMtrPreview(item,selectedMarker);
        return;
      }
      if(item.category==='public_transit'){
        const content=document.createElement('div');content.className='guide vehicle-popup';
        const popup=L.popup({closeButton:false,maxWidth:Math.min(300,window.innerWidth-60),minWidth:230}).setLatLng(selectedMarker.getLatLng()).setContent(content).openOn(map);
        publicBusPreview={item,popup,content};
        popup.once('remove',()=>{if(publicBusPreview && publicBusPreview.popup===popup){publicBusPreview=null;stopPublicBus();}});
        map.setView([item.webCoord[1],item.webCoord[0]],Math.max(map.getZoom(),17));
        startPublicBus(item,content);showNavigation();return;
      }
      const popup = document.createElement('div'); popup.className = 'guide guide-popup';
      popup.innerHTML = item.kind === 'stop' ? options.stopPopup(item.id) : `<h2>${escape(core.displayNames(item).primary)}</h2><div class="guide-detail-english">${escape(core.displayNames(item).secondary)}</div><div class="guide-popup-body">${paragraphs(item,false)}</div>`;
      const actions = document.createElement('div'); actions.className = 'guide-actions';
      const detailButton = document.createElement('button'); detailButton.innerHTML = icon('info') + '完整资料';
      detailButton.addEventListener('click', () => details(item)); actions.append(detailButton); popup.append(actions);
      selectedMarker.bindPopup(popup, { closeButton:false, maxWidth:Math.min(300,window.innerWidth-60), minWidth:Math.min(260,window.innerWidth-80), autoPanPaddingTopLeft:[20,80], autoPanPaddingBottomRight:[20,140] });
      map.setView([item.webCoord[1],item.webCoord[0]], Math.max(map.getZoom(),17)); selectedMarker.openPopup();
      showNavigation(); drawIcons();
    }
    function showNavigation() {
      navigation.hidden = !allowNavigation || !selected || !selected.navigable;
      if (!allowNavigation) return;
      navigation.innerHTML = '<button class="guide-nav-button" data-action="navigate">' + icon('navigation') + '<span>导航 · ' + escape(selected && selected.name) + '</span></button>';
      drawIcons();
    }
    function loadWalking() {
      if (root.CUHK_CAMPUS_WALKING) return Promise.resolve(root.CUHK_CAMPUS_WALKING);
      if (!walkingPromise) walkingPromise = new Promise((resolve,reject) => {
        const script = document.createElement('script'); script.src = 'data/campus_walking.js?v=' + data.version;
        script.onload = () => resolve(root.CUHK_CAMPUS_WALKING);
        script.onerror = () => { script.remove(); walkingPromise = null; reject(new Error('步行资料加载失败，请重试')); };
        document.head.append(script);
      });
      return walkingPromise;
    }
    async function navigateFrom(origin) {
      if (!origin.navigable || !routeDestination || !routeDestination.navigable) { toast('这个地点暂不提供导航'); return; }
      const destination = routeDestination, token = ++routeToken;
      close(); map.closePopup(); toast('正在规划步行路线');
      try {
        const walking = await loadWalking();
        if (token !== routeToken) return;
        const from = origin.coord || root.CUHK_COORDINATES.toGcj02(origin.webCoord);
        const to = destination.coord || root.CUHK_COORDINATES.toGcj02(destination.webCoord);
        // The engine works in GCJ-02. Only Leaflet coordinates are converted to WGS84.
        const route = walking.route(from,to), nearby = walking.distance(from,to) < 8;
        routeLayer.clearLayers();
        if (!route && !nearby) { toast('步行路网未接通，暂不绘制直线替代'); showNavigation(); return; }
        if (route) {
          const points = route.coords.map(coord => root.CUHK_COORDINATES.toWgs84(coord)).map(([lon,lat]) => [lat,lon]);
          L.polyline(points, { color:'#613982', weight:9, opacity:1 }).addTo(routeLayer);
          L.polyline(points, { color:'#fff', weight:3, opacity:1 }).addTo(routeLayer);
          map.fitBounds(L.latLngBounds(points), { paddingTopLeft:[40,100], paddingBottomRight:[40,200], maxZoom:18 });
        }
        routeResult = route;
        navigation.hidden = false;
        const meters = route ? Math.round(route.distanceMeters) : 0;
        navigation.innerHTML = `<div class="guide-route-card">${icon('footprints')}<div><strong>${nearby ? '已在附近' : `步行约 ${Math.max(1,Math.ceil(meters/70))} 分钟 · ${meters} 米`}</strong><small>${escape(origin.name)} → ${escape(destination.name)}\n${escape(destination.accessibilityWarning || (destination.kind === 'facility' ? '路线至所在建筑，请按现场指引寻找入口。' : '普通步行路线，未核实无障碍通行条件。'))}</small></div><button class="guide-icon" data-action="end-route" aria-label="清除路线" title="清除路线">${icon('x')}</button></div>`;
        toastBox.hidden = true; drawIcons();
      } catch (error) { if (token === routeToken) toast(error.message); }
    }
    function currentLocation() {
      if (!navigator.geolocation) { toast('浏览器不支持定位，请搜索起点'); return; }
      const target = routeDestination, token = ++routeToken;
      toast('正在获取当前位置');
      navigator.geolocation.getCurrentPosition(position => {
        if (token !== routeToken || target !== routeDestination) return;
        const coord = [position.coords.longitude,position.coords.latitude];
        // Browser locations are WGS84, unlike wx.getLocation({type:'gcj02'}).
        if (position.coords.accuracy > 200) { toast('定位精度不足，请搜索起点'); return; }
        if (coord[0] < 114.195 || coord[0] > 114.226 || coord[1] < 22.405 || coord[1] > 22.433) { toast('当前位置不在校园附近，请搜索起点'); return; }
        navigateFrom({ name:'当前位置', webCoord:coord, navigable:true });
      }, () => toast('定位不可用，请搜索起点'), { enableHighAccuracy:true, timeout:12000, maximumAge:15000 });
    }
    host.addEventListener('input', event => { if (event.target.id === 'guideQuery') { query = event.target.value; renderResults(); } });
    host.addEventListener('click', event => {
      const button = event.target.closest('[data-action]'); if (!button) return;
      const action = button.dataset.action;
      if (action === 'close') { routeToken++; close(); }
      if (action === 'mtr-refresh' && mtrPoller) mtrPoller.refresh();
      if (action === 'menu' || action === 'menu-home') menu('home');
      if (action === 'menu-layers') menu('layers');
      if (action === 'recenter') map.fitBounds(data.basemap.bounds, { paddingTopLeft:[20,75], paddingBottomRight:[20,140] });
      if (action === 'search' || action === 'back-search') { query = ''; search(); }
      if (action === 'facility-search') { category = 'facility'; query = ''; search(); }
      if (action === 'category') { query = sheet.querySelector('input').value; category = button.dataset.key; search(mode); }
      if (action === 'clear-search') { query = ''; sheet.querySelector('input').value = ''; renderResults(); sheet.querySelector('input').focus(); }
      if (action === 'theme') { setTheme(button.dataset.value); menu(); }
      if (action === 'view') { options.setViewMode(button.dataset.value); close(); }
      if (action === 'toggle-layer') { options.toggleLayer(button.dataset.key); syncStationBusLayer(); menu(); }
      if (action === 'toggle-walkways') {
        clearTimeout(timer); toastBox.hidden = true;
        button.disabled = true;
        walkways.setVisible(!walkways.isVisible()).then(() => {
          if (button.isConnected) {
            if (walkways.isVisible()) options.setViewMode('map');
            menu();
            sheet.querySelector('[data-action="toggle-walkways"]').focus({ preventScroll:true });
          }
        });
      }
      if (action === 'result') { const item = results[Number(button.dataset.index)]; if (mode === 'origin') navigateFrom(item); else select(item); }
      if (action === 'select-map') select(selected, true);
      if (action === 'navigate' && allowNavigation) { routeDestination = selected; query = ''; category = 'all'; search('origin'); }
      if (action === 'current' && allowNavigation) currentLocation();
      if (action === 'end-route') { routeToken++; routeLayer.clearLayers(); routeResult = null; showNavigation(); }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !layer.hidden) { routeToken++; close(); }
      if (event.key !== 'Tab' || layer.hidden) return;
      const focusable = Array.from(sheet.querySelectorAll('button,input,a[href]')).filter(node => !node.disabled);
      const first = focusable[0], last = focusable[focusable.length-1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    map.on('click', () => { routeToken++; selectedLayer.clearLayers(); routeLayer.clearLayers(); selected = null; routeResult = null; navigation.hidden = true; });
    setTheme(theme); drawIcons();
    if (new URLSearchParams(location.search).get('walking') === '1') {
      options.setViewMode('map');
      walkways.setVisible(true).then(shown => {
        if (!shown || !walkways.isVisible()) return;
        const points = root.CUHK_WALKWAY_DATA.routeSections.flatMap(s => s.coords.map(p => [p[1],p[0]]));
        const side = map.getSize().x < 600 ? 10 : 36;
        map.fitBounds(points, {paddingTopLeft:[side,100], paddingBottomRight:[side,115], maxZoom:17, animate:false});
      });
    }
    return { search, select, getRoute:() => routeResult, walkways };
  }
  root.CUHK_CAMPUS_UI = { init };
})(globalThis);
