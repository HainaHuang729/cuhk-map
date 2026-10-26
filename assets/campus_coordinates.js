// Same forward conversion as the mini-program walking-graph builder.
(function(root) {
  function outside(lng, lat) { return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271; }
  function transformLat(x, y) {
    let r = -100 + 2*x + 3*y + .2*y*y + .1*x*y + .2*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI))*2/3;
    r += (20*Math.sin(y*Math.PI) + 40*Math.sin(y/3*Math.PI))*2/3;
    return r + (160*Math.sin(y/12*Math.PI) + 320*Math.sin(y*Math.PI/30))*2/3;
  }
  function transformLng(x, y) {
    let r = 300 + x + 2*y + .1*x*x + .1*x*y + .1*Math.sqrt(Math.abs(x));
    r += (20*Math.sin(6*x*Math.PI) + 20*Math.sin(2*x*Math.PI))*2/3;
    r += (20*Math.sin(x*Math.PI) + 40*Math.sin(x/3*Math.PI))*2/3;
    return r + (150*Math.sin(x/12*Math.PI) + 300*Math.sin(x/30*Math.PI))*2/3;
  }
  function toGcj02([lng, lat]) {
    if (outside(lng, lat)) return [lng, lat];
    const rad = lat/180*Math.PI;
    const magic = 1 - .006693421622965943*Math.sin(rad)**2, sqrt = Math.sqrt(magic);
    const dy = transformLat(lng-105, lat-35)*180/((6335552.717000426*magic)/(sqrt*sqrt)*Math.PI);
    const dx = transformLng(lng-105, lat-35)*180/(6378245/sqrt*Math.cos(rad)*Math.PI);
    return [lng+dx, lat+dy];
  }
  function toWgs84(coord) {
    let result = coord.slice();
    for (let i = 0; i < 10; i++) {
      const projected = toGcj02(result);
      const dx = projected[0]-coord[0], dy = projected[1]-coord[1];
      result = [result[0]-dx, result[1]-dy];
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 1e-9) break;
    }
    return result;
  }
  const api = { toGcj02, toWgs84 };
  root.CUHK_COORDINATES = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
