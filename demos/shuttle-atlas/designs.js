(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined')module.exports=api;
  root.AtlasDesigns=api;
})(typeof window==='undefined'?globalThis:window,function(){
  const profiles={
    a:{id:'a',badge:'A1',family:'a',name:'标准双语',paper:'#ffffff',surface:'#ffffff',ink:'#241332',muted:'#766e7b',primary:'#602b83',gold:'#d8a512',border:'#dcd4e2',header:'#ffffff',headerInk:'#281333',tint:'#eee5f3',station:'#ffffff',stationStroke:'#241332',lineWidth:8.8,casing:11,marker:'capsule',font:'"PingFang SC", "Microsoft YaHei", sans-serif',fontSize:30,fontWeight:800,
      colors:['#662a8a','#007d8c','#428865','#8c661c','#b14d78','#d8a512','#3d5c9b','#9475b0']},
    b:{id:'b',name:'纸本手绘',paper:'#f5f3f5',surface:'#faf8fa',ink:'#513250',muted:'#9b7e91',primary:'#79466d',gold:'#bd923a',border:'#d5c5cf',header:'#f5f3f5',headerInk:'#513250',tint:'#e9dfe8',station:'#f5f3f5',stationStroke:'#79526e',lineWidth:5.5,casing:8,marker:'rings',font:'"Kaiti SC", STKaiti, KaiTi, serif',fontSize:35,fontWeight:600,
      colors:['#8e4e9c','#4a929c','#7c9c60','#a08756','#c77a8f','#c0a03c','#728ab4','#ac8cb4']},
    c:{id:'c',name:'夜行信号',paper:'#17131d',surface:'#211929',ink:'#f6f0ff',muted:'#ada0bd',primary:'#d9baff',gold:'#f8ce4e',border:'#53445e',header:'#17131d',headerInk:'#f8ce4e',tint:'#392449',station:'#17131d',stationStroke:'#f8ce4e',lineWidth:7.5,casing:10,marker:'night',font:'"PingFang SC", "Microsoft YaHei", sans-serif',fontSize:31,fontWeight:700,
      colors:['#cc8aff','#52d2d3','#a8d882','#d2b891','#ff9fb9','#f8ce4e','#91b2ff','#dec8fc']},
    d:{id:'d',name:'校园路牌',paper:'#f9f9fb',surface:'#ffffff',ink:'#4d255f',muted:'#826e8d',primary:'#603379',gold:'#d9ae3c',border:'#d8cadf',header:'#603379',headerInk:'#ffffff',tint:'#ede5f2',station:'#603379',stationStroke:'#d9ae3c',lineWidth:7,casing:10,marker:'sign',font:'"Songti SC", "Noto Serif CJK SC", serif',fontSize:30,fontWeight:700,
      colors:['#77468e','#3f8086','#799b80','#a88a38','#b2759e','#dbad30','#738ba7','#b9a5c8']},
  };
  Object.assign(profiles,{
    a2:{...profiles.a,id:'a2',badge:'A2',name:'精简中文',lineWidth:6.2,casing:9,fontSize:29,fontWeight:700,english:false,stationWidth:18,stationStroke:'#604b6e',labelMode:'center'},
    a3:{...profiles.a,id:'a3',badge:'A3',name:'白底站牌',lineWidth:7.6,casing:10,fontSize:28,fontWeight:750,english:false,labelBox:true,plateFill:'#ffffff',plateStroke:'#735783',plateInk:'#402650',stationWidth:18,labelMode:'plate'},
    a4:{...profiles.a,id:'a4',badge:'A4',name:'紫金强调',fontSize:31,fontWeight:800,header:'#f2c543',headerInk:'#402350',border:'#d9c7e1',gold:'#e8b82f',station:'#ffdc64',stationStroke:'#5a2874',stationWidth:24,primary:'#5a2874',english:true,goldUnderline:true,
      colors:['#6a328f','#397f8c','#648e70','#9b7c37','#ae5e84','#dfac24','#627baf','#9b80b4']},
  });
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function get(id){return profiles[String(id||'').toLowerCase()]||profiles.a;}
  function choices(family){return (family==='a'?['a','a2','a3','a4']:['a','b','c','d']).map(id=>profiles[id]);}
  function luminance(hex){
    const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  }
  function inkFor(color){
    const l=luminance(color),dark='#241b2b';
    const whiteContrast=1.05/(l+.05),darkContrast=(l+.05)/(luminance(dark)+.05);
    if(Math.max(whiteContrast,darkContrast)<4.5)return '#000000';
    return whiteContrast>darkContrast?'#ffffff':dark;
  }
  function colorize(routes,p){return routes.map(r=>{const index=['1','2','2S','3','4','8','N','H'].indexOf(r.id);const color=index<0?r.color:p.colors[index];return {...r,color,ink:inkFor(color)};});}
  function variables(p){return {'--paper':p.paper,'--surface':p.surface,'--ink':p.ink,'--muted':p.muted,'--purple':p.primary,'--purple-dark':p.primary,'--gold':p.gold,'--line':p.border,'--header':p.header,'--header-ink':p.headerInk,'--tint':p.tint};}
  function labelPosition(s,layout,p){
    const bottom=s.label==='bottom';
    let x=s.x,y=s.y+(bottom?layout.labelMax+43:layout.labelMin-26),anchor='middle';
    if(p.family==='a'){
      x+=24;anchor='start';y=s.y+(bottom?layout.labelMax+44:layout.labelMin-43);
      if(p.labelMode==='center'){
        x=s.x;anchor='middle';y=s.y+(bottom?layout.labelMax+46:layout.labelMin-26);
      }else if(p.labelMode==='plate'){
        x=s.x;anchor='middle';y=s.y+(bottom?layout.labelMax+64:layout.labelMin-39);
        if(s.name==='科学馆')x-=64;
      }
    }else if(p.id==='b'){
      x-=24;anchor='end';y=s.y+(bottom?layout.labelMax+45:layout.labelMin-24);
    }else if(p.id==='c'){
      y=s.y+(bottom?layout.labelMax+51:layout.labelMin-29);
    }else if(p.id==='d'){
      y=s.y+(bottom?layout.labelMax+66:layout.labelMin-40);
      if(s.name==='科学馆')x-=68;
    }
    return {x,y,anchor,bottom};
  }
  function svgCss(p){
    const scope=`[data-design="${p.id}"]`;
    return `${scope} .route-line{fill:none;stroke-linecap:${p.id==='c'?'square':'round'};stroke-linejoin:round}
      ${scope} .route-layer{${p.id==='b'?'filter:url(#pencil-b)':''}}
      ${scope} .route-layer.dim{opacity:${p.id==='c'?.09:.065}}
      ${scope} .station-name{font-family:${p.font};font-size:${p.fontSize}px;font-weight:${p.fontWeight};fill:${p.ink};paint-order:stroke;stroke:${p.paper};stroke-width:${p.id==='b'?5:7};stroke-linejoin:round}
      ${scope} .station-cover{fill:${p.station};stroke:${p.stationStroke};stroke-width:${p.id==='b'?1.4:2.2}}
      ${scope} .station-leader{fill:none;stroke:${p.stationStroke};stroke-width:1.4}
      ${scope} .station-spine{stroke:${p.stationStroke};stroke-width:1.7}
      ${scope} .station-english{font-family:Arial,sans-serif;font-size:14px;fill:${p.muted};paint-order:stroke;stroke:${p.paper};stroke-width:4;stroke-linejoin:round}
      ${scope} .station.dim{opacity:.13;pointer-events:none}
      ${scope} .station-hit{fill:transparent}
      ${scope} .station.selected .station-cover,${scope} .station:focus-visible .station-cover{stroke:${p.gold};stroke-width:4}
      ${scope} .station-nameplate{fill:${p.plateFill||p.primary};stroke:${p.plateStroke||p.gold};stroke-width:2.2}
      ${scope} .station-name.in-plate{fill:${p.plateInk||'#fff'};stroke:none;font-size:${p.fontSize}px}
      ${scope} .station.selected .station-nameplate{fill:${p.gold}}
      ${scope} .station.selected .station-name.in-plate{fill:#32213f}
      ${scope} .station-underline{stroke:${p.gold};stroke-width:3}
      ${scope} .direction-arrow{fill:none;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
      ${scope} .line-hit{fill:none;stroke:transparent;stroke-width:20;pointer-events:stroke;cursor:pointer}
      ${scope} .station{cursor:pointer;outline:none}
      ${scope} .station:focus-visible .station-name{fill:${p.primary}}`;
  }
  function arrow(points,color){
    let index=0,length=0;
    for(let i=1;i<points.length;i++){const l=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);if(l>length){length=l;index=i;}}
    if(length<130)return '';
    const a=points[index-1],b=points[index],x=a[0]+(b[0]-a[0])*.38,y=a[1]+(b[1]-a[1])*.38,angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;
    return `<path class="direction-arrow" d="M-6,-6 L0,0 L-6,6" stroke="${color}" transform="translate(${x} ${y}) rotate(${angle})"/>`;
  }
  function marker(s,layout,p){
    if(!layout.active.length)return '';
    const {min,max,length}=layout;
    if(p.marker==='rings')return `<path class="station-spine" d="M${s.x},${s.y+min} V${s.y+max}"/>`+layout.active.map(r=>`<circle class="station-ring" cx="${s.x}" cy="${s.y+r.shift}" r="6.8" fill="${p.station}" stroke="${r.color}" stroke-width="2.3"/><circle cx="${s.x+1}" cy="${s.y+r.shift-1}" r="8.5" fill="none" stroke="${r.color}" stroke-width=".65"/>`).join('');
    const width=layout.active.length===1?18:p.stationWidth||(p.marker==='sign'?15:p.marker==='night'?22:20),radius=p.marker==='night'?0:p.marker==='sign'?2:10;
    return `<rect class="station-cover" x="${s.x-width/2}" y="${s.y+min-9}" width="${width}" height="${length}" rx="${layout.active.length===1?width/2:radius}"/>`+
      layout.active.map(r=>p.marker==='night'?`<rect class="station-dot" x="${s.x-3.5}" y="${s.y+r.shift-3.5}" width="7" height="7" fill="${r.color}"/>`:`<circle class="station-dot" cx="${s.x}" cy="${s.y+r.shift}" r="${p.marker==='sign'?3:3.5}" fill="${r.color}"/>`).join('');
  }
  function diagram({atlas,routes,data,design:p,activeIds,selectedRoute=null,selectedStation=null,interactive=true}){
    const active=activeIds||new Set(routes.map(r=>r.id));
    let html=p.id==='b'?`<defs><filter id="pencil-b" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".045" numOctaves="2" seed="8" result="noise"/><feDisplacementMap in="SourceGraphic" in2="noise" scale="1.4" xChannelSelector="R" yChannelSelector="G"/></filter><pattern id="paper-b" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="8" r=".65" fill="#a393a1" opacity=".22"/></pattern></defs><rect width="${atlas.width}" height="${atlas.height}" fill="url(#paper-b)" pointer-events="none"/>`:p.id==='c'?`<defs><pattern id="signal-c" width="36" height="36" patternUnits="userSpaceOnUse"><circle cx="18" cy="18" r="1" fill="#a692ba" opacity=".2"/></pattern></defs><rect width="${atlas.width}" height="${atlas.height}" fill="url(#signal-c)" pointer-events="none"/>`:'';
    for(const r of routes){
      const paths=new Set();
      html+=`<g class="route-layer${active.has(r.id)?'':' dim'}" data-route-layer="${r.id}">`;
      for(const span of r.spans){
        const key=[span.from,span.to].sort().join('|');if(paths.has(key))continue;paths.add(key);
        const dash=span.conditional?' stroke-dasharray="9 6"':'';
        html+=`<path class="route-line" d="${span.d}" stroke="${p.paper}" stroke-width="${p.casing}"/><path class="route-line" data-route="${r.id}" d="${span.d}" stroke="${r.color}" stroke-width="${p.lineWidth}"${dash}/>`;
        if(p.id==='c')html+=`<path class="route-line rail-inset" d="${span.d}" stroke="${p.paper}" stroke-width="2.5"${dash} pointer-events="none"/>`;
        if(p.id==='b')html+=`<path class="route-line pencil-grain" d="${span.d}" stroke="${p.paper}" stroke-opacity=".5" stroke-width="1" stroke-dasharray="2 5 1 7" pointer-events="none"/>`;
      }
      html+='</g>';
    }
    if(interactive)for(const r of routes.filter(r=>active.has(r.id)))for(const span of r.spans)html+=`<path class="line-hit" data-route="${r.id}" d="${span.d}" aria-hidden="true"/>`;
    if(selectedRoute){const r=routes.find(r=>r.id===selectedRoute);html+=`<g class="arrows">${r.spans.map(s=>arrow(s.points,r.ink)).join('')}</g>`;}
    for(const [id,s] of Object.entries(atlas.stations)){
      const layout=atlas.stationLayout(id,routes,active),visible=layout.active.length>0;
      const label=labelPosition(s,layout,p),plate=(p.marker==='sign'||p.labelBox)&&visible;
      const width=Array.from(s.name).reduce((n,c)=>n+(c.charCodeAt(0)>255?p.fontSize:p.fontSize*.58),0)+32;
      const plateLeft=label.x-width/2,plateTop=label.y-34;
      const markerEnd=s.y+(label.bottom?layout.max+9:layout.min-9);
      const labelEnd=label.y+(label.bottom?-p.fontSize-7:8);
      html+=`<g class="station${visible?'':' dim'}${selectedStation===id?' selected':''}" data-station="${id}" data-capsule-length="${layout.length}" data-visible-routes="${layout.active.map(r=>r.id).join(',')}"${interactive?` tabindex="${visible?0:-1}" role="button" aria-label="${escape(data.stops[id].name)}，${layout.all.map(r=>r.id).join('、')}号线"`:''}>
        <title>${escape(data.stops[id].name)} · ${layout.all.map(r=>r.id).join(' / ')}</title>`;
      if(visible){
        if(interactive)html+=`<rect class="station-hit" x="${s.x-98}" y="${Math.min(s.y+layout.labelMin-16,label.y-40)}" width="196" height="${layout.labelMax-layout.labelMin+120}"/>`;
        html+=marker(s,layout,p);
        if(p.family==='a'||p.id==='b'||p.id==='d')html+=`<path class="station-leader" d="M${s.x},${markerEnd} V${labelEnd}${label.anchor==='start'?' H'+(label.x-7):label.x!==s.x?' H'+label.x:''}"/>`;
      }
      if(plate)html+=`<rect class="station-nameplate" x="${plateLeft}" y="${plateTop}" width="${width}" height="48" rx="2"/>`;
      html+=`<text class="station-name${plate?' in-plate':''}" x="${label.x}" y="${label.y}" text-anchor="${label.anchor}">${escape(s.name)}</text>`;
      if(p.family==='a'&&p.english!==false)html+=`<text class="station-english" x="${label.x}" y="${label.y+26}" text-anchor="${label.anchor}">${escape(s.en)}</text>`;
      if(p.goldUnderline&&visible)html+=`<path class="station-underline" d="M${label.x},${label.y+9} h${width-32}"/>`;
      html+='</g>';
    }
    return html;
  }
  return {profiles,get,choices,inkFor,colorize,variables,labelPosition,svgCss,diagram};
});
