#!/usr/bin/env node
// Installs the platform packages in config/packages.json into an org, skipping any already at that
// version, in order. Run before a force-app deploy to a fresh scratch org (shared orgs are kept current
// by hand; see ADR 0001).
//   node scripts/install-packages.mjs --org <alias>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const i = process.argv.indexOf('--org');
const org = i >= 0 ? process.argv[i + 1] : undefined;
if (!org) throw new Error('--org is required');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { packages } = JSON.parse(readFileSync(join(root, 'config/packages.json'), 'utf8'));

const sf = (...a) => {
  const out = execFileSync('sf', [...a, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true' } });
  const start = out.search(/^\{\s*$/m);
  const j = JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{')));
  if (j.status !== 0) throw new Error(`sf ${a.slice(0, 2).join(' ')} failed: ${j.message}`);
  return j.result;
};

const installed = new Set(sf('data', 'query', '--use-tooling-api', '-o', org, '-q',
  'SELECT SubscriberPackageVersionId FROM InstalledSubscriberPackage').records.map((r) => r.SubscriberPackageVersionId.slice(0, 15)));
for (const p of packages) {
  if (installed.has(p.id.slice(0, 15))) { console.log(`[packages] ${p.name} ${p.version}: already installed`); continue; }
  const t = Date.now();
  sf('package', 'install', '--package', p.id, '--target-org', org, '--wait', '30', '--publish-wait', '10',
    '--security-type', 'AdminsOnly', '--no-prompt');
  console.log(`[packages] ${p.name} ${p.version}: installed in ${Math.round((Date.now() - t) / 1000)} s`);
}
