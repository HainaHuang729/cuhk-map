(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined')module.exports=api;
  root.GeographicAtlas=api;
})(typeof window==='undefined'?globalThis:window,function(){
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const same=(a,b)=>distance(a,b)<.01;
  const number=n=>Number(n.toFixed(2));
  const xy=p=>p.map(number).join(',');
  const pitch=5.6;
  const preferences={
    area_39:'right',cw_chu:'right',campus_circuit_north:'left',
    residence_15:'right',united_residence:'right',chan_chun_ha_hostel:'right',
    shaw_college:'left',residences_3_4:'left',united_college:'left',new_asia:'top',
    new_asia_circle:'right',fung_king_hey:'left',shaw_hall:'bottom',science_centre:'right',
    university_admin:'left',sh_ho:'top',university_sports_centre:'bottom',
    postgraduate_hostel:'left',campus_circuit_east:'right',yasumoto:'right',
    chung_chi_teaching:'left',university_station:'right',university_station_piazza:'left'
  };
  function projectFactory(coords){
    const lat=coords.reduce((n,p)=>n+p[1],0)/coords.length;
    const kx=111320*Math.cos(lat*Math.PI/180),ky=111320;
    const west=Math.min(...coords.map(p=>p[0])),north=Math.max(...coords.map(p=>p[1]));
    const padding={x:310,y:160};
    return {
      project:p=>[(p[0]-west)*kx+padding.x,(north-p[1])*ky+padding.y],
      width:(Math.max(...coords.map(p=>p[0]))-west)*kx+padding.x*2,
      height:(north-Math.min(...coords.map(p=>p[1])))*ky+padding.y*2,
      metersPerUnit:1,orientation:'north-up',coordinateSystem:'WGS84'
    };
  }
  function closest(p,a,b){
    const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;
    const t=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;
    const q=[a[0]+t*dx,a[1]+t*dy];return {point:q,distance:distance(p,q)};
  }
  function simplify(points,tolerance=2.5){
    if(points.length<3)return points;
    let index=0,max=0;
    for(let i=1;i<points.length-1;i++){
      const d=closest(points[i],points[0],points.at(-1)).distance;
      if(d>max){index=i;max=d;}
    }
    return max>tolerance?[...simplify(points.slice(0,index+1),tolerance).slice(0,-1),...simplify(points.slice(index),tolerance)]:[points[0],points.at(-1)];
  }
  const lengthOf=points=>points.slice(1).reduce((n,p,i)=>n+distance(p,points[i]),0);
  function simplifyCorridor(points,tolerance){
    const length=lengthOf(points),chord=distance(points[0],points.at(-1));
    // Preserve small turning loops even when their ends are almost coincident.
    const limit=length>chord*2.5?Math.min(tolerance,length*.055):tolerance;
    return simplify(points,limit);
  }
  function atFraction(points,fraction){
    let remaining=lengthOf(points)*fraction;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=distance(a,b);
      if(remaining<=length&&length)return [a[0]+(b[0]-a[0])*remaining/length,a[1]+(b[1]-a[1])*remaining/length];
      remaining-=length;
    }
    return points.at(-1).slice();
  }
  function nearestOnPath(point,points){
    let along=0,best={distance:Infinity};
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],candidate=closest(point,a,b);
      if(candidate.distance<best.distance)best={...candidate,along:along+distance(a,candidate.point)};
      along+=distance(a,b);
    }
    return {...best,fraction:along?best.along/along:0};
  }
  function offset(points,amount){
    const normals=points.slice(1).map((p,i)=>{const a=points[i],l=distance(a,p)||1;return [-(p[1]-a[1])/l,(p[0]-a[0])/l];});
    return points.map((p,i)=>{
      const a=normals[Math.max(0,i-1)],b=normals[Math.min(normals.length-1,i)];
      const denom=1+a[0]*b[0]+a[1]*b[1];
      let dx=(a[0]+b[0])/Math.max(.25,denom),dy=(a[1]+b[1])/Math.max(.25,denom);
      const l=Math.hypot(dx,dy);if(l>1.6){dx*=1.6/l;dy*=1.6/l;}
      return [p[0]+dx*amount,p[1]+dy*amount];
    });
  }
  function rounded(points,radius=7){
    if(points.length<2)return '';
    let d='M'+xy(points[0]);
    for(let i=1;i<points.length-1;i++){
      const a=points[i-1],b=points[i],c=points[i+1];
      const r=Math.min(radius,distance(a,b)*.35,distance(b,c)*.35);
      const before=[b[0]+(a[0]-b[0])*r/(distance(a,b)||1),b[1]+(a[1]-b[1])*r/(distance(a,b)||1)];
      const after=[b[0]+(c[0]-b[0])*r/(distance(c,b)||1),b[1]+(c[1]-b[1])*r/(distance(c,b)||1)];
      d+=` L${xy(before)} Q${xy(b)} ${xy(after)}`;
    }
    return d+' L'+xy(points.at(-1));
  }
  function trim(points,startAmount,endAmount){
    const crop=(ps,amount)=>{
      let left=amount;
      for(let i=1;i<ps.length;i++){
        const a=ps[i-1],b=ps[i],length=distance(a,b);
        if(left<length)return [[a[0]+(b[0]-a[0])*left/length,a[1]+(b[1]-a[1])*left/length],...ps.slice(i)];
        left-=length;
      }
      return ps;
    };
    return crop(crop(points,startAmount).reverse(),endAmount).reverse();
  }
  const edgeKey=(a,b)=>[a,b].sort().join('|');
  function network(routes,project,{schematize=false}={}){
    const cornerRadius=schematize?16:7;
    const nodes=new Map(),edges=new Map(),walks=new Map();
    for(const r of routes){
      const walk=[];
      for(const coord of r.source.path){
        const key=coord.map(v=>v.toFixed(5)).join(',');
        if(!nodes.has(key))nodes.set(key,{id:key,point:project(coord),edges:[]});
        if(walk.at(-1)===key)continue;
        if(walk.length){
          const previous=walk.at(-1),id=edgeKey(previous,key);
          if(!edges.has(id)){
            edges.set(id,{id,a:previous,b:key,routes:new Set()});
            nodes.get(previous).edges.push(id);nodes.get(key).edges.push(id);
          }
          edges.get(id).routes.add(r.id);
        }
        walk.push(key);
      }
      walks.set(r.id,walk);
    }
    const signature=e=>routes.filter(r=>e.routes.has(r.id)).map(r=>r.id).join('|');
    const continues=id=>{const es=nodes.get(id).edges;return es.length===2&&signature(edges.get(es[0]))===signature(edges.get(es[1]));};
    const visited=new Set(),chains=[],edgeChain=new Map();
    const grow=(start,edgeId)=>{
      let current=start,id=edgeId;const ids=[start],members=[];
      while(!visited.has(id)){
        visited.add(id);members.push(id);
        const e=edges.get(id);current=e.a===current?e.b:e.a;ids.push(current);
        if(!continues(current))break;
        id=nodes.get(current).edges.find(eid=>eid!==id);
      }
      const sourcePoints=ids.map(id=>nodes.get(id).point);
      let points=(schematize?simplifyCorridor(sourcePoints,38):simplify(sourcePoints)).map(p=>p.slice());
      const a=points[0],b=points.at(-1);
      const reverse=Math.abs(a[1]-b[1])>Math.abs(a[0]-b[0])?a[1]>b[1]:a[0]>b[0];
      if(reverse){points.reverse();sourcePoints.reverse();ids.reverse();members.reverse();}
      const chain={id:chains.length,nodes:ids,edges:members,sourcePoints,points,routes:signature(edges.get(edgeId)).split('|'),lanes:{}};
      for(const [index,routeId] of chain.routes.entries()){
        const lane=offset(points,(index-(chain.routes.length-1)/2)*pitch);
        chain.lanes[routeId]={points:lane,d:rounded(lane,cornerRadius)};
      }
      chains.push(chain);members.forEach(id=>edgeChain.set(id,chain));
    };
    for(const n of nodes.values())if(!continues(n.id))for(const e of n.edges)if(!visited.has(e))grow(n.id,e);
    for(const e of edges.values())if(!visited.has(e.id))grow(e.a,e.id);
    const joins=new Map(routes.map(r=>[r.id,[]])),traversals=new Map(),routeRuns=new Map(),turns=[];
    const endpoint=(chain,routeId,nodeId)=>chain.lanes[routeId].points[nodeId===chain.nodes[0]?0:chain.lanes[routeId].points.length-1];
    for(const r of routes){
      const walk=walks.get(r.id),seen=new Set(),runs=[];
      for(let i=1;i<walk.length;i++){
        const chain=edgeChain.get(edgeKey(walk[i-1],walk[i]));
        const previous=runs.at(-1);
        if(previous&&previous.chain===chain){previous.to=walk[i];continue;}
        runs.push({chain,from:walk[i-1],to:walk[i]});
      }
      routeRuns.set(r.id,runs);
      for(let i=1;i<runs.length;i++){
        const prev=runs[i-1],next=runs[i],key=[prev.chain.id,next.chain.id].sort().join('|')+'@'+next.from;
        if(seen.has(key))continue;seen.add(key);
        turns.push({route:r.id,prev,next});
      }
    }
    // Keep a stable lane order through adjacent road chains, including reverse trips.
    const flippedPoint=(chain,route,node,flip)=>{
      const p=endpoint(chain,route,node),center=nodes.get(node).point;
      return flip?[2*center[0]-p[0],2*center[1]-p[1]]:p;
    };
    const flips=new Set();
    const cost=turn=>{
      const a=flippedPoint(turn.prev.chain,turn.route,turn.prev.to,flips.has(turn.prev.chain.id));
      const b=flippedPoint(turn.next.chain,turn.route,turn.next.from,flips.has(turn.next.chain.id));
      return distance(a,b)**2;
    };
    for(let pass=0;pass<12;pass++){
      let changed=false;
      for(const chain of chains){
        const local=turns.filter(t=>t.prev.chain===chain||t.next.chain===chain);
        const before=local.reduce((sum,t)=>sum+cost(t),0),was=flips.has(chain.id);
        was?flips.delete(chain.id):flips.add(chain.id);
        if(local.reduce((sum,t)=>sum+cost(t),0)<before-.01)changed=true;
        else was?flips.add(chain.id):flips.delete(chain.id);
      }
      if(!changed)break;
    }
    const terminals=new Set([...walks.values()].flatMap(walk=>[walk[0],walk.at(-1)]));
    for(const chain of chains){
      const length=chain.points.slice(1).reduce((n,p,i)=>n+distance(p,chain.points[i]),0);
      const cut=Math.min(18,length*.18);
      const canTrim=id=>nodes.get(id).edges.length>1&&!terminals.has(id);
      const cropped=trim(chain.points,canTrim(chain.nodes[0])?cut:0,canTrim(chain.nodes.at(-1))?cut:0);
      chain.routes.forEach((id,index)=>{
        const points=offset(cropped,(index-(chain.routes.length-1)/2)*pitch*(flips.has(chain.id)?-1:1));
        chain.lanes[id]={points,d:rounded(points,cornerRadius)};
      });
    }
    for(const {route,prev,next} of turns){
        const r={id:route};
        const a=endpoint(prev.chain,r.id,prev.to),b=endpoint(next.chain,r.id,next.from);
        if(same(a,b))continue;
        const toward=(chain,node)=>{
          const ps=chain.lanes[r.id].points,index=node===chain.nodes[0]?0:ps.length-1;
          const end=ps[index],inner=ps[index===0?1:index-1],l=distance(end,inner)||1;
          return [(end[0]-inner[0])/l,(end[1]-inner[1])/l];
        };
        const va=toward(prev.chain,prev.to),vb=toward(next.chain,next.from),reach=Math.min(35,distance(a,b)*.5);
        const ca=[a[0]+va[0]*reach,a[1]+va[1]*reach],cb=[b[0]+vb[0]*reach,b[1]+vb[1]*reach];
        joins.get(r.id).push({from:prev.chain.id,to:next.chain.id,node:next.from,points:[a,ca,cb,b],d:`M${xy(a)} C${xy(ca)} ${xy(cb)} ${xy(b)}`});
    }
    for(const r of routes){
      const runs=routeRuns.get(r.id);
      traversals.set(r.id,runs.map(run=>({chain:run.chain.id,forward:run.chain.nodes.indexOf(run.from)<run.chain.nodes.indexOf(run.to)})));
    }
    return {nodes,edges,chains,joins,traversals};
  }
  const overlaps=(a,b,pad=0)=>a.x<b.x+b.width+pad&&a.x+a.width+pad>b.x&&a.y<b.y+b.height+pad&&a.y+a.height+pad>b.y;
  const inside=(p,b,pad=0)=>p[0]>b.x-pad&&p[0]<b.x+b.width+pad&&p[1]>b.y-pad&&p[1]<b.y+b.height+pad;
  function labels(stations,geometry,width,height){
    const placed=[],roadSamples=[];
    for(const chain of geometry.chains)for(let i=1;i<chain.points.length;i++){
      const a=chain.points[i-1],b=chain.points[i],n=Math.ceil(distance(a,b)/14);
      for(let j=0;j<n;j++)roadSamples.push({point:[a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n],pad:chain.routes.length*pitch/2});
    }
    const entries=Object.entries(stations);
    // Crowded central-campus labels get first choice. The coordinate anchors never move.
    entries.sort((a,b)=>entries.filter(([,s])=>distance([s.x,s.y],[b[1].x,b[1].y])<210).length-entries.filter(([,s])=>distance([s.x,s.y],[a[1].x,a[1].y])<210).length);
    for(const [id,s] of entries){
      const w=Math.max(Array.from(s.name).length*28,s.en.length*6.9),h=47;
      const candidates=[];
      for(const gap of [40,65,95,130,175,230])for(const direction of ['right','left','top','bottom'])for(const along of [0,-45,45,-90,90]){
        const horizontal=direction==='right'||direction==='left';
        const x=horizontal?(direction==='right'?s.x+gap:s.x-gap-w):s.x-w/2+along;
        const y=horizontal?s.y-h/2+along:(direction==='top'?s.y-gap-h:s.y+gap);
        const box={x,y,width:w,height:h};
        if(x<18||y<30||x+w>width-18||y+h>height-24)continue;
        let score=gap*.35+Math.abs(along)*.2+(direction===preferences[id]?0:30);
        score+=placed.filter(b=>overlaps(box,b,12)).length*100000;
        score+=entries.filter(([sid,t])=>sid!==id&&inside([t.x,t.y],box,24)).length*10000;
        score+=roadSamples.filter(r=>inside(r.point,box,r.pad+4)).length*45;
        candidates.push({...box,score,direction});
      }
      candidates.sort((a,b)=>a.score-b.score);
      const box=candidates[0];placed.push(box);s.labelBox=box;
      const target=[Math.max(box.x,Math.min(box.x+box.width,s.x)),Math.max(box.y,Math.min(box.y+box.height,s.y))];
      s.leader=[s.x,s.y,...target];
    }
  }
  function build(data,topology,{schematize=false}={}){
    const routes=topology.build(data,{includeMeetClass:true});
    const ids=Object.keys(topology.stations).filter(id=>routes.some(r=>r.source.stops.includes(id)));
    const projection=projectFactory([...routes.flatMap(r=>r.source.path),...ids.map(id=>data.stops[id].coord)]);
    const geometry=network(routes,projection.project,{schematize}),stations={};
    for(const id of ids){
      const sourcePoint=projection.project(data.stops[id].coord);
      let point=sourcePoint,snap=null;
      if(schematize){
        const members=new Set(routes.filter(r=>r.source.stops.includes(id)).map(r=>r.id));
        for(const chain of geometry.chains){
          if(!chain.routes.some(route=>members.has(route)))continue;
          const candidate=nearestOnPath(sourcePoint,chain.sourcePoints);
          if(!snap||candidate.distance<snap.distance)snap={...candidate,chain:chain.id};
        }
        // Move the display anchor with its corridor, never the stored geographic point.
        if(snap&&snap.distance<=80)point=atFraction(geometry.chains[snap.chain].points,snap.fraction);
      }
      const [x,y]=point;
      stations[id]={...topology.stations[id],x,y,coord:[...data.stops[id].coord],sourcePoint,snap};
    }
    labels(stations,geometry,projection.width,projection.height);
    return {...topology,...projection,stations,routes,geometry,geographic:true,schematize};
  }
  function svgCss(p){return `
    [data-geographic="true"] .route-layer.dim{opacity:.075}
    [data-geographic="true"] .station-name{font-size:28px;font-weight:750;stroke-width:7}
    [data-geographic="true"] .station-english{font-size:13px;stroke-width:4}
    [data-geographic="true"] .station-leader{stroke:${p.muted};stroke-width:1;opacity:.7}
    [data-geographic="true"] .station-cover{stroke-width:2.2}
    [data-geographic="true"] .station.dim{opacity:.18}
    [data-geographic="true"] .line-hit{stroke-width:7}
    [data-geographic="true"] .geo-orientation{font:600 20px Arial,sans-serif;fill:${p.muted}}
  `;}
  function diagram({atlas,routes,data,design:p,activeIds,selectedRoute,selectedStation}){
    const geometry=atlas.geometry;
    let html='';
    for(const r of [...routes].sort((a,b)=>Number(activeIds.has(a.id))-Number(activeIds.has(b.id)))){
      const paths=geometry.chains.filter(c=>c.routes.includes(r.id)).map(c=>c.lanes[r.id].d).concat(geometry.joins.get(r.id).map(j=>j.d));
      html+=`<g class="route-layer${activeIds.has(r.id)?'':' dim'}" data-route-layer="${r.id}"><path class="route-line" d="${paths.join(' ')}" stroke="${p.paper}" stroke-width="5.6"/><path class="route-line" data-route="${r.id}" d="${paths.join(' ')}" stroke="${r.color}" stroke-width="4.2"/></g>`;
    }
    for(const r of routes.filter(r=>activeIds.has(r.id))){
      const paths=geometry.chains.filter(c=>c.routes.includes(r.id)).map(c=>c.lanes[r.id].d);
      html+=`<path class="line-hit" data-route="${r.id}" d="${paths.join(' ')}" aria-hidden="true"/>`;
    }
    if(selectedRoute){
      const r=routes.find(r=>r.id===selectedRoute),seen=new Set();
      for(const run of geometry.traversals.get(r.id)){
        const key=run.chain+':'+run.forward;if(seen.has(key))continue;seen.add(key);
        let points=geometry.chains[run.chain].lanes[r.id].points;
        if(!run.forward)points=[...points].reverse();
        let longest=0,index=0;
        for(let i=1;i<points.length;i++)if(distance(points[i-1],points[i])>longest){longest=distance(points[i-1],points[i]);index=i;}
        if(longest<55)continue;
        const a=points[index-1],b=points[index],t=run.forward?.38:.62,x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t;
        html+=`<path d="M-6,-4 L0,0 L-6,4" fill="none" stroke="${r.color}" stroke-width="3" transform="translate(${xy([x,y])}) rotate(${Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI})" pointer-events="none"/>`;
      }
    }
    for(const [id,s] of Object.entries(atlas.stations)){
      const members=routes.filter(r=>r.source.stops.includes(id)),active=members.filter(r=>activeIds.has(r.id));
      const box=s.labelBox,selected=selectedStation===id;
      const conditional=selectedRoute&&members.find(r=>r.id===selectedRoute)?.source.stops.some((sid,i)=>sid===id&&atlas.conditional(members.find(r=>r.id===selectedRoute).source,i));
      html+=`<g class="station${active.length?'':' dim'}${selected?' selected':''}" data-station="${id}" tabindex="${active.length?0:-1}" role="button" aria-label="${escape(data.stops[id].name)}，${members.map(r=>r.id).join('、')}号线"><title>${escape(data.stops[id].name)} · ${members.map(r=>r.id).join(' / ')}</title>
        <path class="station-leader" d="M${xy(s.leader.slice(0,2))} L${xy(s.leader.slice(2))}"/>
        <circle class="station-hit" cx="${s.x}" cy="${s.y}" r="24"/>
        <rect class="station-hit" x="${box.x-5}" y="${box.y-5}" width="${box.width+10}" height="${box.height+10}"/>
        <circle class="station-cover" cx="${s.x}" cy="${s.y}" r="7"${conditional?' stroke-dasharray="3 2"':''}/>
        <text class="station-name" x="${box.x}" y="${box.y+27}">${escape(s.name)}</text>
        <text class="station-english" x="${box.x}" y="${box.y+46}">${escape(s.en)}</text></g>`;
    }
    html+=`<g class="geo-orientation" transform="translate(${atlas.width-135} 100)" pointer-events="none"><path d="M0,0 L-9,30 L0,23 L9,30 Z" fill="${p.primary}"/><text x="0" y="-15" text-anchor="middle">N</text></g>`;
    return html;
  }
  return {build,diagram,svgCss,projectFactory,network,labels,overlaps,simplify,rounded};
});
