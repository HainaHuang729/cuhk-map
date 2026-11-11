(() => {
  const data=JSON.parse(JSON.stringify(CUHK_BUS_DATA));
  CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(data,'2026-09');
  const atlas=ShuttleAtlas,designs=AtlasDesigns,base=atlas.build(data);
  const family=document.body.dataset.family;
  document.querySelector('#comparison-grid').innerHTML=designs.choices(family).map(p=>{
    const routes=designs.colorize(base,p),url='./?style='+p.id+'&compare=1';
    const badge=family==='a'?p.badge:p.id.toUpperCase();
    const style=Object.entries(designs.variables(p)).map(([k,v])=>`${k}:${v}`).join(';');
    return `<article class="design-card" data-design="${p.id}" data-family="${p.family||''}" style="${style}">
      <header><h2><span class="design-id">${badge}</span>${p.name}</h2><a class="open-design" href="${url}" aria-label="打开方案 ${badge} ${p.name}">打开<i data-lucide="arrow-up-right"></i></a></header>
      <a class="map-preview" href="${url}" aria-label="查看方案 ${badge} 完整线路图"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${atlas.width} ${atlas.height}" data-design="${p.id}" role="img" aria-label="${p.name}线路图"><style>${designs.svgCss(p)}</style>${designs.diagram({atlas,routes,data,design:p,interactive:false})}</svg></a>
      <div class="comparison-key" aria-label="线路颜色">${routes.map(r=>`<span style="--route:${r.color};--route-ink:${r.ink}">${r.id}</span>`).join('')}</div>
    </article>`;
  }).join('');
  lucide.createIcons();
})();
