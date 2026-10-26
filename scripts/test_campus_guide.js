const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const data = require('../data/campus_guide');
const core = require('../assets/campus_guide_core');
const coordinates = require('../assets/campus_coordinates');
const walking = require('../data/campus_walking');
assert.equal(data.items.length, 132);
assert.equal(new Set(data.items.map(item => item.id)).size, 132);
assert.equal(Object.keys(data.icons.light).length, 21);
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
assert(core.search('牙科','facility').some(item => item.id === 'facility/life/medical/uhc'));
assert(core.search('PSC310','facility').some(item => !item.navigable));
assert(core.search('体育预约','facility').every(item => !item.navigable));
assert(core.search('BATC','building').every(item => !item.navigable));
assert.equal(core.search('Café 12','dining').length, 0);
assert.equal(core.search('Area 39','dining').filter(item => item.hidden && !item.navigable).length, 1);
assert(!core.search('','dining').some(item => item.hidden));
assert.equal(core.phone('3943 6439'), '+85239436439');
assert.equal(core.phone('javascript:123'), '');
assert.equal(core.safeUrl('javascript:alert(1)'), '');
assert.equal(core.safeUrl('https://www.cuhk.edu.hk/'), 'https://www.cuhk.edu.hk/');
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
assert(!fs.readFileSync(require.resolve('../assets/campus_guide_ui.js'),'utf8').includes('watchPosition'));
for (const script of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script[1]);
console.log(`Campus guide: 132 unique facilities, 42 icons, bilingual search, ${count} connected building anchors, seasonal hours, restricted/off-campus navigation, disabled GPS collection passed.`);
