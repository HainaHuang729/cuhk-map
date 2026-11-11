(function(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined') module.exports = api;
  root.ShuttleAtlas = api;
})(typeof window === 'undefined' ? globalThis : window, function() {
  const routes = [
    {id:'1', label:'本部线', color:'#70418c'},
    {id:'2', label:'新联线', color:'#317c80'},
    {id:'2S', label:'新联线 S', color:'#719f8b', ink:'#172c26'},
    {id:'3', label:'逸夫线', color:'#817646'},
    {id:'4', label:'环迴线', color:'#9a5878'},
    {id:'8', label:'西部线', color:'#c29a37', ink:'#342817'},
    {id:'N', label:'晚间线', color:'#5e7396'},
    {id:'H', label:'假日线', color:'#9b88b2', ink:'#2e213c'},
  ];
  const meetClassRoutes = [
    {id:'5',label:'上行线',color:'#7194a4',service:'meetClass'},
    {id:'6A',label:'敬文下行',color:'#678145',service:'meetClass'},
    {id:'6B',label:'新联下行',color:'#487ead',service:'meetClass'},
    {id:'7',label:'逸夫下行',color:'#77727d',service:'meetClass'},
  ];
  const routeOrder=['1','2','2S','3','4','5','6A','6B','7','8','N','H'];
  function inGroup(route,group){
    const meet=route.service==='meetClass';
    return group==='all'||group==='shuttle'&&!meet||group==='meet'&&meet||group==='day'&&!meet&&!['N','H'].includes(route.id)||group==='special'&&['N','H'].includes(route.id);
  }
  function groupLabel(group){return {all:'全部校巴线路',shuttle:'穿梭校巴',meet:'转堂校巴 · 仅教学日',day:'日间穿梭线路',special:'晚间与假日线路'}[group]||'全部校巴线路';}
  const stations = {
    university_station:{x:1560,y:1040,name:'大学站',en:'University Station',label:'bottom'},
    university_station_piazza:{x:1740,y:1040,name:'大学站广场',en:'Station Piazza',label:'top'},
    yasumoto:{x:1540,y:800,name:'康本园',en:'Yasumoto International Academic Park'},
    chung_chi_teaching:{x:1740,y:1230,name:'崇基教学楼',en:'Chung Chi Teaching Buildings',label:'bottom'},
    university_sports_centre:{x:1140,y:1040,name:'大学体育中心',en:'University Sports Centre',label:'top'},
    shaw_hall:{x:800,y:1040,name:'邵逸夫堂',en:'Sir Run Run Shaw Hall',label:'bottom'},
    science_centre:{x:1000,y:800,name:'科学馆',en:'Science Centre',label:'bottom'},
    fung_king_hey:{x:460,y:800,name:'冯景禧楼',en:'Fung King Hey Building',label:'top'},
    university_admin:{x:650,y:1230,name:'大学行政楼',en:'University Administration',label:'bottom'},
    sh_ho:{x:1000,y:1230,name:'善衡书院',en:'S.H. Ho College',label:'bottom'},
    united_college:{x:720,y:500,name:'联合书院',en:'United College',label:'top'},
    new_asia:{x:1040,y:500,name:'新亚书院',en:'New Asia College',label:'top'},
    new_asia_circle:{x:1040,y:650,name:'新亚坊',en:'New Asia Circle',label:'top'},
    residences_3_4:{x:380,y:500,name:'伍宜孙书院',en:'三、四苑',label:'top'},
    shaw_college:{x:380,y:280,name:'逸夫书院',en:'Shaw College',label:'top'},
    postgraduate_hostel:{x:1270,y:1230,name:'研究生宿舍',en:'Postgraduate Hall',label:'bottom'},
    cw_chu:{x:1300,y:280,name:'敬文书院',en:'C.W. Chu College',label:'bottom'},
    area_39:{x:1150,y:100,name:'39区',en:'Area 39',label:'top'},
    residence_15:{x:1080,y:280,name:'15苑',en:'Residence 15',label:'top'},
    united_residence:{x:860,y:280,name:'联合苑',en:'United Residence',label:'bottom'},
    chan_chun_ha_hostel:{x:640,y:280,name:'陈震夏宿舍',en:'Chan Chun Ha Hostel',label:'top'},
    campus_circuit_east:{x:1630,y:500,name:'环迴东路',en:'Campus Circuit East',label:'top'},
    campus_circuit_north:{x:1530,y:100,name:'环迴北站',en:'Campus Circuit North',label:'top'},
  };
  const A='university_station', P='university_station_piazza', Y='yasumoto', C='chung_chi_teaching', B='university_sports_centre', S='shaw_hall', F='fung_king_hey', U='united_college', N='new_asia', W='residences_3_4', H='shaw_college', Q='postgraduate_hostel', G='university_admin', O='sh_ho', X='science_centre', Z='new_asia_circle', J='area_39', E='cw_chu', R='residence_15', L='united_residence', K='chan_chun_ha_hostel', T='campus_circuit_east', V='campus_circuit_north';
  const legs = {};
  const point = id => [stations[id].x, stations[id].y];
  const link = (a,b,middle=[]) => { legs[a+'|'+b] = [point(a), ...middle, point(b)]; };
  link(A,B);link(P,B);link(B,S);link(X,F);link(U,N);link(W,N);link(U,W);link(H,K);link(K,L);link(L,R);link(R,E);link(E,L);link(G,O);link(O,Q);link(J,V);link(A,P);
  link(P,Q,[[1590,1040],[1590,1230]]);
  link(A,Q,[[1490,1040],[1490,1230]]);
  link(Q,B,[[1390,1230],[1390,1040]]);
  link(O,A,[[1490,1230],[1490,1040]]);
  link(O,P,[[1590,1230],[1590,1040]]);
  link(Y,B,[[1390,800],[1390,1040]]);
  link(B,X,[[1250,1040],[1250,800]]);
  link(S,F,[[620,1040],[620,800]]);
  link(S,G,[[920,1040],[920,1230]]);
  link(S,Z,[[880,1040],[880,650]]);
  link(G,X,[[760,1230],[760,800]]);
  link(F,U,[[580,800],[580,500]]);
  link(F,W,[[260,800],[260,500]]);
  link(U,G,[[840,500],[840,1230]]);
  link(W,G,[[500,500],[500,1230]]);
  link(W,H,[[260,500],[260,280]]);
  link(H,E,[[160,280],[160,180],[1420,180],[1420,280]]);
  link(H,J,[[260,280],[260,100]]);
  link(J,E,[[1420,100],[1420,280]]);
  link(V,T,[[1780,100],[1780,500]]);
  link(T,Y,[[1780,500],[1780,800]]);
  link(T,A,[[1780,500],[1780,1040]]);
  link(T,E,[[1510,500],[1510,280]]);
  link(Z,U,[[1160,650],[1160,500]]);
  link(X,Z,[[1160,800],[1160,650]]);
  link(P,C,[[1870,1040],[1870,1230]]);
  link(C,B,[[1870,1230],[1870,1040]]);
  link(K,W,[[500,280],[500,500]]);

  // Compress only empty vertical space; lane spacing remains fixed in screen-independent units.
  Object.values(stations).forEach(s=>{s.y=s.y*.78+20;});
  Object.values(legs).forEach(points=>points.forEach(p=>{p[1]=p[1]*.78+20;}));

  function pathFor(a,b) {
    const path = legs[a+'|'+b] || legs[b+'|'+a]?.slice().reverse();
    if (!path) throw new Error('Missing topology: '+a+' -> '+b);
    return path.map(p=>p.slice());
  }
  function simplify(points) {
    return points.filter((p,i) => !i || i===points.length-1 || !((points[i-1][0]===p[0] && p[0]===points[i+1][0]) || (points[i-1][1]===p[1] && p[1]===points[i+1][1])));
  }
  function offset(points, amount) {
    return simplify(points).map((p,i,list) => {
      const before=list[i-1],after=list[i+1];
      const vertical = (before && before[0]===p[0]) || (after && after[0]===p[0]);
      const horizontal = (before && before[1]===p[1]) || (after && after[1]===p[1]);
      return [p[0]+(vertical ? amount : 0),p[1]+(horizontal ? amount : 0)];
    });
  }
  function roundedPath(points, radius=17) {
    let d='M'+points[0].join(',');
    for(let i=1;i<points.length-1;i++) {
      const a=points[i-1],b=points[i],c=points[i+1];
      const l1=Math.hypot(b[0]-a[0],b[1]-a[1]),l2=Math.hypot(c[0]-b[0],c[1]-b[1]);
      const r=Math.min(radius,l1/2,l2/2);
      const p=[b[0]+(a[0]-b[0])*r/l1,b[1]+(a[1]-b[1])*r/l1],q=[b[0]+(c[0]-b[0])*r/l2,b[1]+(c[1]-b[1])*r/l2];
      d+=' L'+p.join(',')+' Q'+b.join(',')+' '+q.join(',');
    }
    return d+' L'+points.at(-1).join(',');
  }
  function conditional(route, index) {
    const stop=route.stops[index];
    if(route.id==='2' && stop===S) return '45 分班次';
    if((route.id==='N'||route.id==='H') && stop===Q) return '00 分班次';
    if(route.id==='H' && stop===J) return '00 分班次';
    if(route.id==='8' && stop===A) return '教学日';
    if(route.id==='8' && index>=19) return '非教学日';
    return '';
  }
  function build(data,{includeMeetClass=false}={}) {
    const styles=includeMeetClass?[...routes,...meetClassRoutes].sort((a,b)=>routeOrder.indexOf(a.id)-routeOrder.indexOf(b.id)):routes;
    return styles.map((style,i)=>{
      const original=data.routes.find(r=>r.id===style.id);
      if(!original) throw new Error('Missing route '+style.id);
      const directions={5:{4:'上行',6:'上行',7:'上行',8:'下行'},'6B':{1:'下行'},7:{0:'下行',1:'下行',3:'下行'}}[style.id];
      const source=directions?{...original,stopDirections:{...directions,...original.stopDirections}}:original;
      const shift=(i-(styles.length-1)/2)*11;
      const spans=source.stops.slice(1).map((stop,j)=>{
        const center=pathFor(source.stops[j],stop),points=offset(center,shift);
        return {from:source.stops[j],to:stop,index:j,center,points,d:roundedPath(points),conditional:conditional(source,j)||conditional(source,j+1)};
      });
      return {service:'shuttle',...style,source,shift,spans};
    });
  }
  function stationLayout(id, builtRoutes, activeIds) {
    const all = builtRoutes.filter(r=>r.source.stops.includes(id));
    const active = all.filter(r=>activeIds.has(r.id));
    const labelMin = Math.min(...all.map(r=>r.shift));
    const labelMax = Math.max(...all.map(r=>r.shift));
    const min = active.length ? Math.min(...active.map(r=>r.shift)) : 0;
    const max = active.length ? Math.max(...active.map(r=>r.shift)) : 0;
    return {all,active,min,max,labelMin,labelMax,length:active.length ? max-min+18 : 0};
  }
  return {routes,meetClassRoutes,inGroup,groupLabel,stations,pathFor,offset,roundedPath,conditional,build,stationLayout,width:1970,height:1140};
});
