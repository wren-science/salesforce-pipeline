#!/usr/bin/env node
// Hands a leased pool sandbox from the trusted lease job to a job that runs PR code or an agent (ADR 0003).
// Only short-lived access tokens cross over (the admin's and each persona's), never a refresh token or the
// sandbox's JWT key: a pool sandbox outlives the run, so whatever leaks must expire on its own. The workflow
// encrypts the file with HANDOFF_KEY, as with the scratch org handover.
//   node scripts/sandbox-handover.mjs pack <file>     (lease job: after the admin login as `agent` and personas.mjs)
//   node scripts/sandbox-handover.mjs unpack <file>   (work job: logs in as `agent` and each persona, writes .auth)
//   node scripts/sandbox-handover.mjs forget          (work job, at the end: drops the logins from this runner only)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const [cmd, file] = process.argv.slice(2);
if (!['pack', 'unpack', 'forget'].includes(cmd) || (cmd !== 'forget' && !file)) {
  throw new Error('usage: sandbox-handover.mjs pack|unpack <file> | forget');
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const authDir = join(root, 'tests/e2e/.auth');
const mask = (s) => { if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${s}`); };
const sf = (args, env = {}) => {
  const out = execFileSync('sf', [...args, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true' } });
  const start = out.search(/^\{\s*$/m);
  const j = JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{')));
  if (j.status !== 0) throw new Error(`sf ${args.slice(0, 2).join(' ')} failed: ${j.message}`);
  return j.result;
};

// The CLI redacts tokens in `org display` (even --verbose), so read them through the CLI's own @salesforce/core.
async function accessToken(username) {
  const cliRoot = dirname(dirname(realpathSync(execFileSync('which', ['sf'], { encoding: 'utf8' }).trim())));
  const core = await import(pathToFileURL(join(cliRoot, 'node_modules/@salesforce/core/lib/index.js')).href);
  const conn = await core.Connection.create({ authInfo: await core.AuthInfo.create({ username }) });
  await conn.refreshAuth(); // a fresh session, so the receiver gets the full lifetime
  return { instanceUrl: conn.instanceUrl, accessToken: conn.accessToken };
}

const aliases = () => [{ alias: 'agent' }, ...(existsSync(authDir) ? readdirSync(authDir).filter((f) => f.endsWith('.alias'))
  .map((f) => ({ key: f.slice(0, -'.alias'.length), alias: readFileSync(join(authDir, f), 'utf8').trim() })) : [])];

if (cmd === 'forget') {
  // Local only. Never revoke server-side: Salesforce hands the same session to every JWT login for the same
  // user and app while it is live, so revoking "our" token also ended a later job's session (#36's repair,
  // 22 Oct). The tokens expire with the sandbox's session timeout.
  try { execFileSync('sf', ['org', 'logout', '--all', '--no-prompt'], { stdio: 'ignore' }); } catch { /* nothing logged in */ }
  rmSync(authDir, { recursive: true, force: true });
  console.log('[handover] forgot the handed-over logins on this runner');
} else if (cmd === 'pack') {
  const all = aliases();
  const personas = all.slice(1);
  const logins = [];
  for (const l of all) {
    const t = await accessToken(sf(['org', 'display', '--target-org', l.alias]).username);
    mask(t.accessToken);
    logins.push({ ...l, ...t });
  }
  const personaEnv = existsSync(join(authDir, 'persona.env')) ? readFileSync(join(authDir, 'persona.env'), 'utf8') : '';
  writeFileSync(file, JSON.stringify({ logins, personaEnv }), { mode: 0o600 });
  console.log(`[handover] packed ${logins.length} logins (admin + ${personas.length} personas)`);
} else {
  const { logins, personaEnv } = JSON.parse(readFileSync(file, 'utf8'));
  mkdirSync(authDir, { recursive: true, mode: 0o700 });
  for (const l of logins) {
    mask(l.accessToken);
    sf(['org', 'login', 'access-token', '--instance-url', l.instanceUrl, '--alias', l.alias, '--no-prompt',
      ...(l.alias === 'agent' ? ['--set-default'] : [])], { SF_ACCESS_TOKEN: l.accessToken });
    if (l.key) writeFileSync(join(authDir, `${l.key}.alias`), l.alias, { mode: 0o600 });
    // Every deploy is explicit (force-app), so CLI source tracking would only raise conflicts with the lease's
    // own deploy (ADR 0003). Retrieve by metadata name instead.
    sf(['org', 'disable', 'tracking', '--target-org', l.alias]);
  }
  for (const line of personaEnv.split('\n').filter(Boolean)) mask(line.slice(line.indexOf('=') + 1));
  writeFileSync(join(authDir, 'persona.env'), personaEnv, { mode: 0o600 });
  console.log(`[handover] logged in to the sandbox as ${logins.map((l) => l.alias === 'agent' ? 'admin' : l.key).join(', ')}`);
}
