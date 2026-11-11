const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../data/campus_guide');
const core = require('../assets/campus_guide_core');
const coordinates = require('../assets/campus_coordinates');
const walking = require('../data/campus_walking');
assert.equal(data.items.length, 498);
assert.equal(new Set(data.items.map(item => item.id)).size, 498);
assert.equal(Object.keys(data.icons.light).length, 22);
assert.equal(Object.keys(data.icons.dark).length, 22);
assert.equal(data.icons.light.mtr, data.icons.dark.mtr);
for (const item of data.items) {
  assert(data.sources[item.source]);
  assert(data.icons.light[item.icon || data.categories[item.category].icon]);
  if (!item.coord) continue;
  const roundtrip = coordinates.toGcj02(item.webCoord);
  assert(Math.max(...roundtrip.map((number,i) => Math.abs(number-item.coord[i]))) < 1e-8, item.id);
}
for (const query of ['LSK飲水機', 'LSK water fountain', 'LSK 饮水机']) {
  assert(core.search(query,'facility').some(item => item.id === 'facility/water/lsk'), query);
}
assert.equal(core.search('饮水机','facility').length, 44);
assert.equal(core.search('walk for green', 'facility').length, 10);
assert.equal(core.search('拍卡', 'facility').length, 12);
assert.equal(core.search('九巴优惠站', 'facility').length, 2);
for (const [query, id] of [['HSHEB 拍卡', 'walk-card/hsheb'], ['UMSO 拍卡', 'walk-card/umso'], ['BFC 九巴', 'fare-saver/bfc'], ['LSK LT1', 'classroom/lsk-lt1'], ['LSK_201', 'classroom/lsk-201']]) {
  assert.equal(core.search(query, 'facility')[0].id, `facility/${id}`, query);
}
for (const id of ['lws', 'lksp']) {
  const item = core.facility(data.items.find(item => item.id === `facility/walk-card/${id}`));
  assert(!item.coord && !item.webCoord && !item.navigable && !item.locatable);
}
assert.equal(core.search('LSK201', 'facility')[0].floor, '2/F');
for (const [query,floor] of [['YIA LT4','2/F'],['WMY301','3/F'],['NAH11','G/F'],['ERB LT','8/F & 9/F']]) {
  assert.equal(core.search(query,'facility')[0].floor,floor,query);
}
assert.equal(core.search('YIA999','facility').length,0);
const kmb=core.search('272K 大学站','stop');
assert(kmb.length && kmb.every(item=>item.category==='public_transit'));
assert(kmb.every(item=>item.name==='大学站'));
assert(kmb.some(item=>data.transitLines(item).includes('272K 往 香港科学园(循环线)')));
const gmb=core.search('807K 大学站','stop');
assert(gmb.some(item=>data.transitLines(item).includes('807K 终点站（由井头村开来）')));
assert.equal(core.search('LSK999', 'facility').length, 0);
for (const query of ['大学站A口', '大學站C出口', '大学站 B 出口']) {
  assert.equal(core.search(query, 'stop')[0].category, 'mtr_exit', query);
  assert.equal(core.search(query, 'stop')[0].icon, 'mtr', query);
}
for (const [query, id] of [['天人合一','16'], ['百万大道','5'], ['君子塔','14'], ['淑女塔','25']]) {
  assert.equal(core.search(query)[0].id, `facility/landmark/${id}`);
}
for (const item of data.items.filter(i => ['public_transit','mtr_exit','landmark'].includes(i.category))) {
  const result = core.facility(item);
  assert(result.locatable && !result.navigable);
}
assert.equal(core.search('专线小巴','stop').length,32);
assert.equal(core.search('何工','building')[0].shortName,'SHB');
assert.equal(core.search('蒙工','building')[0].shortName,'ERB');
assert(core.search('牙科','facility').some(item => item.id === 'facility/life/medical/uhc'));
assert(core.search('PSC310','facility').some(item => !item.navigable));
assert(core.search('体育预约','facility').every(item => !item.navigable));
for (const query of ['天桥', '連廊', 'footbridge']) {
  const bridges = core.search(query, 'facility').filter(item => item.category === 'bridge');
  assert.equal(bridges.length, 5);
  assert(bridges.every(item => item.locatable && !item.navigable && item.coordinatePrecision === 'structure'));
}
assert(core.search('LSK天桥', 'facility').some(item => item.id === 'facility/bridge/lsk'));
assert(!core.facility(data.items.find(item => item.id === 'facility/lift/ws-north-1')).locatable);
assert(core.search('BATC','building').every(item => !item.navigable));
for (const [code, name] of [['LHCH', '利希慎音乐厅'], ['LWC', '李慧珍楼'], ['LHC', '润昌堂'], ['WS1', '和声书院南座']]) {
  for (const query of [code, code.toLowerCase(), name]) {
    const result = core.search(query, 'building')[0];
    assert.equal(result.id, `course-room/${code.toLowerCase()}`, query);
    assert(result.name.includes(name), query);
    assert(result.navigable, query);
  }
}
assert(!core.search('LHCH', 'building').some(item => item.id === 'course-room/lhc'));
assert(!core.search('LWC', 'building').some(item => item.id === 'course-room/ws1'));
assert.equal(data.buildings.filter(item => item.coord).length, 123);
assert.equal(data.buildings.filter(item => !item.coord).length, 3);
for (const [query, id] of [['KSC', 'ksc'], ['龔約翰學生中心', 'ksc'], ['CCADM', 'ccadm'],
  ['崇基學院行政樓', 'ccadm'], ['李達三葉耀珍伉儷樓', 'ldsyb'], ['何添堂', 'shhth'],
  ['11苑', 'r11'], ['五旬節會樓（高座）', 'ccpmhh'], ['CCLIB', 'ccl']]) {
  const result = core.search(query, 'building').find(item => item.id === `course-room/${id}`);
  assert(result && result.webCoord && result.navigable, query);
  const roundtrip = coordinates.toGcj02(result.webCoord);
  assert(Math.max(...roundtrip.map((value, i) => Math.abs(value - result.coord[i]))) < 1e-8, query);
}
assert(core.search('JFC', 'building')[0].note.includes('工程'));
assert(core.search('SHHTH', 'building')[0].note.includes('宿舍'));
for (const code of ['PGH3', 'YS1', 'YS2']) {
  assert(!data.buildings.some(item => item.shortName === code), `Deferred point ${code}`);
}
for (const code of ['PGH2', 'CKYR', 'MYT']) assert(data.buildings.some(item => item.shortName === code && item.coord));
for (const [query, code] of [['朱謝玲玲樓', 'DMCB'], ['伍宜孫書院演藝廳', 'WYST'], ['何草', 'CCHC']]) {
  const result = core.search(query, 'building')[0];
  assert.equal(result.shortName, code, query);
  assert(!result.navigable && !result.webCoord && !result.coord);
  assert(result.note.includes('待核实'));
}
assert.deepEqual(core.search('三兄弟', 'building').map(item => item.shortName).sort(), ['CKB', 'FYB', 'SB']);
for (const [query, code] of [['AITB', 'ARC'], ['顧鐵華費肇芬伉儷樓', 'WS1'], ['楊明標室內體育館', 'UG']]) {
  assert.equal(core.search(query, 'building')[0].shortName, code, query);
}
for (const [query, id] of [['WSCAN', 'node/2386178228'], ['WSTG', 'fno/the-green']]) {
  assert.deepEqual(core.search(query, 'dining').map(item => item.id), [id]);
}
assert.equal(core.search('Café 12','dining').length, 0);
assert.equal(core.search('Area 39','dining').filter(item => item.hidden && !item.navigable).length, 1);
assert(!core.search('','dining').some(item => item.hidden));
assert.equal(core.phone('3943 6439'), '+85239436439');
assert.equal(core.phone('javascript:123'), '');
assert.equal(core.safeUrl('javascript:alert(1)'), '');
assert.equal(core.safeUrl('https://www.cuhk.edu.hk/'), 'https://www.cuhk.edu.hk/');
assert.deepEqual(core.displayNames(core.search('uab','building')[0]), { primary:'大学行政楼', secondary:'University Administration Building' });
assert.deepEqual(core.displayNames({ name:'Café Tolo' }), { primary:'Café Tolo', secondary:'' });
assert.deepEqual(core.displayNames({ name:'大学图书馆', english:'University Library' }), { primary:'大学图书馆', secondary:'University Library' });
assert.deepEqual(core.displayNames({ name:'恩玲楼 Dame Rosina and Professor Lee Quo Wei Building', english:'Dame Rosina and Professor Lee Quo Wei Building' }), { primary:'恩玲楼', secondary:'Dame Rosina and Professor Lee Quo Wei Building' });
assert.equal(data.presentation.routeColors['1'], '#725786');
assert.equal(data.presentation.routeColors['2S'], '#437e80');
const seasonal = data.items.find(item => item.hoursBySeason);
assert.equal(data.hoursFor(seasonal,new Date('2026-05-31T15:59:00Z')),seasonal.hoursBySeason.term);
assert.equal(data.hoursFor(seasonal,new Date('2026-05-31T16:01:00Z')),seasonal.hoursBySeason.summer);
const origin = [114.2128733,22.4170497];
let count = 0;
for (const raw of data.items) {
  const item = core.facility(raw);
  if (!item.navigable) continue;
  const route = walking.route(origin,item.coord);
  assert(route && route.coords.length >= 2 && route.distanceMeters > 0, item.id);
  count++;
}
const html = fs.readFileSync(require.resolve('../index.html'),'utf8');
assert(html.includes('const ENABLE_WEB_GPS_COLLECTION = false'));
assert(html.includes('const ENABLE_WEB_PASSENGER_REPORTS = false'));
assert(html.includes('allowNavigation:false'));
assert(html.includes('id="busRouteDock" class="bus-route-dock" hidden'));
assert(!html.includes('class="arrival-item"'), 'Removed floating bus cards must not be rendered');
assert(!html.includes('busVehiclesLayer.clearLayers()'), 'Refreshing ETA must preserve the selected vehicle marker');
assert(!fs.readFileSync(require.resolve('../assets/campus_guide_ui.js'),'utf8').includes('watchPosition'));
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log(`Campus guide: 498 unique facilities, 44 icons including MTR, bilingual search, ${count} connected building anchors, public transit directions, official classroom floors, restricted navigation and disabled GPS collection passed.`);
