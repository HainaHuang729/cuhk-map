import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

const [protocolFile, miniRoot] = process.argv.slice(2);
if (!miniRoot) throw new Error('Usage: node scripts/test_trip_profile_integration.mjs paired-protocol.json mini-root');
const protocol = JSON.parse(fs.readFileSync(protocolFile, 'utf8'));
const file = `${miniRoot}/miniprogram/pages/index/index.js`;
let vehiclesChecked = 0, stopsChecked = 0;
for (const model of Object.values(protocol.models)) {
  const web = vm.createContext({});
  for (const f of ['data/cuhk_bus_routes.js', 'data/transport_route_schemes.js', 'data/eta_prediction.js']) vm.runInContext(fs.readFileSync(f, 'utf8'), web);
  web.CUHK_TRANSPORT_ROUTE_SCHEMES.applyTransportRouteScheme(web.CUHK_BUS_DATA, '2026-09');
  assert(web.CUHK_ETA_PREDICTION.setModel(model));
  const mini = vm.createContext({Intl: undefined, require: createRequire(file), Page() {}, wx: {getStorageSync: () => null}, console, setTimeout, clearTimeout, setInterval, clearInterval});
  vm.runInContext(fs.readFileSync(file, 'utf8'), mini);
  mini.modelToTest = model;
  vm.runInContext('applyRemoteAppConfig({enabled:true,version:100,etaModel:{predictionModel:modelToTest}})', mini);
  const route = web.CUHK_BUS_DATA.routes.find(r => r.id === '8');
  const last = new Map();
  for (const date of ['2026-10-26T11:29:59+08:00', '2026-10-26T11:30:00+08:00', '2026-10-26T11:35:00+08:00',
    '2026-10-26T13:59:59+08:00', '2026-10-26T14:00:00+08:00', '2026-10-31T12:00:00+08:00']) {
    mini.testAt = new Date(date);
    const a = web.CUHK_BUS_UTILS.activeVehicles(route, new Date(date));
    const b = vm.runInContext('activeVehicles(MAP_DATA.routes.find(r=>r.id==="8"),testAt)', mini);
    assert.deepEqual(Array.from(a,v=>v.id).sort(), Array.from(b,v=>v.id).sort());
    for (const vehicle of a) {
      const other = b.find(v=>v.id===vehicle.id);
      const hk = new Date(vehicle.predictionAt.getTime()+8*3600000);
      assert.equal(hk.getUTCHours()*60+hk.getUTCMinutes(), vehicle.departure);
      assert.equal(vehicle.predictionAt.getTime(), other.predictionAt.getTime());
      // WGS84 and GCJ-02 route projections differ slightly; compare time inputs exactly.
      assert(Math.abs(vehicle.progress-other.progress)<0.01, `progress mismatch: ${vehicle.progress}/${other.progress}`);
      assert.equal(vehicle.tripMinutes, other.tripMinutes);
      const key = `${date.slice(0,10)}/${vehicle.id}`, previous=last.get(key);
      if (previous) {
        assert.equal(vehicle.predictionAt.getTime(),previous.predictionAt.getTime());
        assert(vehicle.progress+1e-9>=previous.progress, 'Scheduled vehicle reversed at bucket boundary');
        assert.equal(vehicle.tripMinutes,previous.tripMinutes);
      }
      last.set(key,vehicle);
      if (other.nextStop) {
        mini.testVehicle=other;
        const eta=vm.runInContext('vehicleNextStopEtaMinutes(testVehicle)',mini);
        const expected=Math.max(0,web.CUHK_ETA_PREDICTION.offset(route,other.nextStop.stopIndex,vehicle.predictionAt)-vehicle.elapsedMinutes);
        assert(Math.abs(eta-expected)<1e-7);
      }
      vehiclesChecked++;
    }
    for(let index=0;index<route.stops.length;index++) {
      const arrival=web.CUHK_BUS_UTILS.nextStopArrival(route,index,new Date(date));
      mini.testIndex=index;
      const native=vm.runInContext('nextStopArrival(MAP_DATA.routes.find(r=>r.id==="8"),testIndex,testAt)',mini);
      assert.equal(arrival.status,native.status);
      if(arrival.status==='scheduled') {
        assert.equal(arrival.departure,native.departure);
        assert(Math.abs(arrival.etaMinutes-native.etaMinutes)<1e-7);
        const offset=web.CUHK_ETA_PREDICTION.offset(route,index,arrival.predictionAt);
        assert(Math.abs(arrival.arrival-arrival.departure-offset)<1e-7);
        assert.equal(arrival.predictionAt.getTime(),native.predictionAt.getTime());
      }
      stopsChecked++;
    }
  }
  assert.equal(vm.runInContext('tripPredictionAt(new Date("2026-10-26T23:59:59+08:00"),0).toISOString()',mini),'2026-10-25T16:00:00.000Z');
  assert.equal(vm.runInContext('tripPredictionAt(new Date("2026-10-27T00:00:00+08:00"),0).toISOString()',mini),'2026-10-26T16:00:00.000Z');
}
console.log(JSON.stringify({vehiclesChecked,stopsChecked,webMiniParity:true,crossBoundaryStable:true,noIntlMiniPassed:true,productionModelChanged:false},null,2));
