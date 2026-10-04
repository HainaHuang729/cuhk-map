import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const source = '/Users/amadeus/WeChatProjects/miniprogram-1/miniprogram/pages/index/index.js';
let page;
const storage = new Map();
const context = vm.createContext({
  require: createRequire(source),
  Page: (value) => { page = value; },
  wx: { getStorageSync: (key) => storage.get(key), setStorageSync: (key, value) => storage.set(key, value), showToast() {}, showModal: (options) => options.success({ confirm: true }) },
  setTimeout, clearTimeout, setInterval, clearInterval, console,
});
vm.runInContext(fs.readFileSync(source, 'utf8'), context);
const route = vm.runInContext('MAP_DATA.routes.find(route => route.id === "8")', context);
const stopId = route.stops[1];
const stop = vm.runInContext(`MAP_DATA.stops[${JSON.stringify(stopId)}]`, context);
const candidate = { route, stopIndex: 1 };
const nearest = { id: stopId, stop, distanceMeters: 5 };
const point = { lon: stop.coord[0], lat: stop.coord[1], accuracy: 10 };

function instance(uploaded = true) {
  const value = Object.create(page);
  value.data = { isRecording: false };
  value.boardReports = [];
  value.events = 0;
  value.sessions = 0;
  value.setData = (patch, callback) => { Object.assign(value.data, patch); callback?.(); };
  value.saveRideEvent = () => { value.events++; return { timestamp: new Date().toISOString() }; };
  value.startRideSession = () => { value.sessions++; value.data.isRecording = true; };
  value.enqueueGpsUpload = (payload) => { value.payload = payload; };
  value.flushGpsUploadQueue = async () => ({ uploadedIds: uploaded ? [value.payload.id] : [] });
  value.refreshRouteCards = value.refreshMap = value.updateRecordingGpsStatus = () => {};
  value.updateGpsStatus = (text) => { value.status = text; };
  return value;
}

const regular = instance();
regular.saveBoarding(point, nearest, candidate);
await Promise.resolve();
assert.equal(regular.events, 0);
assert.equal(regular.sessions, 0);
assert.equal(regular.data.isRecording, false);
assert.equal(regular.payload.recordType, 'board_broadcast');
assert.equal(regular.payload.routeId, '8');
assert.equal(regular.payload.stopId, stopId);
assert.equal(regular.status, '上车广播已发送');

const failed = instance(false);
failed.saveBoarding(point, nearest, candidate);
await Promise.resolve();
assert.match(failed.status, /本地保存/);
assert.equal(failed.sessions, 0);

const trajectory = instance();
trajectory.saveBoarding(point, nearest, candidate, true);
await Promise.resolve();
assert.equal(trajectory.events, 1);
assert.equal(trajectory.sessions, 1);
assert.equal(trajectory.payload.recordType, 'board_broadcast');

const action = instance();
action.recordBoard = (finish, capture) => { action.capture = capture; finish(); };
action.handlePrimaryAction();
assert.equal(action.capture, false);
action.toggleTrajectoryFromMenu();
assert.equal(action.capture, true);
action.data.isRecording = true;
action.recordAlight = (finish) => { action.ended = true; finish(); };
action.toggleTrajectoryFromMenu();
assert.equal(action.ended, true);

const timestamp = new Date().toISOString();
const message = vm.runInContext(`boardReportMessage({timestamp:${JSON.stringify(timestamp)}, stopName:'TEST'})`, context);
assert.match(message, /^\d{2}:\d{2} /);
assert.equal(vm.runInContext('boardingClockTime("2026-10-04T01:25:00Z")', context), '09:25');
assert.equal(vm.runInContext('boardReportMessage({timestamp:"2020-01-01T00:00:00Z",stopName:"TEST"})', context), '');
const markup = fs.readFileSync(source.replace('.js', '.wxml'), 'utf8');
assert.match(markup, /bindtap="toggleTrajectoryFromMenu"/);
context.testRoute = route;
vm.runInContext(`
  activeVehicles = () => [{id:'scheduled',route:testRoute,coord:[1,2],progress:0.4}];
  boardAnchoredVehicles = () => [
    {id:'scheduled',coord:[9,9],progress:0.9,boardReport:{id:'message'}},
    {id:'extra',coord:[9,9],boardReport:{id:'extra-message'}}
  ];
`, context);
const vehicles = vm.runInContext('activeVehiclesForMap(testRoute)', context);
assert.equal(vehicles.length, 1);
assert.equal(vehicles[0].progress, 0.4);
assert.equal(vehicles[0].coord[0], 1);
assert.equal(vehicles[0].boardReport.id, 'message');
console.log('PASS: broadcast-only boarding, upload failure, opt-in trajectory, finish action, HK clock and expiry');
