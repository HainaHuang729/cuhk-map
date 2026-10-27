import fs from 'node:fs';
import path from 'node:path';
import {assertPrivateOutput} from './validate_term_eta.mjs';
import {makeRoadCatalog, availabilityIndex, buildEvidence} from './rebuild_eta_analysis.mjs';
import {academicPeriod} from './study_eta_periods.mjs';

const [datasetFile, rawDirectory, output] = process.argv.slice(2);
if (!output) throw new Error('Usage: node scripts/audit_eta_identifiability.mjs dataset.json raw-directory new-private-output');
assertPrivateOutput(output);
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const dataset = read(datasetFile), catalog = makeRoadCatalog(dataset);
const evidence = buildEvidence(dataset, catalog, availabilityIndex(dataset, read(path.join(rawDirectory, 'ride_gps_sessions.json')), read(path.join(rawDirectory, 'ride_gps_sample_chunks.json'))));
const count = (rows, key) => rows.reduce((out, row) => {const k = key(row) || 'unknown'; out[k] = (out[k] || 0) + 1; return out;}, {});
const term = row => row.period === 'main_term' && row.routeScheme === '2026-09';
let rows = evidence.reported;
const stages = [{stage: 'raw_segment_observations', count: dataset.segmentObservations.length}, {stage: 'prepared_segment_observations', count: rows.length}];
for (const [stage, rule] of [['main_term_current_route', term], ['direct_observed', row => row.source === 'direct_observed'],
  ['eligible_segment', row => row.eligibleForSegmentTraining], ['resolved_road', row => !!row.leg]]) {
  rows = rows.filter(rule); stages.push({stage, count: rows.length, recordings: new Set(rows.map(row => row.sessionId)).size});
}
const eligibleDwell = dataset.dwellObservations.filter(row => {
  const timestamp = row.fromTimestamp || row.observedAt || row.timestamp;
  const date = row.serviceDate || (timestamp ? new Date(Date.parse(timestamp) + 8*3600000).toISOString().slice(0,10) : '');
  return academicPeriod(date) === 'main_term' && row.routeScheme === '2026-09' && row.eligibleForDwellTraining && !row.censoredAtRideEnd && row.source === 'stop_visit';
});
const termDrives = evidence.drives.filter(term);
const report = {segmentSelection: stages, trainingCoverage: count(rows, row => `${row.routeId}/${row.leg.fromIndex}/${row.date}`),
  dwell: {all: dataset.dwellObservations.length, modelEligible: eligibleDwell.length, byRoute: count(eligibleDwell, row => row.routeId),
    byBucket: count(eligibleDwell, row => row.serviceTimeBucket), censored: dataset.dwellObservations.filter(row => row.censoredAtRideEnd).length},
  candidateDepartureToArrival: {count: termDrives.length, recordings: new Set(termDrives.map(row => row.sessionId)).size,
    flagged: termDrives.filter(row => row.flags?.length).length, byRoute: count(termDrives, row => row.routeId)},
  conclusions: ['Candidate departure means the end of a GPS station-zone visit, not verified door closure or actual physical departure.',
    'Zone entry/exit can contain approach/departure driving. Do not jointly fit pure driving and stopped dwell from these proxies without an event audit.',
    'No hierarchical model trained or published; sample counts are coverage, not independent bus runs.'],
  eventAuditNeeded: ['Sampling gaps and accuracy around each entry/exit', 'Nearby overlapping stop zones and repeated stop sequence',
    'Censored start/end visits', 'Stable low-motion cluster vs slow approach/turnaround', 'Whole interval conservation after separating dwell and run']};
fs.mkdirSync(output, {mode: 0o700});
fs.writeFileSync(path.join(output, 'identifiability.json'), JSON.stringify(report, null, 2), {mode: 0o600});
console.log(JSON.stringify({...report, trainingCoverage: undefined}, null, 2));
