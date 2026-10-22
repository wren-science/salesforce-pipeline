#!/usr/bin/env node
// Leases agent pool sandboxes (config/sandbox-pool.json, ADR 0003). A lease is a `sandbox:<name>` label on its
// holder: the story's issue (feature/<issue>-… branches) or, for other PRs, the PR itself. One story keeps its
// sandbox from build to merge, so the agents, the PR tests and the repair agent all work in the same org.
//   node scripts/sandbox-lease.mjs acquire --holder <n>   -> prints the sandbox name, or nothing if the pool is full
//   node scripts/sandbox-lease.mjs release --holder <n>
// Needs GH_TOKEN and GITHUB_REPOSITORY. Run acquire under one global concurrency group, so two jobs never
// take the same sandbox.
import { execFileSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [cmd, , holder] = process.argv.slice(2);
if (!['acquire', 'release'].includes(cmd) || !/^\d+$/.test(holder ?? '')) {
  throw new Error('usage: sandbox-lease.mjs acquire|release --holder <issue or PR number>');
}
const repo = process.env.GITHUB_REPOSITORY;
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pool = JSON.parse(readFileSync(join(root, 'config/sandbox-pool.json'), 'utf8')).sandboxes.map((s) => s.name);
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
const labelsOf = (n) => JSON.parse(gh('api', `repos/${repo}/issues/${n}/labels`, '--jq', '[.[].name]'));
const PREFIX = 'sandbox:';
const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

if (cmd === 'release') {
  for (const l of labelsOf(holder).filter((l) => l.startsWith(PREFIX))) {
    gh('api', '-X', 'DELETE', `repos/${repo}/issues/${holder}/labels/${encodeURIComponent(l)}`);
    console.log(`[lease] released ${l.slice(PREFIX.length)} from #${holder}`);
  }
  process.exit(0);
}

const held = labelsOf(holder).find((l) => l.startsWith(PREFIX))?.slice(PREFIX.length);
let name = held && pool.includes(held) ? held : undefined;
if (!name) {
  for (const s of pool) {
    const holders = JSON.parse(gh('api', `repos/${repo}/issues?state=open&labels=${encodeURIComponent(PREFIX + s)}&per_page=5`, '--jq', '[.[].number]'));
    if (!holders.length) { name = s; break; }
  }
  if (name) {
    gh('api', `repos/${repo}/issues/${holder}/labels`, '-f', `labels[]=${PREFIX}${name}`);
    console.log(`[lease] #${holder} now holds ${name}`);
  }
} else {
  console.log(`[lease] #${holder} already holds ${name}`);
}
if (!name) console.log('[lease] every sandbox in the pool is leased');
out('name', name ?? '');
out('upper', (name ?? '').toUpperCase());
out('new', name && name !== held ? 'true' : 'false');
