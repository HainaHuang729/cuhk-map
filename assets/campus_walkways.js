(function(root) {
  function create({ map, theme = 'light', onError = () => {} }) {
    const L = root.L, group = L.layerGroup(), pane = 'campusWalkways';
    if (!map.getPane(pane)) map.createPane(pane).style.zIndex = '350';
    if (!map.getPane('walkwayLabels')) map.createPane('walkwayLabels').style.zIndex = '450';
    const renderer = L.svg({ pane }), attribution = '步行图示：<a href="https://www.cuhk.edu.hk/chinese/campus/cuhk-campus-map.html" target="_blank" rel="noopener noreferrer">香港中文大学</a>';
    let visible = false, promise = null, data = null, request = 0, activePopup = null, attributed = false;
    const escape = value => String(value || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
    const latlng = coords => coords.map(([lon, lat]) => [lat, lon]);
    function load() {
      if (root.CUHK_WALKWAY_DATA) return Promise.resolve(root.CUHK_WALKWAY_DATA);
      if (!promise) promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'data/campus_walkways.js?v=20261101.8-aligned';
        const fail = () => { script.remove(); promise = null; reject(new Error('步行通道加载失败，请重试')); };
        script.onerror = fail;
        script.onload = () => root.CUHK_WALKWAY_DATA ? resolve(root.CUHK_WALKWAY_DATA) : fail();
        document.head.append(script);
      });
      return promise;
    }
    function popup(event, html) {
      if (event.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
      activePopup = L.popup({ closeButton:false, minWidth:Math.min(240,innerWidth - 92), maxWidth:Math.min(280,innerWidth - 92),
        maxHeight:Math.max(150,innerHeight - 230),
        className:'walkway-popup', autoPanPaddingTopLeft:[16,80], autoPanPaddingBottomRight:[16,110] })
        .setLatLng(event.latlng).setContent(`<div class="guide guide-popup">${html}</div>`).openOn(map);
    }
    function render() {
      group.clearLayers();
      if (!visible || !data) return;
      const dark = theme === 'dark', zoom = map.getZoom(), purple = dark ? '#cfb2e9' : '#613982';
      if (zoom < 15) return;
      if (zoom < 16) { renderRoutes(dark, purple); return; }
      const connections = new Map(data.connections.map(path => [path.id,path]));
      const labels = { steps:'台阶', corridor:'室内通道', pedestrian:'步行道', path:'步径', footway:'步行道', walkway:'步行道', 'building-link':'连廊', footbridge:'天桥' };
      data.displayPaths.forEach(record => {
        const references = record.connectionIds.map(id => connections.get(id)), reference = references[0];
        const path = reference.sections[record.sectionIndex];
        const points = latlng(path.coords), steps = path.kind === 'steps';
        const style = { renderer, pane, dashArray:steps ? '5 5' : null, lineCap:steps ? 'butt' : 'round',
          lineJoin:'round', smoothFactor:.2, interactive:false };
        L.polyline(points, { ...style, color:dark ? '#392947' : '#fff', weight:5.5, opacity:.94 }).addTo(group);
        const line = L.polyline(points, { ...style, color:purple, weight:steps ? 3 : 4,
          className:`walkway-line ${steps ? 'walkway-steps' : 'walkway-solid'}` }).addTo(group);
        line.getElement().dataset.walkwayId = record.id;
        if (!steps) L.polyline(points, { ...style, color:dark ? '#eee4f6' : '#fff', weight:1.8 }).addTo(group);
        const name = references.length === 1 ? reference.name : (path.name || reference?.name || labels[path.kind]);
        const open = event => popup(event, `<h2>${escape(name)}</h2>
          <p>${escape(steps ? '台阶' : path.bridge ? '天桥' : labels[path.kind])} · 出入口待核实</p>
          ${reference ? `<p>${escape(references.map(r => r.note).filter(Boolean).join('\n') || '楼层、两端入口及通行条件尚未核实。')}</p>` : ''}
          <p class="guide-meta">官方图示线位，暂未加入导航计算。</p>
          ${reference ? `<p class="guide-meta">核对日期：<time datetime="${escape(data.checkedAt)}">${escape(data.checkedAt)}</time></p>
          <div class="guide-actions"><a href="${escape(reference.detailSource || data.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方资料</a></div>` : ''}`);
        // A separate transparent hit area keeps a thin route easy to select on phones.
        const hit = L.polyline(points, { renderer, pane, color:purple, opacity:0, weight:16, smoothFactor:.2,
          bubblingMouseEvents:false, className:'walkway-hit-target' }).on('click', open).addTo(group);
        const element = hit.getElement();
        if (element && reference) {
          element.setAttribute('tabindex', '0'); element.setAttribute('role', 'button');
          element.setAttribute('aria-label', name + '，出入口待核实');
          element.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault(); event.stopPropagation();
              open({ latlng:points[Math.floor(points.length / 2)], originalEvent:event });
            }
          });
        }
      });
      renderRoutes(dark, purple);
    }
    function renderRoutes(dark, purple) {
      const routes = new Map(data.routes.map(r => [r.id,r]));
      const routeColor = r => dark ? r.darkColor : r.color;
      const routePopup = selected => selected.map(r => `<h2><span class="walkway-route-letter" style="color:${routeColor(r)}">${r.id}</span>${escape(r.name)}</h2>
        <p class="walkway-duration">官方参考约 ${r.minutes} 分钟</p>
        <p>${r.via.map(escape).join(' → ')}</p><p>${escape(r.note)}</p>`).join('<hr>')
        + `<p class="guide-meta">按官方路线图整理，非实时导航。出入口以现场指示为准。</p>
        <div class="guide-actions"><a href="${escape(data.routeSourceUrl)}" target="_blank" rel="noopener noreferrer">官方步行路线图</a></div>`;
      // Shared sections have one stroke; never stack D/E or redraw the LSK green bridge.
      for (const border of [true,false]) data.routeSections.forEach(section => {
        const selected = section.routeIds.map(id => routes.get(id)), steps = section.kind === 'steps';
        const color = selected.length === 1 ? routeColor(selected[0]) : purple;
        L.polyline(latlng(section.coords), { renderer, pane, color:border ? (dark ? '#28252f' : '#fff') : color,
          weight:border ? 6 : 3.5, opacity:border ? .95 : 1, dashArray:steps ? '5 5' : null,
          lineCap:steps ? 'butt' : 'round', lineJoin:'round', smoothFactor:.2, interactive:false,
          className:border ? 'walkway-route-casing' : 'walkway-route-line' }).addTo(group);
      });
      data.routeSections.forEach(section => {
        const selected = section.routeIds.map(id => routes.get(id));
        L.polyline(latlng(section.coords), { renderer, pane, weight:14, opacity:0, bubblingMouseEvents:false })
          .on('click', event => popup(event, routePopup(selected))).addTo(group);
      });
      data.routes.forEach(route => {
        const marker = L.marker([route.labelCoord[1],route.labelCoord[0]], { pane:'walkwayLabels',
          title:`步行 ${route.id} · ${route.name}`, alt:`步行 ${route.id} · ${route.name}`,
          icon:L.divIcon({ className:'walkway-route-badge', iconSize:[26,26], iconAnchor:[13,37],
            html:`<span style="color:${routeColor(route)};border-color:${routeColor(route)};background:${dark ? '#28252f' : '#fff'}">${route.id}</span>` })
        }).on('click', event => popup(event, routePopup([route]))).addTo(group);
        marker.getElement().setAttribute('aria-label', `步行 ${route.id} · ${route.name}`);
      });
    }
    async function setVisible(value) {
      const token = ++request;
      visible = !!value;
      if (!visible) {
        map.removeLayer(group); group.clearLayers();
        if (attributed) { map.attributionControl.removeAttribution(attribution); attributed = false; }
        if (activePopup) map.closePopup(activePopup);
        map.fire('walkwayschange');
        return false;
      }
      try {
        data = await load();
        if (token !== request || !visible) return visible;
        group.addTo(map);
        if (!attributed) { map.attributionControl.addAttribution(attribution); attributed = true; }
        render();
        map.fire('walkwayschange');
        return true;
      } catch (error) {
        if (token === request) { visible = false; onError(error.message); }
        return false;
      }
    }
    map.on('zoomend', render);
    return { setVisible, isVisible:() => visible,
      setTheme(value) { theme = value; render(); },
      getState:() => ({ visible, loaded:!!data, paths:data ? data.network.length : 0, candidates:data ? data.connections.length : 0,
        routes:data ? data.routes.length : 0,
        displayedPaths:visible && data && map.getZoom() >= 16 ? data.displayPaths.length : 0 }) };
  }
  root.CUHK_WALKWAYS = { create };
})(globalThis);
