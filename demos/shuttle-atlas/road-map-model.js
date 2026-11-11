(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined')module.exports=api;
  root.ShuttleRoadMap=api;
})(typeof window==='undefined'?globalThis:window,function(){
  const A='university_station',P='university_station_piazza',Y='yasumoto',C='chung_chi_teaching',
    B='university_sports_centre',S='shaw_hall',F='fung_king_hey',U='united_college',N='new_asia',
    W='residences_3_4',H='shaw_college',Q='postgraduate_hostel',G='university_admin',O='sh_ho',
    X='science_centre',Z='new_asia_circle',J='area_39',E='cw_chu',R='residence_15',L='united_residence',
    K='chan_chun_ha_hostel',T='campus_circuit_east',V='campus_circuit_north';
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function build(atlas,data,designs){
    const routes=designs.colorize(atlas.build(data,{includeMeetClass:true}),designs.get('a'));
    const nodes={
      [A]:[2130,1610],[P]:[1960,1730],[Y]:[1950,1490],[C]:[1820,1610],
      [B]:[1730,1240],[O]:[1730,1240],[S]:[1210,1130],[X]:[1410,1130],
      [F]:[660,1110],[U]:[880,930],[N]:[1080,840],[W]:[620,800],
      [H]:[300,430],[K]:[740,610],[L]:[980,610],[R]:[1180,410],
      [E]:[1020,160],[J]:[820,80],[V]:[1340,160],[Q]:[1930,860],
      [T]:[2130,940],[Z]:[1160,1030],[G]:[1200,1380],
      area:[900,160],residence:[1500,260],west:[620,610],united:[620,930],
      asiaLeft:[970,930],asiaRight:[1160,930],central:[840,1240],science:[1520,1240],
      sports:[1730,1240],east:[2130,1240],entrance:[2130,1440],
    };
    const edges=[],lookup=new Map();
    const edge=(a,b,via=[])=>{
      const e={id:edges.length,a,b,points:[nodes[a],...via,nodes[b]],forward:[],reverse:[]};
      edges.push(e);lookup.set(a+'|'+b,{edge:e.id,dir:1});lookup.set(b+'|'+a,{edge:e.id,dir:-1});
    };
    edge(H,'area',[[220,350],[220,330],[390,160]]);
    edge('area',J);edge('area',E);edge(E,V);edge(V,'residence',[[1400,160]]);
    edge('residence',T,[[2130,890]]);edge('residence',R,[[1330,260]]);edge(R,L);edge(L,K);
    edge(K,'west');edge('west',H,[[480,610]]);edge('west',W);edge(W,'united');
    edge('united',F,[[620,1070]]);edge('united',U);edge(U,'asiaLeft');
    edge('asiaLeft',N,[[1060,840]]);edge(N,'asiaRight',[[1160,840]]);edge('asiaRight','asiaLeft');
    edge('asiaRight',Z);edge(Z,S,[[1160,1080]]);edge(S,X);edge(X,'science');
    edge(S,'central',[[950,1130]]);edge(F,'central',[[790,1240]]);
    edge('central',G,[[980,1380]]);edge(G,'science',[[1380,1380]]);
    edge('central','science');edge('science','sports');edge('sports','east');edge('east',T);
    edge(T,Q,[[2050,860]]);edge('east','entrance');edge('entrance',A);
    edge('entrance',Y,[[2080,1490]]);edge(Y,C,[[1870,1490],[1820,1540]]);
    edge(C,P,[[1820,1660],[1890,1730]]);edge(P,A,[[2060,1730],[2130,1660]]);
    const paths=new Map(),anchor=id=>[B,O].includes(id)?'sports':id;
    const link=(a,b,via=[])=>paths.set(a+'|'+b,[anchor(a),...via,anchor(b)]);
    const lower=[ 'east','entrance' ];
    link(A,B,['entrance','east']);link(P,B,[A,'entrance','east']);
    link(B,S,['science',X]);link(B,X,['science']);link(X,F,[S,'central']);
    link(S,F,['central']);link(F,U,['united']);link(F,W,['united']);
    link(U,N,['asiaLeft']);
    link(N,U,['asiaRight','asiaLeft']);
    link(U,W,['united']);link(W,N,['united',U,'asiaLeft']);
    link(W,H,['west']);link(H,K,['west']);link(K,L);link(L,R);
    link(R,E,['residence',V]);link(E,L,[V,'residence',R]);
    link(H,E,['area']);link(H,J,['area']);link(J,E,['area']);link(J,V,['area',E]);
    link(V,T,['residence']);link(T,E,['residence',V]);
    link(T,Y,[...lower]);link(Y,B,['entrance','east']);link(T,A,[...lower]);
    link(A,P);link(P,C);link(P,Q,[A,'entrance','east',T]);
    link(A,Q,['entrance','east',T]);link(Q,B,[T,'east']);
    link(S,G,['central']);link(U,G,['united',F,'central']);
    link(W,G,['united',F,'central']);link(G,X,['science']);
    link(G,O,['science']);link(O,Q,['east',T]);link(O,A,lower);
    link(O,P,[...lower,Y,C]);link(S,Z);link(Z,U,['asiaRight','asiaLeft']);link(X,Z,[S]);
    link(C,B,[Y,'entrance','east']);link(K,W,['west']);
    link(N,W,['asiaRight','asiaLeft',U,'united']);
    function walk(a,b){
      const names=paths.get(a+'|'+b)||paths.get(b+'|'+a)?.slice().reverse();
      if(!names)throw new Error('Missing schematic path '+a+' / '+b);
      return names.slice(1).map((name,i)=>{
        const use=lookup.get(names[i]+'|'+name);
        if(!use)throw new Error('Unconnected road '+names[i]+' / '+name);
        return {...use};
      });
    }
    for(const r of routes){
      r.spans=r.source.stops.slice(1).map((id,i)=>{
        const conditional=atlas.conditional(r.source,i)||atlas.conditional(r.source,i+1);
        const uses=walk(r.source.stops[i],id);
        for(const use of uses)edges[use.edge][use.dir===1?'forward':'reverse'].push({route:r.id,conditional:!!conditional});
        return {from:r.source.stops[i],to:id,index:i,uses,conditional};
      });
    }
    function heading(r,id,index){
      const prev=r.source.stops[index-1],next=r.source.stops[index+1],explicit=r.source.stopDirections?.[index];
      if(id===U)return next===N?'往新亚':next===W?'往逸夫':'往本部';
      if([H,W,E,J,T].includes(id)&&explicit)return explicit;
      if(id===H)return prev===W?'上行':'下行';
      if(id===W)return prev===H?'下行':'上行';
      if(id===E)return prev===T?'上行':'下行';
      if(id===J)return prev===E?'上行':'下行';
      if(id===T)return prev===Y?'上行':'下行';
      return '';
    }
    // Annotation positions are independent of the road nodes and never change when filtering.
    const annotation={
      [H]:{x:-20,y:410,side:'left'},[W]:{x:295,y:760,side:'left'},
      [K]:{x:690,y:480,side:'top'},[L]:{x:1230,y:530,side:'right'},[R]:{x:1260,y:390,side:'right'},
      [J]:{x:490,y:15,side:'left'},[E]:{x:855,y:225,side:'top'},[V]:{x:1340,y:20,side:'top'},
      [U]:{x:665,y:695,side:'top'},[N]:{x:990,y:735,side:'top'},[Z]:{x:1230,y:1020,side:'right'},
      [F]:{x:380,y:1080,side:'left'},[S]:{x:900,y:1030,side:'top'},[X]:{x:1460,y:1000,side:'top'},
      [G]:{x:1000,y:1435,side:'bottom'},[B]:{x:1580,y:1300,side:'bottom'},[O]:{x:1580,y:1085,side:'top'},
      [Q]:{x:1695,y:710,side:'top'},[T]:{x:2180,y:905,side:'right'},
      [Y]:{x:1810,y:1350,side:'top'},[C]:{x:1600,y:1560,side:'left'},
      [P]:{x:1800,y:1785,side:'bottom'},[A]:{x:2200,y:1570,side:'right'},
    };
    const stations=Object.entries(atlas.stations).map(([id,s])=>{
      const groups=new Map();
      for(const r of routes)r.source.stops.forEach((stop,i)=>{
        if(stop!==id)return;
        const h=heading(r,id,i);
        if(!groups.has(h))groups.set(h,new Map());
        const group=groups.get(h),conditional=!!atlas.conditional(r.source,i),previous=group.get(r.id);
        group.set(r.id,{id:r.id,color:r.color,ink:r.ink,conditional:previous?previous.conditional&&conditional:conditional});
      });
      const order=['上行','下行','往新亚','往逸夫','往本部',''];
      const rows=[...groups].sort((a,b)=>order.indexOf(a[0])-order.indexOf(b[0])).map(([label,items])=>({label,badges:[...items.values()]}));
      const directional=rows.length>1;
      const count=Math.max(...rows.map(r=>r.badges.length));
      const columns=!directional&&count===6?6:Math.min(5,count);
      let height=12;
      for(const row of rows){row.y=height;row.lines=Math.ceil(row.badges.length/columns);height+=row.lines*42+8;}
      const width=20+columns*40+(directional?70:0);
      const a=annotation[id],nameWidth=Math.max(s.name.length*29,s.en.length*9);
      const x=nodes[id][0],y=nodes[id][1]+(id===B?8:id===O?-8:0);
      const ax=a.side==='left'?Math.min(a.x,x-width-32):a.x;
      const by=a.side==='top'&&a.y<y?Math.min(a.y+12,y-32-height):a.y+12;
      return {...s,id,x,y,center:nodes[id],routes:routes.filter(r=>r.source.stops.includes(id)).map(r=>r.id),rows,
        label:{x:ax+width/2,y:a.side==='bottom'?by+height+44:by-36,width:nameWidth},box:{x:ax,y:by,width,height,columns,directional},side:a.side};
    });
    return {routes,edges,stations,nodes,walk,geometry:roadGeometry(edges,routes,stations.map(s=>anchor(s.id))),width:2570,height:1980,pad:60};
  }
  function offset(points,amount){
    return points.map((p,i)=>{
      const normals=[];
      if(i){const a=points[i-1],d=Math.hypot(p[0]-a[0],p[1]-a[1]);normals.push([(p[1]-a[1])/d,-(p[0]-a[0])/d]);}
      if(i<points.length-1){const b=points[i+1],d=Math.hypot(b[0]-p[0],b[1]-p[1]);normals.push([(b[1]-p[1])/d,-(b[0]-p[0])/d]);}
      const n=normals[0];if(normals.length===1)return[p[0]+n[0]*amount,p[1]+n[1]*amount];
      const m=normals[1],denom=1+n[0]*m[0]+n[1]*m[1];
      return[p[0]+(n[0]+m[0])*amount/denom,p[1]+(n[1]+m[1])*amount/denom];
    });
  }
  function rounded(points,radius=24){
    let d='M'+points[0].join(',');
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1],l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);
      const r=Math.min(radius,l1/2,l2/2);
      if(!r)continue;
      const p=[b[0]+(a[0]-b[0])*r/l1,b[1]+(a[1]-b[1])*r/l1],q=[b[0]+(c[0]-b[0])*r/l2,b[1]+(c[1]-b[1])*r/l2];
      d+=' L'+p.join(',')+' Q'+b.join(',')+' '+q.join(',');
    }
    return d+' L'+points.at(-1).join(',');
  }
  function roadGeometry(edges,routes,stationNodes=[]){
    const num=n=>Math.round(n*1000)/1000,pair=p=>p.map(num).join(',');
    const unit=(a,b)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]);return [(b[0]-a[0])/length,(b[1]-a[1])/length];};
    const move=(p,t,d)=>[p[0]+t[0]*d,p[1]+t[1]*d];
    const lanes=[],byKey=new Map(),connections=new Map(),ports=new Map();
    for(const e of edges)if(e.forward.length||e.reverse.length){
      for(const [node,p,q] of [[e.a,e.points[0],e.points[1]],[e.b,e.points.at(-1),e.points.at(-2)]]){
        if(!ports.has(node))ports.set(node,[]);
        ports.get(node).push({t:unit(p,q),length:Math.hypot(q[0]-p[0],q[1]-p[1])});
      }
    }
    const trim=node=>{
      const p=ports.get(node);
      if(stationNodes.includes(node))return 0;
      if(p.length===1||p.length===2&&p[0].t[0]*p[1].t[0]+p[0].t[1]*p[1].t[1]<-.999)return 0;
      return Math.min(42,...p.map(port=>port.length*.42));
    };
    for(const e of edges){
      const both=e.forward.length&&e.reverse.length;
      for(const [dir,members] of [[1,e.forward],[-1,e.reverse]]){
        if(!members.length)continue;
        const points=offset(e.points,both?dir*6.5:0);
        if(dir<0)points.reverse();
        const from=dir>0?e.a:e.b,to=dir>0?e.b:e.a;
        const startT=unit(points[0],points[1]),endT=unit(points.at(-2),points.at(-1));
        points[0]=move(points[0],startT,trim(from));
        points[points.length-1]=move(points.at(-1),endT,-trim(to));
        const lane={key:e.id+':'+dir,from,to,points,startT,endT,
          routes:[...new Set(members.map(m=>m.route))],d:rounded(points,40),arrows:[]};
        // Keep direction chevrons away from junction curves and station dots.
        for(let i=1;i<points.length;i++){
          const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
          if(length<130)continue;
          const t=unit(a,b),count=Math.max(1,Math.floor(length/300));
          for(let j=0;j<count;j++){
            const p=move(a,t,65+(length-130)*(j+.5)/count);
            lane.arrows.push({x:num(p[0]),y:num(p[1]),angle:num(Math.atan2(t[1],t[0])*180/Math.PI)});
          }
        }
        lanes.push(lane);byKey.set(lane.key,lane);
      }
    }
    // Only join turns used by actual route sequences, not every arm of a crossing.
    for(const route of routes){
      const uses=route.spans.flatMap(span=>span.uses);
      for(let i=1;i<uses.length;i++){
        const incoming=byKey.get(uses[i-1].edge+':'+uses[i-1].dir),outgoing=byKey.get(uses[i].edge+':'+uses[i].dir);
        if(incoming.to!==outgoing.from)throw new Error('Disconnected junction '+route.id);
        const key=incoming.key+'>'+outgoing.key;
        if(connections.has(key)){const members=connections.get(key).routes;if(!members.includes(route.id))members.push(route.id);continue;}
        const a=incoming.points.at(-1),b=outgoing.points[0];
        const dot=incoming.endT[0]*outgoing.startT[0]+incoming.endT[1]*outgoing.startT[1];
        const reach=dot<-.9?24:Math.max(8,trim(incoming.to)*.7);
        const c1=move(a,incoming.endT,reach),c2=move(b,outgoing.startT,-reach);
        const d=dot>.999||Math.hypot(b[0]-a[0],b[1]-a[1])<.01?'M'+pair(a)+' L'+pair(b):'M'+pair(a)+' C'+pair(c1)+' '+pair(c2)+' '+pair(b);
        connections.set(key,{key,from:incoming.key,to:outgoing.key,node:incoming.to,points:[a,c1,c2,b],d,routes:[route.id]});
      }
    }
    return {lanes,connections:[...connections.values()]};
  }
  function networkSvg(geometry,active,filtered){
    const path=(d,color,extra='',width=8.5)=>`<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${extra}/>`;
    const enabled=p=>p.routes.some(id=>active.has(id));
    const pieces=[...geometry.lanes,...geometry.connections];
    const rails=pieces.map(p=>path(p.d,filtered?'#e5deea':'#633580')).join('');
    const highlight=filtered?pieces.filter(enabled).map(p=>path(p.d,'#d9a619')).join(''):'';
    const arrows=geometry.lanes.map(lane=>lane.arrows.map(a=>path('M-4,-3 L0,0 L-4,3',filtered&&enabled(lane)?'#633580':'white',`transform="translate(${a.x} ${a.y}) rotate(${a.angle})" opacity="${filtered&&!enabled(lane)?.35:1}"`,2.5)).join('')).join('');
    return `<g class="road-network" aria-hidden="true">${rails}${highlight}${arrows}</g>`;
  }
  function diagram(graph,{route=null,station=null,group='all'}={}){
    const active=new Set(graph.routes.filter(r=>(group==='all'||group==='meet'&&r.service==='meetClass'||group==='shuttle'&&r.service!=='meetClass')&&(!route||r.id===route)&&(!station||r.source.stops.includes(station))).map(r=>r.id));
    const filtered=!!(route||station||group!=='all');
    let annotations='',dots='';
    for(const s of graph.stations){
      const enabled=s.routes.some(id=>active.has(id)),b=s.box;
      const target=[Math.max(b.x,Math.min(b.x+b.width,s.x)),Math.max(b.y,Math.min(b.y+b.height,s.y))];
      const selectedStop=station===s.id;
      annotations+=`<g class="road-station${enabled?'':' dim'}" data-station="${s.id}" tabindex="0" role="button" aria-label="${escape(s.name)}，途经${s.routes.join('、')}号线"><title>${escape(s.name)}</title><path d="M${s.x},${s.y} L${target}" class="road-leader"/><text x="${s.label.x}" y="${s.label.y-22}" class="road-en" text-anchor="middle">${escape(s.en)}</text><text x="${s.label.x}" y="${s.label.y+9}" class="road-cn" text-anchor="middle">${escape(s.name)}</text><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="4" class="road-panel${selectedStop?' selected':''}"/>`;
      for(const [ri,row] of s.rows.entries()){
        if(ri)annotations+=`<path d="M${b.x+10},${b.y+row.y-5} h${b.width-20}" class="road-divider"/>`;
        if(b.directional)annotations+=`<text x="${b.x+13}" y="${b.y+row.y+27}" class="road-direction">${row.label}</text>`;
        for(const [i,badge] of row.badges.entries()){
          const cx=b.x+30+(b.directional?70:0)+(i%b.columns)*40,cy=b.y+row.y+20+Math.floor(i/b.columns)*42;
          annotations+=`<g data-route="${badge.id}" class="road-badge${active.has(badge.id)?'':' dim'}" tabindex="0" role="button" aria-label="${escape(s.name)} ${row.label}，查看${badge.id}号线"><title>${badge.id}号线${badge.conditional?' · 部分班次':''}</title><circle cx="${cx}" cy="${cy}" r="17" fill="${badge.color}" stroke="${route===badge.id?'#d9a619':badge.color}" stroke-width="${route===badge.id?4:1}"/><text x="${cx}" y="${cy+1}" fill="${badge.ink}" class="road-number">${badge.id}</text>${badge.conditional?`<text x="${cx+11}" y="${cy-12}" class="road-star">*</text>`:''}</g>`;
        }
      }
      annotations+='</g>';
      dots+=`<circle cx="${s.x}" cy="${s.y}" r="8.5" class="road-stop${selectedStop?' selected':''}${enabled?'':' dim'}" data-station="${s.id}"/>`;
    }
    return networkSvg(graph.geometry,active,filtered)+annotations+dots;
  }
  return {build,diagram,offset,rounded,roadGeometry,networkSvg};
});
