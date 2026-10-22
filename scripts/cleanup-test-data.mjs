#!/usr/bin/env node
// Removes the records acceptance tests created (config/test-data.json), as the org's admin login, so shared
// and pool orgs don't fill up with test data (PIPE-15). Personas often can't delete what they create (by
// design), so this runs with the pipeline's own identity after every test run.
//   node scripts/cleanup-test-data.mjs --org <alias>
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const i = process.argv.indexOf('--org');
const org = i >= 0 ? process.argv[i + 1] : undefined;
if (!org) throw new Error('--org is required');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { records } = JSON.parse(readFileSync(join(root, 'config/test-data.json'), 'utf8'));
const sf = (...a) => {
  const out = execFileSync('sf', [...a, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true' } });
  const j = JSON.parse(out.slice(Math.max(0, out.search(/^\{\s*$/m))));
  if (j.status !== 0) throw new Error(`sf ${a[0]} ${a[1]} failed: ${j.message}`);
  return j.result;
};

let failed = 0;
for (const r of records) {
  // Safety: every filter must be a prefix match on a test marker (E2E-…, PW20-…), never a broad delete.
  if (!/^[A-Za-z0-9_]+$/.test(r.sobject) || !/LIKE '[A-Za-z0-9]{3,}-%'/.test(r.where)) { console.log(`[cleanup] skipped ${r.sobject}: the filter must be LIKE '<marker>-%'`); continue; }
  try {
    const ids = sf('data', 'query', '-o', org, '-q', `SELECT Id FROM ${r.sobject} WHERE ${r.where} LIMIT 2000`).records.map((x) => x.Id);
    if (!ids.length) { console.log(`[cleanup] ${r.sobject}: nothing to remove`); continue; }
    const f = join(tmpdir(), `cleanup-${r.sobject}.apex`);
    writeFileSync(f, `Database.delete(new List<Id>{'${ids.join("','")}'}, false);`);
    sf('apex', 'run', '-o', org, '-f', f);
    rmSync(f);
    console.log(`[cleanup] ${r.sobject}: removed ${ids.length} test records`);
  } catch (e) {
    failed++; console.log(`[cleanup] ${r.sobject}: ${String(e.message).split('\n')[0]}`);
  }
}
process.exitCode = 0; // clean-up never fails the run; failures are reported above
if (failed) console.log(`::warning::Test data clean-up failed for ${failed} object(s)`);
