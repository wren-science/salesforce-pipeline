#!/usr/bin/env node
// Hands a leased pool sandbox from the trusted lease job to a job that runs PR code or an agent (ADR 0003).
// Only short-lived access tokens cross over (the admin's and each persona's), never a refresh token or the
// sandbox's JWT key: a pool sandbox outlives the run, so whatever leaks must expire on its own. The workflow
// encrypts the file with HANDOFF_KEY, as with the scratch org handover.
//   node scripts/sandbox-handover.mjs pack <file>     (lease job: after the admin login as `agent` and personas.mjs)
//   node scripts/sandbox-handover.mjs unpack <file>   (work job: logs in as `agent` and each persona, writes .auth)
//   node scripts/sandbox-handover.mjs revoke          (work job, at the end: revokes those sessions in the org)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [cmd, file] = process.argv.slice(2);
if (!['pack', 'unpack', 'revoke'].includes(cmd) || (cmd !== 'revoke' && !file)) {
  throw new Error('usage: sandbox-handover.mjs pack|unpack <file> | revoke');
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

const aliases = () => [{ alias: 'agent' }, ...(existsSync(authDir) ? readdirSync(authDir).filter((f) => f.endsWith('.alias'))
  .map((f) => ({ key: f.slice(0, -'.alias'.length), alias: readFileSync(join(authDir, f), 'utf8').trim() })) : [])];

if (cmd === 'revoke') {
  // Every session this runner's CLI holds (it only ever holds the handed-over ones).
  const list = sf(['org', 'list']);
  const all = [...(list.nonScratchOrgs ?? []), ...(list.other ?? []), ...(list.sandboxes ?? [])];
  const usernames = [...new Set(all.map((o) => o.username).filter(Boolean))];
  for (const u of usernames) {
    const l = { alias: u, key: u };
    try {
      const d = sf(['org', 'display', '--target-org', u]);
      const r = await fetch(`${d.instanceUrl}/services/oauth2/revoke`, { method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: d.accessToken }) });
      console.log(`[handover] ${l.key ?? 'admin'}: session ${r.ok ? 'revoked' : `not revoked (HTTP ${r.status})`}`);
    } catch (e) {
      console.log(`[handover] ${l.key ?? 'admin'}: nothing to revoke`);
    }
  }
} else if (cmd === 'pack') {
  const all = aliases();
  const personas = all.slice(1);
  const logins = all.map((l) => {
    const d = sf(['org', 'display', '--target-org', l.alias]);
    mask(d.accessToken);
    return { ...l, instanceUrl: d.instanceUrl, accessToken: d.accessToken };
  });
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
  }
  for (const line of personaEnv.split('\n').filter(Boolean)) mask(line.slice(line.indexOf('=') + 1));
  writeFileSync(join(authDir, 'persona.env'), personaEnv, { mode: 0o600 });
  console.log(`[handover] logged in to the sandbox as ${logins.map((l) => l.alias === 'agent' ? 'admin' : l.key).join(', ')}`);
}
