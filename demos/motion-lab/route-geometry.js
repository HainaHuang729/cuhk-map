(() => {
  'use strict';
  const stopAnchor = [114.2012549, 22.4225118];
  // Local OSM service-road centerlines: approach, clockwise circle, same exit.
  // This correction belongs to this sample only, not the shared route data.
  const approach = [
    stopAnchor,
    [114.2012846, 22.4225283],
    [114.201321, 22.4225498],
    [114.2015235, 22.4226694],
  ];
  const ring = [
    [114.2015235, 22.4226694],
    [114.2015003, 22.4226987],
    [114.2014913, 22.4227341],
    [114.2014981, 22.4227698],
    [114.2015194, 22.4228003],
    [114.2015482, 22.422819],
    [114.2015822, 22.4228272],
    [114.2016172, 22.4228238],
    [114.2016486, 22.4228092],
    [114.2016725, 22.4227853],
    [114.2016857, 22.4227552],
    [114.2016866, 22.4227227],
    [114.2016751, 22.422692],
    [114.2016527, 22.4226671],
    [114.2016222, 22.422651],
    [114.2015876, 22.4226458],
    [114.2015532, 22.4226523],
    [114.2015235, 22.4226694],
  ];
  const detour = [...approach.slice(1), ...ring.slice(1), ...approach.slice(0,-1).reverse()];
  const same = (a,b) => a && b && Math.abs(a[0]-b[0])<1e-9 && Math.abs(a[1]-b[1])<1e-9;
  function lengths(path) {
    const result = [0];
    for(let i=1;i<path.length;i++) {
      const a=path[i-1],b=path[i];
      result.push(result[i-1]+Math.hypot((b[0]-a[0])*Math.cos(b[1]*Math.PI/180),b[1]-a[1]));
    }
    return result;
  }
  function withShawTurnaround(route) {
    if(!route.stops.includes('shaw_college'))return route;
    const path=[],originalIndices=[],visits=[];
    route.path.forEach((point,index)=>{
      originalIndices.push(path.length);
      path.push(point);
      if(same(point,stopAnchor) && same(route.path[index-1],route.path[index+1])) {
        visits.push(path.length-1);
        path.push(...detour.map(coord=>coord.slice()));
      }
    });
    if(!visits.length)return route;
    const before=lengths(route.path),after=lengths(path),total=after.at(-1);
    let visit=0;
    const progress=route.progress.map((fraction,index)=>{
      // Keep repeated Shaw stops on their own arrivals, before each turnaround.
      if(route.stops[index]==='shaw_college')return after[visits[visit++]]/total;
      const distance=fraction*before.at(-1);
      let end=1;while(end<before.length-1 && before[end]<distance)end++;
      const t=(distance-before[end-1])/(before[end]-before[end-1] || 1);
      const start=after[originalIndices[end-1]],finish=after[originalIndices[end]];
      return (start+(finish-start)*t)/total;
    });
    return {...route,path,progress};
  }
  window.MOTION_ROUTE_GEOMETRY={withShawTurnaround};
})();
