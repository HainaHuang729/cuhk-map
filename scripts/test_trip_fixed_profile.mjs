import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const [protocolFile, miniRoot] = process.argv.slice(2);
if (!miniRoot) throw new Error('Usage: node scripts/test_trip_fixed_profile.mjs paired-protocol.json mini-root');
const protocol = JSON.parse(fs.readFileSync(protocolFile, 'utf8'));
const file = `${miniRoot}/miniprogram/pages/index/index.js`;
const context = vm.createContext({require: createRequire(file), Page() {}, wx: {getStorageSync: () => null}, console, setTimeout, clearTimeout, setInterval, clearInterval});
vm.runInContext(fs.readFileSync(file, 'utf8'), context);
context.candidateModel = protocol.models.v11;
vm.runInContext('applyRemoteAppConfig({enabled:true,version:100,etaModel:{predictionModel:candidateModel}})', context);
// Offline experiment only: every time-dependent call receives one immutable departure anchor.
const evaluate = (departure, elapsedMinutes) => {
  context.departureAnchor = new Date(departure); context.testElapsed = elapsedMinutes;
  return vm.runInContext(`(() => {
    const route = MAP_DATA.routes.find(r => r.id === '8');
    const duration = effectiveRouteTripMinutes(route, undefined, departureAnchor);
    const progress = routeProgressAtElapsed(route, testElapsed, duration, departureAnchor);
    const offsets = route.stops.map((_, index) => routeStopOffsetMinutes(route, index, duration, departureAnchor));
    return {duration, progress, offsets, eta: offsets.map(offset => Math.max(0, offset-testElapsed))};
  })()`, context);
};
let states = 0, pairs = 0;
for (const departure of ['2026-10-26T11:10:00+08:00', '2026-10-26T11:29:59+08:00',
  '2026-10-26T11:30:00+08:00', '2026-10-26T13:40:00+08:00', '2026-10-26T13:59:59+08:00',
  '2026-10-26T14:00:00+08:00', '2026-10-31T11:40:00+08:00']) {
  let previous = null;
  let previousSeconds = 0;
  const checkpoints = new Set(Array.from({length: 41}, (_, i) => i * 60));
  for (const hour of ['11:30:00', '14:00:00']) {
    const boundary = (Date.parse(`${departure.slice(0,10)}T${hour}+08:00`) - Date.parse(departure))/1000;
    for (let delta = -30; delta <= 30; delta++) if (boundary+delta >= 0 && boundary+delta <= 2400) checkpoints.add(boundary+delta);
  }
  for (const seconds of [...checkpoints].sort((a,b)=>a-b)) {
    const state = evaluate(departure, seconds/60); states++;
    assert(Number.isFinite(state.progress) && state.progress >= 0 && state.progress <= 1);
    if (previous) {
      assert(state.progress + 1e-9 >= previous.progress, 'Fixed trip must never reverse');
      assert.deepEqual(state.offsets, previous.offsets);
      assert.equal(state.duration, previous.duration);
      for (let i=0;i<state.eta.length;i++) {
        assert(Math.abs(state.eta[i]-Math.max(0,previous.eta[i]-(seconds-previousSeconds)/60))<1e-7);
        // Station arrival and vehicle ETA refer to exactly the same fixed departure offset.
        const arrival = Date.parse(departure) + state.offsets[i]*60000;
        assert(Math.abs(state.eta[i]-Math.max(0,(arrival-Date.parse(departure)-seconds*1000)/60000))<1e-7);
      }
      pairs++;
    }
    previous=state;
    previousSeconds=seconds;
  }
}
console.log(JSON.stringify({offlineOnly:true, states, consecutivePairs:pairs, backwardsProgress:0,
  fixedOffsetJumps:0, etaAndStationArrivalConsistent:true, productionRuntimeChanged:false,
  limitation:'Requires a known scheduled departure. Boarding-only observations cannot invent a departure from old ETA. Does not prove prediction accuracy.'},null,2));
