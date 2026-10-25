import assert from 'node:assert/strict';
import {decodeExtendedJson, readCommand} from './export_cloud_snapshot.mjs';
import {auditChunks, recordingPoints} from './organize_cloud_snapshot.mjs';

assert.deepEqual(decodeExtendedJson({sampleCount: {$numberInt: '29'}, point: {lon: {$numberDouble: '114.21'}},
  timestamp: {$date: {$numberLong: '0'}}, unsafeInteger: {$numberLong: '9007199254740993'}}),
{sampleCount: 29, point: {lon: 114.21}, timestamp: '1970-01-01T00:00:00.000Z', unsafeInteger: '9007199254740993'});
assert.equal(readCommand('ride_gps_sessions', {find: 'ride_gps_sessions', limit: 1}).CommandType, 'QUERY');
assert.equal(readCommand('board_broadcasts', {count: 'board_broadcasts'}).CommandType, 'COMMAND');
assert.throws(()=>readCommand('other_collection', {find: 'other_collection'}));
assert.throws(()=>readCommand('board_broadcasts', {drop: 'board_broadcasts'}));
assert.throws(()=>readCommand('board_broadcasts', {find: 'board_broadcasts', update: 'board_broadcasts'}));
const core={id:'session1',routeId:'8',gpsSampleChunkCount:2,gpsSampleCount:3};
const first={parentPayloadId:'session1',routeId:'8',chunkIndex:0,gpsSamples:[{},{}]};
const last={parentPayloadId:'session1',routeId:'8',chunkIndex:1,gpsSamples:[{}]};
assert.equal(auditChunks([core],[first,last]).issues.length,0);
assert.deepEqual(auditChunks([core],[first]).issues[0].missingIndexes,[1]);
assert.equal(auditChunks([core],[first,first,last]).issues[0].duplicateChunkIndexes,1);
assert.equal(auditChunks([core],[first,{...last,routeId:'3'}]).issues[0].mismatchedRoute,true);
assert.equal(auditChunks([core],[first,last,{...first,parentPayloadId:'missing'}]).orphanChunks,1);
const point={timestamp:'2026-10-15T10:09:00Z',lon:114.21,lat:22.42,accuracy:8};
assert.equal(recordingPoints({gpsSamples:[point]},[{gpsSamples:[point]}]).length,1);
assert.equal(recordingPoints({gpsSamples:[point,{...point,lon:null}]}).length,1);
console.log('PASS: CloudBase extended JSON decoding, read-only allowlist, chunk coverage, duplicates, route mismatches and orphan detection');
