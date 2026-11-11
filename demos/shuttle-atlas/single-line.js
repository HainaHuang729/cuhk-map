(() => {
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const data = JSON.parse(JSON.stringify(CUHK_BUS_DATA));
  CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(data, '2026-09');
  const atlas = ShuttleAtlas, graph = ShuttleSingleLine.build(atlas, data);
  const map = $('#map'), drawing = $('#drawing'), detail = $('#detail');
  const state = {route:null, station:null, x:0, y:0, zoom:1, fit:1};
  const routeFor = id => graph.routes.find(r => r.id === id);
  const badge = id => `<span class="route-number">${id}</span>`;
  function render() {
    const active = new Set(graph.routes.filter(r => (!state.route || r.id === state.route) && (!state.station || r.source.stops.includes(state.station))).map(r => r.id));
    const filtered = !!(state.route || state.station);
    let html = '<g aria-hidden="true">', dots = '';
    for (const segment of graph.segments) {
      const used = segment.routes.some(id => active.has(id));
      html += `<path class="skeleton${filtered ? used ? ' selected' : ' inactive' : ''}" d="M${segment.a} L${segment.b}"${segment.conditional ? ' stroke-dasharray="8 7"' : ''}/>`;
    }
    for (const crossing of graph.crossings) {
      const used=crossing.routes.some(id=>active.has(id)),d=`M${crossing.a} L${crossing.b}`;
      html+=`<path d="${d}" fill="none" stroke="white" stroke-width="13"/><path class="skeleton${filtered?used?' selected':' inactive':''}" d="${d}"/>`;
    }
    html += '</g>';
    for (const s of graph.stations) {
      const box = s.box, used = s.routes.some(id => active.has(id));
      const targetX = Math.max(box.x, Math.min(box.x+box.width, s.x));
      const targetY = Math.max(box.y, Math.min(box.y+box.height, s.y));
      html += `<path class="station-link" d="M${s.x},${s.y} L${targetX},${targetY}"/>`;
      dots += `<circle data-station="${s.id}" class="stop-dot ${state.station === s.id ? 'active' : used ? '' : 'dim'}" cx="${s.x}" cy="${s.y}" r="8"/>`;
      html += `<g class="station-label${used ? '' : ' dim'}" data-station="${s.id}" tabindex="0" role="button" aria-label="${escape(s.name)}，途经${s.routes.join('、')}号线"><rect class="label-back" x="${box.x-6}" y="${box.y-6}" width="${box.width+12}" height="${box.height+12}" rx="2"/><text class="station-title" x="${box.x+box.width/2}" y="${box.y+22}" text-anchor="middle">${escape(s.name)}</text><text class="station-subtitle" x="${box.x+box.width/2}" y="${box.y+41}" text-anchor="middle">${escape(s.en)}</text></g>`;
      for (let i = 0; i < s.routes.length; i++) {
        const id = s.routes[i], row = Math.floor(i/box.cols), column = i%box.cols;
        const count = Math.min(box.cols, s.routes.length-row*box.cols);
        const x = box.x+box.width/2+(column-(count-1)/2)*34, y = box.y+61+row*34;
        const route = routeFor(id), occurrences = route.source.stops.map((value,index) => value===s.id ? index : -1).filter(index => index>=0);
        const conditional = occurrences.every(index => atlas.conditional(route.source,index));
        html += `<g data-route="${id}" class="map-badge${state.route === id ? ' selected' : ''}${active.has(id) ? '' : ' dim'}${conditional ? ' conditional' : ''}" tabindex="0" role="button" aria-label="${escape(s.name)}，查看${id}号线"><title>${id}号线${conditional ? ' · 部分班次' : ''}</title><circle cx="${x}" cy="${y}" r="14"/><text x="${x}" y="${y}">${id}</text></g>`;
      }
    }
    drawing.innerHTML = html + dots;
    $('#routes').innerHTML = graph.routes.map(r => `<button class="route-button" data-route="${r.id}" aria-label="${r.id}号线 ${r.label}" aria-pressed="${state.route === r.id}">${badge(r.id)}<span>${r.label}</span></button>`).join('');
    $('#caption').textContent = state.route ? `${state.route}号线 · ${routeFor(state.route).label}` : state.station ? atlas.stations[state.station].name : '全部穿梭线路';
    $('#count').textContent = `${active.size} 条线路 · ${graph.stations.filter(s => s.routes.some(id => active.has(id))).length} 站`;
    renderDetail(); lucide.createIcons();
  }
  function renderDetail() {
    detail.hidden = !state.route && !state.station;
    if (detail.hidden) {detail.innerHTML = ''; return;}
    const close = '<button class="icon-button" data-close aria-label="关闭详情"><i data-lucide="x"></i></button>';
    if (state.route) {
      const r = routeFor(state.route);
      detail.innerHTML = `<div class="detail-head">${badge(r.id)}<h2>${escape(r.label)}</h2>${close}</div><p class="detail-sub">${escape(r.source.schedule.summary)}</p><ol class="stop-list">${r.source.stops.map((id,i) => `<li><button data-focus="${id}"><span>${i+1}</span>${escape(atlas.stations[id].name)}<small>${escape([r.source.stopDirections?.[i],atlas.conditional(r.source,i)].filter(Boolean).join(' · '))}</small></button></li>`).join('')}</ol>`;
    } else {
      const s = graph.stations.find(s => s.id === state.station);
      detail.innerHTML = `<div class="detail-head"><h2>${escape(s.name)}</h2>${close}</div><p class="detail-sub">${escape(s.en)}</p>${s.routes.map(id => {
        const r = routeFor(id);
        const directions = r.source.stops.map((stop,i) => stop === s.id ? [r.source.stopDirections?.[i],atlas.conditional(r.source,i),i === r.source.stops.length-1 ? '终点' : `往 ${atlas.stations[r.source.stops[i+1]].name}`].filter(Boolean).join(' · ') : '').filter(Boolean).join('；');
        return `<button class="detail-route" data-route="${id}">${badge(id)}<span><b>${r.label}</b><small>${escape(directions)}</small></span></button>`;
      }).join('')}`;
    }
  }
  function selectRoute(id) {state.route = state.route === id ? null : id; state.station = null; render(); detail.scrollTop = 0;}
  function clear() {state.route = null; state.station = null; render();}
  function transform() {
    drawing.setAttribute('transform',`translate(${state.x} ${state.y}) scale(${state.zoom})`);
    $('#zoom-in').disabled = state.zoom >= state.fit*6-.00001;
    $('#zoom-out').disabled = state.zoom <= state.fit*.8+.00001;
  }
  function fit(initial = false) {
    state.fit = Math.max(.02, Math.min((map.clientWidth-50)/graph.width,(map.clientHeight-90)/(graph.height+graph.pad*2)));
    state.zoom = state.fit*(initial && map.clientWidth<600 ? 2.4 : 1);
    state.x = (map.clientWidth-graph.width*state.zoom)/2;
    state.y = (map.clientHeight-graph.height*state.zoom)/2;
    transform();
  }
  function zoomAt(zoom, x=map.clientWidth/2, y=map.clientHeight/2) {
    const next = Math.max(state.fit*.8, Math.min(state.fit*6,zoom));
    state.x = x-(x-state.x)*next/state.zoom; state.y = y-(y-state.y)*next/state.zoom;
    state.zoom = next; transform();
  }
  let suppressClick = false;
  document.addEventListener('click', event => {
    if (suppressClick && event.target.closest('#map')) return;
    const target = event.target.closest('[data-route],[data-station],[data-focus],[data-close]');
    if (!target) {if (event.target.closest('#map')) clear(); return;}
    if (target.hasAttribute('data-close')) clear();
    else if (target.dataset.route) selectRoute(target.dataset.route);
    else if (target.dataset.station) {state.station = target.dataset.station; state.route = null; render(); detail.scrollTop=0;}
    else if (target.dataset.focus) {
      const s = atlas.stations[target.dataset.focus];
      state.zoom = Math.max(state.zoom,state.fit*2.4);
      state.x = map.clientWidth*.45-s.x*state.zoom; state.y = map.clientHeight*.3-s.y*state.zoom; transform();
    }
  });
  map.addEventListener('keydown', e => {
    if (e.key==='Escape') clear();
    else if (['Enter',' '].includes(e.key) && e.target.matches('[data-route],[data-station]')) {e.preventDefault();e.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}
    else if (['+','=','-','0'].includes(e.key)) {e.preventDefault();e.key==='0' ? fit() : zoomAt(state.zoom*(e.key==='-' ? 1/1.3 : 1.3));}
  });
  $('#zoom-in').onclick = () => zoomAt(state.zoom*1.3);
  $('#zoom-out').onclick = () => zoomAt(state.zoom/1.3);
  $('#fit').onclick = () => fit();
  $('#reset').onclick = () => clear();
  map.addEventListener('wheel', e => {e.preventDefault();const b=map.getBoundingClientRect();zoomAt(state.zoom*Math.exp(-e.deltaY*.0015),e.clientX-b.left,e.clientY-b.top);},{passive:false});
  const pointers=new Map(); let gesture;
  function startGesture() {
    const points=[...pointers.values()];
    if (!points.length) {gesture=null;return;}
    const center=points.length>1 ? [(points[0][0]+points[1][0])/2,(points[0][1]+points[1][1])/2] : points[0];
    gesture={x:state.x,y:state.y,zoom:state.zoom,center,distance:points.length>1 ? Math.hypot(points[1][0]-points[0][0],points[1][1]-points[0][1]) : 0};
  }
  map.addEventListener('pointerdown',e=>{if(e.button>0)return;if(!pointers.size)suppressClick=false;pointers.set(e.pointerId,[e.clientX,e.clientY]);if(pointers.size>1)suppressClick=true;startGesture();});
  map.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)||!gesture)return;
    pointers.set(e.pointerId,[e.clientX,e.clientY]);const ps=[...pointers.values()];
    const center=ps.length>1 ? [(ps[0][0]+ps[1][0])/2,(ps[0][1]+ps[1][1])/2] : ps[0];
    const dx=center[0]-gesture.center[0],dy=center[1]-gesture.center[1];
    if(ps.length===1&&!suppressClick&&Math.hypot(dx,dy)<5)return;
    suppressClick=true;map.setPointerCapture(e.pointerId);map.classList.add('dragging');
    state.x=gesture.x;state.y=gesture.y;state.zoom=gesture.zoom;
    if(ps.length>1&&gesture.distance){const b=map.getBoundingClientRect();zoomAt(gesture.zoom*Math.hypot(ps[1][0]-ps[0][0],ps[1][1]-ps[0][1])/gesture.distance,gesture.center[0]-b.left,gesture.center[1]-b.top);}
    state.x+=dx;state.y+=dy;transform();
  });
  function endPointer(e) {pointers.delete(e.pointerId);startGesture();if(!pointers.size){map.classList.remove('dragging');setTimeout(()=>{suppressClick=false;},0);}}
  window.addEventListener('pointerup',endPointer);window.addEventListener('pointercancel',endPointer);
  let size;
  new ResizeObserver(()=>{
    const width=map.clientWidth,height=map.clientHeight;
    if(!size||((size.width<600)!==(width<600)))fit(true);
    else {const x=(size.width/2-state.x)/state.zoom,y=(size.height/2-state.y)/state.zoom;state.fit=Math.max(.02,Math.min((width-50)/graph.width,(height-90)/(graph.height+graph.pad*2)));state.zoom=Math.max(state.fit*.8,Math.min(state.fit*6,state.zoom));state.x=width/2-x*state.zoom;state.y=height/2-y*state.zoom;transform();}
    size={width,height};
  }).observe(map);
  render();fit(true);
})();
