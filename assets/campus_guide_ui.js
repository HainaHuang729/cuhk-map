(function(root) {
  function init(options) {
    const { map } = options, L = root.L, data = root.CUHK_CAMPUS_GUIDE, core = root.CUHK_GUIDE_CORE;
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
    const host = document.createElement('div');
    host.className = 'guide';
    host.innerHTML = `<header class="guide-header">
      <button class="guide-icon" data-action="menu" aria-label="校园地图菜单" title="校园地图菜单">${icon('menu')}</button>
      <button class="guide-search-trigger" data-action="search">${icon('search')}<span>搜索地点、站点、校园设施</span></button>
    </header><div class="guide-layer" hidden><button class="guide-scrim" data-action="close" aria-label="关闭弹层"></button>
    <section class="guide-sheet" role="dialog" aria-modal="true" aria-label="地点搜索" tabindex="-1"></section></div>
    <div class="guide-navigation" hidden></div><div class="guide-toast" role="status" hidden></div>`;
    document.body.append(host);
    document.body.classList.add('guide-enabled');
    const layer = host.querySelector('.guide-layer'), sheet = host.querySelector('.guide-sheet');
    const navigation = host.querySelector('.guide-navigation'), toastBox = host.querySelector('.guide-toast');
    const selectedLayer = L.layerGroup().addTo(map), routeLayer = L.layerGroup().addTo(map);
    const campusBasemap = L.imageOverlay('assets/campus-light.png?v=' + data.version, data.basemap.bounds, { pane:'tilePane', interactive:false }).addTo(map);
    const labels = L.layerGroup().addTo(map);
    function renderLabels() {
      labels.clearLayers();
      const zoom = map.getZoom(), boxes = [];
      if (zoom < 15) return;
      data.basemap.labels.slice().sort((a,b) => b.area-a.area).forEach(label => {
        if (zoom < 17 && label.area < (zoom < 16 ? 14000 : 4000)) return;
        const point = map.latLngToContainerPoint([label.coord[1],label.coord[0]]);
        const width = Math.min(180,label.name.length*11), box = [point.x-width/2,point.y-8,point.x+width/2,point.y+8];
        if (boxes.some(other => box[0] < other[2]+6 && box[2] > other[0]-6 && box[1] < other[3]+5 && box[3] > other[1]-5)) return;
        boxes.push(box);
        L.marker([label.coord[1],label.coord[0]], { interactive:false, icon:L.divIcon({
          className:'guide-map-label', html:escape(label.name), iconSize:[width,18], iconAnchor:[width/2,9] }) }).addTo(labels);
      });
    }
    map.on('zoomend moveend',renderLabels); renderLabels();
    let theme = 'light', selected = null, selectedMarker = null, results = [], query = '', category = 'all';
    let mode = 'place', routeDestination = null, routeResult = null, walkingPromise = null, timer, focusReturn = null, routeToken = 0;
    try { theme = localStorage.getItem('cuhk-web-guide-theme') === 'dark' ? 'dark' : 'light'; } catch {}
    const drawIcons = () => root.lucide && root.lucide.createIcons({ root:host });
    function toast(message) { clearTimeout(timer); toastBox.textContent = message; toastBox.hidden = false; timer = setTimeout(() => { toastBox.hidden = true; }, 4500); }
    function setTheme(value) {
      theme = value; document.body.dataset.guideTheme = theme;
      campusBasemap.setUrl('assets/campus-' + theme + '.png?v=' + data.version);
      try { localStorage.setItem('cuhk-web-guide-theme', theme); } catch {}
      if (selectedMarker && selected) selectedMarker.setIcon(markerIcon(selected));
    }
    function show(html, label) {
      if (layer.hidden) focusReturn = document.activeElement;
      sheet.innerHTML = html; sheet.setAttribute('aria-label', label); layer.hidden = false;
      drawIcons(); sheet.focus();
    }
    function close() { layer.hidden = true; if (focusReturn && focusReturn.isConnected) focusReturn.focus(); }
    function menu() {
      const toggle = (key, label, glyph) => `<button data-action="toggle-layer" data-key="${key}" aria-pressed="${options.layerVisible(key)}">${icon(glyph)}${label}</button>`;
      show(`<div class="guide-menu"><div class="guide-menu-heading">${icon('map')}<strong>中大校园地图</strong></div>
        <div class="guide-menu-row"><button data-action="theme" data-value="light" aria-pressed="${theme === 'light'}">${icon('sun')}浅色</button><button data-action="theme" data-value="dark" aria-pressed="${theme === 'dark'}">${icon('moon')}深色</button></div>
        <button data-action="view" data-value="${document.body.classList.contains('is-metro-mode') ? 'map' : 'metro'}">${icon('route')}${document.body.classList.contains('is-metro-mode') ? '地图' : '线路图'}</button>
        ${toggle('bus', '校巴', 'bus-front')}${toggle('stop', '站点', 'map-pin')}${toggle('dining', '餐厅', 'utensils')}${toggle('common', '其他信息', 'hospital')}<hr>
        <button data-action="facility-search">${icon('search')}校园设施</button>
      </div>`, '校园地图菜单');
    }
    function search(openMode = 'place') {
      mode = openMode;
      const tabs = [['all','全部'],['building','建筑'],['stop','站点'],['dining','餐厅'],['facility','设施']];
      show(`<div class="guide-search-row"><button class="guide-icon" data-action="close" aria-label="返回地图" title="返回地图">${icon('arrow-left')}</button>
        <input id="guideQuery" type="search" autocomplete="off" maxlength="120" aria-label="${mode === 'origin' ? '搜索起点' : '搜索地点'}" placeholder="${mode === 'origin' ? '选择起点' : '搜索地点、站点、校园设施'}" value="${escape(query)}"></div>
        ${mode === 'origin' ? `<div class="guide-route-target">终点：${escape(routeDestination.name)}</div><button class="guide-current" data-action="current">${icon('locate-fixed')}当前位置</button>` : ''}
        <nav class="guide-tabs" role="tablist" aria-label="搜索类别">${tabs.map(([key,label]) => `<button role="tab" data-action="category" data-key="${key}" aria-selected="${category === key}">${label}</button>`).join('')}</nav>
        <div class="guide-results" aria-live="polite"></div>`, mode === 'origin' ? '选择导航起点' : '地点搜索');
      renderResults(); sheet.querySelector('input').focus({ preventScroll:true });
    }
    function renderResults() {
      results = core.search(query, category, options.stops());
      sheet.querySelector('.guide-results').innerHTML = results.length ? results.map((item,index) =>
        `<button class="guide-result ${item.statusLabel || item.hidden ? 'is-suspended' : ''}" data-action="result" data-index="${index}">
        <img src="${data.icons[theme][item.icon] || data.icons[theme].service}" alt=""><span class="guide-result-copy"><strong>${escape(item.name)}</strong>
        <small>${escape([item.label, item.locations && item.locations.slice(0,2).join('、'), item.status].filter(Boolean).join(' · '))}</small></span></button>`).join('') : '<p class="guide-empty">没有找到匹配地点</p>';
    }
    function paragraphs(item, full) {
      const source = item.kind === 'facility' ? data.sources[item.source] : null;
      const rows = [item.english, item.building && item.building.address, item.locations && item.locations.join('\n'),
        item.statusLabel || (!item.navigable ? item.status : ''), item.floor, item.hours, item.hoursNote, item.access,
        full ? item.note : '', item.accessibilityWarning,
        item.kind === 'facility' ? item.navigable ? '位置为所在建筑，非设备或室内入口精确坐标。' : item.status : ''];
      return Array.from(new Set(rows.filter(Boolean))).map(row => `<p>${escape(row)}</p>`).join('') + (full && source ?
        `<p class="guide-meta">资料来源：${escape(source.name)}${source.updatedAt ? '（' + escape(source.updatedAt) + '）' : ''}<br>核对日期：${escape(data.checkedAt)}</p>` : '');
    }
    function links(item) {
      const contacts = (item.contacts || (item.contact_phone ? [{ label:'联系电话', phone:item.contact_phone }] : [])).map(contact => {
        const tel = core.phone(contact.phone);
        return tel ? `<a href="tel:${tel}">${icon('phone')}${escape(contact.label)} ${escape(contact.phone)}</a>` : '';
      });
      const source = item.kind === 'facility' && data.sources[item.source];
      const list = (item.links || []).concat(source ? [{ label:'官方资料', url:source.url }] : []);
      return '<div class="guide-actions">' + contacts.join('') + list.map(link => {
        const url = core.safeUrl(link.url);
        return url ? `<a href="${escape(url)}" target="_blank" rel="noopener noreferrer">${icon('external-link')}${escape(link.label)}</a>` : '';
      }).join('') + '</div>';
    }
    function details(item) {
      selected = item;
      show(`<div class="guide-search-row"><button class="guide-icon" data-action="back-search" aria-label="返回搜索">${icon('arrow-left')}</button><strong>${escape(item.label || '地点资料')}</strong></div>
      <div class="guide-detail-body"><h2>${escape(item.name)}</h2>${paragraphs(item,true)}${links(item)}
      ${item.navigable ? `<div class="guide-actions"><button data-action="select-map">${icon('map-pin')}地图位置</button><button data-action="navigate">${icon('navigation')}导航至建筑</button></div>` : ''}</div>`, item.name);
    }
    function markerIcon(item) {
      return L.icon({ iconUrl:data.icons[theme][item.icon] || data.icons[theme].service,
        iconSize:[32,32], iconAnchor:[16,16], popupAnchor:[0,-18], className:'guide-selected-marker' });
    }
    function select(item) {
      routeToken++; routeLayer.clearLayers(); routeResult = null;
      selected = item;
      if (!item.navigable) { navigation.hidden = true; selectedLayer.clearLayers(); details(item); return; }
      close(); options.setViewMode('map'); selectedLayer.clearLayers();
      selectedMarker = L.marker([item.webCoord[1],item.webCoord[0]], { icon:markerIcon(item), zIndexOffset:1800 }).addTo(selectedLayer);
      const popup = document.createElement('div'); popup.className = 'guide guide-popup';
      popup.innerHTML = item.kind === 'stop' ? options.stopPopup(item.id) : `<h2>${escape(item.name)}</h2><div class="guide-popup-body">${paragraphs(item,false)}</div>`;
      const actions = document.createElement('div'); actions.className = 'guide-actions';
      const detailButton = document.createElement('button'); detailButton.innerHTML = icon('info') + '完整资料';
      detailButton.addEventListener('click', () => details(item)); actions.append(detailButton); popup.append(actions);
      selectedMarker.bindPopup(popup, { closeButton:false, maxWidth:Math.min(300,window.innerWidth-60), minWidth:Math.min(260,window.innerWidth-80), autoPanPaddingTopLeft:[20,80], autoPanPaddingBottomRight:[20,140] });
      map.setView([item.webCoord[1],item.webCoord[0]], Math.max(map.getZoom(),17)); selectedMarker.openPopup();
      showNavigation(); drawIcons();
    }
    function showNavigation() {
      navigation.hidden = !selected || !selected.navigable;
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
      if (action === 'menu') menu();
      if (action === 'search' || action === 'back-search') { query = ''; search(); }
      if (action === 'facility-search') { category = 'facility'; query = ''; search(); }
      if (action === 'category') { query = sheet.querySelector('input').value; category = button.dataset.key; search(mode); }
      if (action === 'theme') { setTheme(button.dataset.value); menu(); }
      if (action === 'view') { options.setViewMode(button.dataset.value); close(); }
      if (action === 'toggle-layer') { options.toggleLayer(button.dataset.key); menu(); }
      if (action === 'result') { const item = results[Number(button.dataset.index)]; if (mode === 'origin') navigateFrom(item); else select(item); }
      if (action === 'select-map') select(selected);
      if (action === 'navigate') { routeDestination = selected; query = ''; category = 'all'; search('origin'); }
      if (action === 'current') currentLocation();
      if (action === 'end-route') { routeToken++; routeLayer.clearLayers(); routeResult = null; showNavigation(); }
    });
    host.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !layer.hidden) { routeToken++; close(); }
      if (event.key !== 'Tab' || layer.hidden) return;
      const focusable = Array.from(sheet.querySelectorAll('button,input,a[href]')).filter(node => !node.disabled);
      const first = focusable[0], last = focusable[focusable.length-1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sheet)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
    map.on('click', () => { routeToken++; selectedLayer.clearLayers(); routeLayer.clearLayers(); selected = null; routeResult = null; navigation.hidden = true; });
    setTheme(theme); drawIcons();
    return { search, select, getRoute:() => routeResult };
  }
  root.CUHK_CAMPUS_UI = { init };
})(globalThis);
