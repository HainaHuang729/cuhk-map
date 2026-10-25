import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const updates = require('../data/campus_updates.js');
const miniSource = '/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
const miniData = '/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/data/campusUpdates.js';
assert.equal(fs.readFileSync(miniData, 'utf8'), fs.readFileSync('data/campus_updates.js', 'utf8'));
assert.equal(updates.events.length, 9);
assert.equal(updates.eventsForBuilding('YIA', new Date('2026-10-04T10:00:00+08:00')).length, 1);
assert.equal(updates.eventsForBuilding('YIA', new Date('2026-10-10T18:00:01+08:00')).length, 0);
assert.equal(updates.eventsForBuilding('RRS', new Date('2026-11-01T00:00:00+08:00')).length, 0);
assert.equal(updates.noticesForStop('campus_circuit_east', new Date('2026-09-18T12:00:00+08:00')).length, 0);
assert.equal(updates.noticesForStop('campus_circuit_east', new Date('2026-10-04T12:00:00+08:00')).length, 2);
assert.equal(updates.checkedAt, '2026-10-25');
for (const id of ['teaching_research_1', 'chung_chi_staff_quarters']) {
  assert.equal(updates.noticesForStop(id, new Date('2026-10-19T23:59:59+08:00')).length, 0);
  const notices = updates.noticesForStop(id, new Date('2026-10-20T00:00:00+08:00'));
  assert.equal(notices.length, 1);
  assert.equal(notices[0].coordinateStatus, 'official_diagram_only');
  assert.match(notices[0].sourceImageUrl, /TSP_ISI_2026_27_/);
  assert.equal(notices[0].end, undefined, 'do not invent an end date for ongoing works');
}
const reviewed = updates.noticesForStop('campus_circuit_east', new Date('2026-10-25T12:00:00+08:00'));
const downstream = reviewed.find(notice => notice.direction === '下行');
assert.equal(downstream.needsReconfirmation, true);
assert.equal(downstream.sourceUrl, 'https://transport.cuhk.edu.hk/whats-new/');
assert.match(downstream.previousSourceUrl, /campus-circuit-east-downwards/);
assert(!downstream.text.includes('物业管理处对出'), 'do not present the unverified old location as current');
assert.equal(updates.historicalNotices.length, 3);
for (const event of updates.events) {
  assert(Number.isFinite(Date.parse(event.start)));
  assert(updates.venues.some((venue) => venue.code === event.buildingCode));
  assert(new URL(event.sourceUrl).hostname.endsWith('.cuhk.edu.hk'));
}
let page;
const mini = vm.createContext({ require: createRequire(miniSource), Page: (value) => { page = value; }, wx: { getStorageSync: () => null }, setTimeout, clearTimeout, setInterval, clearInterval });
vm.runInContext(fs.readFileSync(miniSource, 'utf8'), mini);
for (const venue of updates.venues) {
  const location = vm.runInContext(`courseRoomLocationByShortName(${JSON.stringify(venue.code)})`, mini);
  assert.equal(location.coord[0], venue.coord[0]);
  assert.equal(location.coord[1], venue.coord[1]);
}
const walkingScript = fs.readFileSync('/Users/amadeus/WeChatProjects/miniprogram-1/scripts/build_walking_graph.js', 'utf8');
const coordinates = vm.createContext({});
vm.runInContext(walkingScript.slice(walkingScript.indexOf('function wgs84ToGcj02')), coordinates);
for (const venue of updates.venues) {
  const roundTrip = coordinates.wgs84ToGcj02(venue.webCoord);
  assert(Math.abs(roundTrip[0] - venue.coord[0]) < 1e-7);
  assert(Math.abs(roundTrip[1] - venue.coord[1]) < 1e-7);
}
for (const notice of updates.notices) {
  assert(vm.runInContext(`!!MAP_DATA.stops[${JSON.stringify(notice.stopId)}]`, mini));
  for (const id of notice.routes) assert(vm.runInContext(`MAP_DATA.routes.some(route => route.id === ${JSON.stringify(id)})`, mini));
}
for (const notice of updates.historicalNotices) {
  assert.equal(notice.scope, 'dated_activity');
  assert.equal(notice.endTime, null, 'activity end time is unpublished');
  for (const id of notice.stopIds) {
    assert(vm.runInContext(`!!MAP_DATA.stops[${JSON.stringify(id)}]`, mini));
    assert(!updates.noticesForStop(id, new Date('2026-10-25T12:00:00+08:00')).some(item => item.id === notice.id));
  }
  for (const id of notice.routes) assert(vm.runInContext(`MAP_DATA.routes.some(route => route.id === ${JSON.stringify(id)})`, mini));
}
const intro = vm.runInContext('introModalConfig()', mini);
assert.match(intro.storageKey, /v15/);
const config = JSON.parse(fs.readFileSync('/Users/amadeus/WeChatProjects/miniprogram-1/cloud/app_config_latest.example.json', 'utf8'));
assert.equal(config.intro.content.join('\n\n'), intro.content);
assert.equal(config.intro.title, intro.title);
assert.match(intro.content, /10月20日/);
const markup = fs.readFileSync('index.html', 'utf8');
for (const match of markup.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) if (match[1].trim()) new vm.Script(match[1]);
assert.equal(typeof page.onCalloutTap, 'function');
console.log('PASS: sourced events, ongoing works start dates, archived activities, reused-source warning, valid stops/routes, coordinates, matching intro and HTML syntax');
