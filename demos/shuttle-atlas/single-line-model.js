(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  root.ShuttleSingleLine = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  // Merge overlapping centre lines, keeping each route's membership on every interval.
  function mergeSegments(routes) {
    const corridors = new Map();
    const scale = 1000;
    const gcd = (a,b) => b ? gcd(b,a%b) : a;
    for (const route of routes) for (const span of route.spans) {
      for (let i = 1; i < span.center.length; i++) {
        const a = span.center[i - 1].map(n=>Math.round(n*scale)), b = span.center[i].map(n=>Math.round(n*scale));
        let dx=b[0]-a[0],dy=b[1]-a[1];
        if (!dx && !dy) continue;
        if (dx<0 || (!dx && dy<0)) {dx=-dx;dy=-dy;}
        const divisor=gcd(Math.abs(dx),Math.abs(dy)); dx/=divisor;dy/=divisor;
        const axis = dx ? 0 : 1, fixed = a[1]*dx-a[0]*dy;
        const from = Math.min(a[axis], b[axis]), to = Math.max(a[axis], b[axis]);
        const key = `${dx}/${dy}/${fixed}`;
        if (!corridors.has(key)) corridors.set(key, {dx, dy, fixed, intervals: []});
        corridors.get(key).intervals.push({from, to, route: route.id, conditional: !!span.conditional});
      }
    }
    const result = [];
    for (const {dx, dy, fixed, intervals} of corridors.values()) {
      const cuts = [...new Set(intervals.flatMap(v => [v.from, v.to]))].sort((a,b) => a-b);
      for (let i = 1; i < cuts.length; i++) {
        const from = cuts[i-1], to = cuts[i];
        const members = intervals.filter(v => v.from <= from && v.to >= to);
        if (!members.length) continue;
        const point = value => dx ? [value/scale,(fixed+value*dy)/dx/scale] : [-fixed/scale,value/scale];
        result.push({a: point(from), b: point(to), routes: [...new Set(members.map(v => v.route))],
          conditional: members.every(v => v.conditional)});
      }
    }
    return result;
  }
  function build(atlas, data) {
    const routes = atlas.build(data);
    const A='university_station',P='university_station_piazza',Y='yasumoto',C='chung_chi_teaching',
      B='university_sports_centre',S='shaw_hall',F='fung_king_hey',U='united_college',N='new_asia',
      W='residences_3_4',H='shaw_college',Q='postgraduate_hostel',G='university_admin',O='sh_ho',
      X='science_centre',Z='new_asia_circle',J='area_39',E='cw_chu',R='residence_15',L='united_residence',
      K='chan_chun_ha_hostel',T='campus_circuit_east',V='campus_circuit_north';
    const point=id=>[atlas.stations[id].x,atlas.stations[id].y];
    const paths=new Map();
    const link=(a,b,middle=[])=>paths.set(a+'|'+b,[point(a),...middle.map(p=>typeof p==='string'?point(p):p),point(b)]);
    // Station coordinates stay fixed. Via anchors express shared corridors, not extra service stops.
    for(const [a,b] of [[A,B],[B,S],[X,F],[U,N],[U,W],[H,K],[K,L],[L,R],[R,E],[G,O],[O,Q],[J,V],[A,P],
      [A,Q],[B,X],[S,F],[S,G],[S,X],[U,S],[F,U],[F,W],[W,H],[J,E],[V,T],[T,Y],[Y,A],[T,E],[X,Z],[Z,N],[P,C]])link(a,b);
    link(P,B,[A]);link(W,N,[U]);link(E,L,[R]);link(P,Q,[A]);link(Q,B,[A]);
    link(O,A,[Q]);link(O,P,[Q,A]);link(Y,B,[A]);link(S,Z,[X]);link(G,X,[S]);
    link(U,G,[S]);link(W,G,[F,S]);link(H,E,[K,L,R]);link(T,A,[Y]);link(Z,U,[N]);
    link(H,J,[[380,168],[450,98]]);
    for (const route of routes) for (const span of route.spans) {
      const points=paths.get(span.from+'|'+span.to)||paths.get(span.to+'|'+span.from)?.slice().reverse();
      if(!points)throw new Error('Missing shared corridor: '+span.from+' / '+span.to);
      span.center=points.map(p=>p.slice());
    }
    const segments = mergeSegments(routes);
    const positions = {
      university_station: {side:'bottom', dx:95},
      university_station_piazza: {side:'top', dx:20},
      new_asia_circle: {side:'right', dx:30},
      united_residence: {side:'top', dx:0},
      cw_chu: {side:'bottom', dx:-45},
      science_centre: {side:'top', dx:-80},
      fung_king_hey: {side:'left', dx:-24},
      yasumoto: {side:'right', dx:30},
      campus_circuit_east: {side:'right', dx:30},
      shaw_college: {side:'left', dx:-24},
      residences_3_4: {side:'left', dx:-24},
      university_admin: {side:'bottom', dx:-20},
      sh_ho: {side:'bottom', dx:0},
      postgraduate_hostel: {side:'bottom', dx:0},
      university_sports_centre: {side:'bottom', dx:0, dy:-8},
      shaw_hall: {side:'bottom', dx:110},
    };
    const stations = Object.entries(atlas.stations).map(([id, s]) => {
      const serving = routes.filter(r => r.source.stops.includes(id));
      const p = positions[id] || {}, side = p.side || s.label || 'top';
      const cols = Math.min(4, serving.length), rows = Math.ceil(serving.length / cols);
      const width = Math.max([...s.name].length * 25, cols * 34 - 6, 116);
      const height = 42 + rows * 34;
      const x = s.x + (p.dx || 0) - (side === 'right' ? 0 : side === 'left' ? width : width/2);
      const y = s.y + (p.dy || 0) + (side === 'bottom' ? 26 : ['right','left'].includes(side) ? -height/2 : -height-16);
      return {...s, id, routes: serving.map(r => r.id), box: {x, y, width, height, cols}};
    });
    const crossings=[];
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++) {
      const a=segments[i],b=segments[j],r=[a.b[0]-a.a[0],a.b[1]-a.a[1]],s=[b.b[0]-b.a[0],b.b[1]-b.a[1]];
      const cross=(u,v)=>u[0]*v[1]-u[1]*v[0],denom=cross(r,s);
      if(Math.abs(denom)<.0001)continue;
      const q=[b.a[0]-a.a[0],b.a[1]-a.a[1]],t=cross(q,s)/denom,u=cross(q,r)/denom;
      if(t<=.001||t>=.999||u<=.001||u>=.999)continue;
      const x=a.a[0]+t*r[0],y=a.a[1]+t*r[1];
      if(stations.some(stop=>Math.hypot(stop.x-x,stop.y-y)<12))continue;
      const over=Math.abs(r[1])/Math.hypot(...r)>Math.abs(s[1])/Math.hypot(...s)?a:b;
      const dx=over.b[0]-over.a[0],dy=over.b[1]-over.a[1],length=Math.hypot(dx,dy);
      crossings.push({a:[x-dx/length*13,y-dy/length*13],b:[x+dx/length*13,y+dy/length*13],routes:over.routes});
    }
    return {routes, segments, stations, crossings, width:atlas.width, height:atlas.height, pad:60};
  }
  return {build, mergeSegments};
});
