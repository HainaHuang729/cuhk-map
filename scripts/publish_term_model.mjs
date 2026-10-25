import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {decodeExtendedJson} from './export_cloud_snapshot.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV = 'cloudbase-d1g7dd3ly9e8c04d3';

export function makeTermConfigUpdate(current, etaModel, updatedAt) {
  const model = etaModel?.predictionModel;
  if (current?.kind !== 'latest' || typeof current._id !== 'string' || !Number.isFinite(Number(current.version))) throw new Error('Expected one existing, versioned latest app configuration');
  if (model?.schema !== 'cuhk_eta_prediction_v1' || model.trainingPeriod?.start !== '2026-09-07'
    || model.training?.summerRecordsUsed !== 0 || model.training?.transitionRecordsUsed !== 0 || model.training?.interpolatedLabelsUsed !== 0) {
    throw new Error('Only an audited term-only prediction model may be published');
  }
  if (Object.keys(etaModel).some(key => !['trainingPeriod', 'routes', 'segments', 'routeSegments', 'stopDwell', 'predictionModel'].includes(key))
    || /"(?:sessionId|gpsSamples|_openid|openid|userId|userAnonymousKey)"\s*:/.test(JSON.stringify(etaModel))) throw new Error('Raw/private observation fields must never enter public app configuration');
  return {version: Math.max(Number(model.version), Number(current.version) + 1), updatedAt, etaModel};
}

function command(value, query = false) {
  const request = [{TableName: 'app_config', CommandType: query ? 'QUERY' : value.update === 'app_config' ? 'UPDATE' : 'COMMAND', Command: JSON.stringify(value)}];
  const stdout = execFileSync('npm', ['exec', '--yes', '--package=@cloudbase/cli@3.8.9', '--', 'tcb', '-e', ENV,
    'db', 'nosql', 'execute', '--command', JSON.stringify(request), '--json'],
  {cwd: '/private/tmp', encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
  const result = JSON.parse(stdout);
  if (!Array.isArray(result.data?.results?.[0])) throw new Error('Cloud returned no command result');
  return decodeExtendedJson(result.data.results[0]);
}

function main() {
  const [input, output, ...options] = process.argv.slice(2);
  if (!input || !output) throw new Error('Usage: node scripts/publish_term_model.mjs eta-model-patch.json new-private-output [--publish]');
  const directory = path.resolve(output);
  if (directory === ROOT || directory.startsWith(ROOT + path.sep)) throw new Error('Cloud backups must stay outside the public repository');
  fs.mkdirSync(directory, {mode: 0o700});
  const save = (name, value) => fs.writeFileSync(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', {mode: 0o600, flag: 'wx'});
  const etaModel = JSON.parse(fs.readFileSync(input, 'utf8'));
  const runtime = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'data/eta_prediction.js'), 'utf8'), runtime);
  if (!runtime.CUHK_ETA_PREDICTION.setModel(etaModel.predictionModel)) throw new Error('Prediction model failed the runtime validator');
  const records = command({find: 'app_config', filter: {kind: 'latest'}, limit: 2}, true);
  if (records.length !== 1) throw new Error('Expected exactly one latest configuration; no write performed');
  const before = records[0], patch = makeTermConfigUpdate(before, etaModel, new Date().toISOString());
  save('cloud-config-before.json', before);
  save('cloud-config-patch.json', patch);
  const confirm = confirmation => {
    save('publication-confirmation.json', confirmation);
    const releasePath = path.join(path.dirname(path.resolve(input)), 'release-report.json');
    if (fs.existsSync(releasePath)) {
      const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
      if (release.schema === 'cuhk_term_model_release_report_v1' && release.modelVersion === etaModel.predictionModel.version) {
        fs.writeFileSync(releasePath, JSON.stringify({...release, cloudPublished: true, cloudPublication: confirmation}, null, 2) + '\n', {mode: 0o600});
      }
    }
    console.log(JSON.stringify(confirmation, null, 2));
  };
  if (isDeepStrictEqual(before.etaModel, etaModel)) {
    confirm({published: true, verifiedByReadback: true, alreadyCurrent: true, nonEtaFieldsUnchanged: true,
      version: before.version, modelVersion: etaModel.predictionModel.version,
      trainingPeriod: etaModel.predictionModel.trainingPeriod, trainedThrough: etaModel.predictionModel.trainedThrough});
    return;
  }
  if (!options.includes('--publish')) {
    console.log(JSON.stringify({published: false, currentVersion: before.version, proposedVersion: patch.version, modelVersion: etaModel.predictionModel.version}));
    return;
  }
  const query = {_id: before._id, kind: 'latest', version: before.version};
  if (before.updatedAt !== undefined) query.updatedAt = before.updatedAt;
  let writeError = null;
  try {
    save('cloud-write-result.json', command({update: 'app_config', updates: [{q: query, u: {$set: patch}, multi: false, upsert: false}]}));
  } catch (error) { writeError = error; }
  // An upload timeout is not proof of failure: verify the resulting document.
  const after = command({find: 'app_config', filter: {_id: before._id}, limit: 1}, true)[0];
  if (!after) throw writeError || new Error('Configuration missing after write');
  save('cloud-config-after.json', after);
  assert.deepEqual(after.etaModel, patch.etaModel, 'Cloud ETA model was not updated; concurrent change or unsupported write');
  assert.equal(after.version, patch.version);
  const unaffected = record => Object.fromEntries(Object.entries(record).filter(([key]) => !['etaModel', 'version', 'updatedAt'].includes(key)));
  assert.deepEqual(unaffected(after), unaffected(before), 'Unexpected non-ETA configuration change');
  const confirmation = {published: true, verifiedByReadback: true, nonEtaFieldsUnchanged: true,
    previousVersion: before.version, version: after.version, modelVersion: after.etaModel.predictionModel.version,
    trainingPeriod: after.etaModel.predictionModel.trainingPeriod, trainedThrough: after.etaModel.predictionModel.trainedThrough,
    recoveryReadbackAfterWriteError: !!writeError};
  confirm(confirmation);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
