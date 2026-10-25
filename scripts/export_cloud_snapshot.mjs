import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export function decodeExtendedJson(value) {
  if (Array.isArray(value)) return value.map(decodeExtendedJson);
  if (!value || typeof value !== 'object') return value;
  const keys = Object.keys(value);
  if (keys.length === 1 && ['$numberInt', '$numberLong', '$numberDouble', '$numberDecimal'].includes(keys[0])) {
    const number = Number(value[keys[0]]);
    if (keys[0] === '$numberLong' && !Number.isSafeInteger(number)) return value[keys[0]];
    return Number.isFinite(number) ? number : null;
  }
  if (keys.length === 1 && keys[0] === '$date') {
    const date = new Date(decodeExtendedJson(value.$date));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decodeExtendedJson(item)]));
}

const collections = ['ride_gps_sessions', 'ride_gps_sample_chunks', 'board_broadcasts'];
const privateFields = ['_openid', 'openid', 'openId', 'userId', 'userAnonymousKey', 'appId'];

export function readCommand(table, command) {
  if (!collections.includes(table)) throw new Error('Collection is not in the read-only export allowlist');
  if (command.find !== table && command.count !== table) throw new Error('Only find and count commands are allowed');
  if (Object.keys(command).some(key => ['insert', 'update', 'delete', 'drop', 'findAndModify', 'aggregate'].includes(key))) throw new Error('Write commands are prohibited');
  return {TableName: table, CommandType: command.find ? 'QUERY' : 'COMMAND', Command: JSON.stringify(command)};
}

function runCommand(env, table, command) {
  const output = execFileSync('npm', ['exec', '--yes', '--package=@cloudbase/cli@3.8.9', '--', 'tcb', '-e', env,
    'db', 'nosql', 'execute', '--command', JSON.stringify([readCommand(table, command)]), '--json'],
  {encoding: 'utf8', cwd: '/private/tmp', maxBuffer: 32 * 1024 * 1024, timeout: 90000, stdio: ['ignore', 'pipe', 'pipe']});
  const parsed = JSON.parse(output);
  const rows = parsed.data?.results?.[0];
  if (!Array.isArray(rows)) throw new Error(`Cloud query failed for ${table}: ${parsed.message || parsed.error?.message || 'missing results'}`);
  return decodeExtendedJson(rows);
}

function main() {
  const args = process.argv.slice(2);
  const option = flag => args[args.indexOf(flag) + 1];
  const out = args.includes('--out-dir') ? path.resolve(option('--out-dir')) : '';
  const env = args.includes('--env') ? option('--env') : 'cloudbase-d1g7dd3ly9e8c04d3';
  if (!out) throw new Error('Usage: node scripts/export_cloud_snapshot.mjs --out-dir <new private folder> [--env envId]');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  if (out === repo || out.startsWith(repo + path.sep)) throw new Error('Store GPS exports outside the public Git repository');
  fs.mkdirSync(out, {mode: 0o700});
  const manifest = {schema: 'cuhk_private_cloud_snapshot_v1', env, startedAt: new Date().toISOString(),
    consistency: 'Paginated read, not a transactional snapshot. Counts are rechecked after each collection.',
    privacy: 'Private cloud identity fields omitted. Precise GPS remains local; do not publish this directory.', collections: {}};
  for (const table of collections) {
    const countBefore = Number(runCommand(env, table, {count: table, query: {}})[0]?.n);
    if (!Number.isInteger(countBefore)) throw new Error(`Missing count for ${table}`);
    const rows = [], seen = new Set();
    let cursor = '', pages = 0;
    while (true) {
      const batch = runCommand(env, table, {find: table, filter: cursor ? {_id: {$gt: cursor}} : {}, sort: {_id: 1}, limit: 40,
        projection: Object.fromEntries(privateFields.map(key => [key, 0]))});
      if (!batch.length) break;
      for (const row of batch) {
        if (typeof row._id !== 'string' || !row._id || seen.has(row._id)) throw new Error(`Missing/duplicate document ID in ${table}`);
        seen.add(row._id);
        rows.push(row);
      }
      const next = batch.at(-1)._id;
      if (next <= cursor) throw new Error(`Pagination did not advance for ${table}`);
      cursor = next;
      pages++;
      if (pages % 10 === 0) console.log(`${table}: ${rows.length}/${countBefore} records`);
    }
    const countAfter = Number(runCommand(env, table, {count: table, query: {}})[0]?.n);
    const file = path.join(out, `${table}.json`);
    fs.writeFileSync(file, JSON.stringify(rows) + '\n', {mode: 0o600});
    manifest.collections[table] = {file: path.basename(file), records: rows.length, countBefore, countAfter,
      countMatched: rows.length === countBefore && rows.length === countAfter, pages, bytes: fs.statSync(file).size};
    fs.writeFileSync(path.join(out, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
    console.log(`${table}: exported ${rows.length}, count check ${manifest.collections[table].countMatched ? 'PASS' : 'CHANGED DURING READ'}`);
  }
  manifest.completedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2) + '\n', {mode: 0o600});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
