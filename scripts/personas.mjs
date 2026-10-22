#!/usr/bin/env node
// Makes an org persona-ready for testing: for every persona in config/personas.json it ensures an active
// user on the "Persona Base" profile with the persona's permission set groups (and nothing else), signs
// the CLI in as that user, sets a fresh random password, and writes a one-time frontdoor URL for
// Playwright (tests/e2e/.auth/<key>.url). See docs/standards/personas.md.
//
//   node scripts/personas.mjs --org <alias> --mode scratch
//   node scripts/personas.mjs --org <alias> --mode jwt     (shared orgs; needs SFDX_CLIENT_ID, JWT_KEY_FILE, INSTANCE_URL)
//
// Secrets never reach stdout: passwords are masked in GitHub Actions and exported through $GITHUB_ENV
// (locally: tests/e2e/.auth/persona.env). Frontdoor URLs only ever go to the git-ignored .auth folder.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const org = args.org, mode = args.mode ?? 'scratch';
if (!org) throw new Error('--org is required');
const authDir = join(root, 'tests/e2e/.auth');
mkdirSync(authDir, { recursive: true, mode: 0o700 });

const sf = (...a) => {
  const out = execFileSync('sf', [...a, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true' } });
  const start = out.search(/^\{\s*$/m);
  const j = JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{')));
  if (j.status !== 0) throw new Error(`sf ${a[0]} ${a[1]} failed: ${j.message}`);
  return j.result;
};
const sfTry = (...a) => { try { return sf(...a); } catch (e) { return { error: String(e.message) }; } };
const query = (o, q) => sf('data', 'query', '-o', o, '-q', q).records;
const log = (m) => console.log(`[personas] ${m}`);
const mask = (s) => { if (process.env.GITHUB_ACTIONS) console.log(`::add-mask::${s}`); };

const catalogue = JSON.parse(readFileSync(join(root, 'config/personas.json'), 'utf8')).personas;
const orgId = sf('org', 'display', '-o', org).id.slice(0, 15).toLowerCase();
const baseProfile = query(org, "SELECT Id FROM Profile WHERE Name = 'Persona Base'")[0];
if (!baseProfile) throw new Error('Profile "Persona Base" is missing: deploy force-app first');

for (const p of catalogue) {
  const username = `${p.key}.${orgId}@pipeline.wildliferesearchandeducation.com`;
  const alias = `persona-${p.key}-${orgId}`;
  let user = query(org, `SELECT Id, IsActive FROM User WHERE Username = '${username}'`)[0];

  if (!user && mode === 'scratch') {
    const def = join(tmpdir(), `persona-${p.key}.json`);
    writeFileSync(def, JSON.stringify({ username, email: `${p.user.emailLocalPart}@wildliferesearchandeducation.com`, profileName: 'Persona Base', firstName: p.user.firstName, lastName: p.user.lastName, alias: p.user.alias }));
    sf('org', 'create', 'user', '-o', org, '--set-alias', alias, '--definition-file', def);
    rmSync(def);
    user = query(org, `SELECT Id, IsActive FROM User WHERE Username = '${username}'`)[0];
    log(`${p.key}: created ${username}`);
  } else if (!user) {
    sf('data', 'create', 'record', '-o', org, '-s', 'User', '-v',
      `Username='${username}' Email='${p.user.emailLocalPart}@wildliferesearchandeducation.com' FirstName='${p.user.firstName}' LastName='${p.user.lastName}' Alias='${p.user.alias}' ProfileId='${baseProfile.Id}' EmailEncodingKey='UTF-8' LanguageLocaleKey='en_US' LocaleSidKey='en_AU' TimeZoneSidKey='Australia/Brisbane'`);
    user = query(org, `SELECT Id, IsActive FROM User WHERE Username = '${username}'`)[0];
    log(`${p.key}: created ${username}`);
  } else if (!user.IsActive) {
    sf('data', 'update', 'record', '-o', org, '-s', 'User', '-i', user.Id, '-v', 'IsActive=true');
  }
  if (mode === 'scratch' && sfTry('org', 'display', '-o', alias).error) {
    throw new Error(`${username} exists in ${org} but the CLI has no login for it; use a fresh scratch org`);
  }

  // Access: exactly the persona's groups (plus the CI pre-authorisation set in shared orgs, which grants no data access).
  for (const g of p.permissionSetGroups) {
    let group;
    for (let i = 0; i < 30; i++) {
      group = query(org, `SELECT Id, Status FROM PermissionSetGroup WHERE DeveloperName = '${g}'`)[0];
      if (group?.Status === 'Updated') break;
      await new Promise((r) => setTimeout(r, 5000));
    }
    if (group?.Status !== 'Updated') throw new Error(`Permission set group ${g} is not ready in ${org}`);
    if (!query(org, `SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${user.Id}' AND PermissionSetGroupId = '${group.Id}'`).length) {
      sf('data', 'create', 'record', '-o', org, '-s', 'PermissionSetAssignment', '-v', `AssigneeId=${user.Id} PermissionSetGroupId=${group.Id}`);
      log(`${p.key}: assigned ${g}`);
    }
  }
  if (p.publicGroup) {
    const grp = query(org, `SELECT Id FROM Group WHERE DeveloperName = '${p.publicGroup}' AND Type = 'Regular'`)[0];
    if (!grp) throw new Error(`Persona public group ${p.publicGroup} is missing in ${org}`);
    if (!query(org, `SELECT Id FROM GroupMember WHERE GroupId = '${grp.Id}' AND UserOrGroupId = '${user.Id}'`).length) {
      sf('data', 'create', 'record', '-o', org, '-s', 'GroupMember', '-v', `GroupId=${grp.Id} UserOrGroupId=${user.Id}`);
      log(`${p.key}: added to group ${p.publicGroup}`);
    }
  }

  // A fresh password each run lets Playwright complete Salesforce's first-login form if it appears.
  const password = 'Pw1!' + randomBytes(18).toString('base64url');
  mask(password);
  const apex = join(tmpdir(), `setpw-${p.key}.apex`);
  writeFileSync(apex, `System.setPassword('${user.Id}', '${password}');`, { mode: 0o600 });
  sf('apex', 'run', '-o', org, '-f', apex);
  rmSync(apex);
  const envLine = `PERSONA_PASSWORD_${p.key.toUpperCase().replace(/-/g, '_')}=${password}\n`;
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, envLine);
  appendFileSync(join(authDir, 'persona.env'), envLine, { mode: 0o600 });

  // JWT login comes after the password change: setting a password ends the user's existing sessions.
  if (mode === 'jwt') {
    const pre = query(org, "SELECT Id FROM PermissionSet WHERE Name = 'Salesforce_Pipeline_CI'")[0];
    if (pre && !query(org, `SELECT Id FROM PermissionSetAssignment WHERE AssigneeId = '${user.Id}' AND PermissionSetId = '${pre.Id}'`).length) {
      sf('data', 'create', 'record', '-o', org, '-s', 'PermissionSetAssignment', '-v', `AssigneeId=${user.Id} PermissionSetId=${pre.Id}`);
    }
    sf('org', 'login', 'jwt', '--username', username, '--client-id', process.env.SFDX_CLIENT_ID, '--jwt-key-file', process.env.JWT_KEY_FILE,
      '--instance-url', process.env.INSTANCE_URL, '--alias', alias);
  }

  writeFileSync(join(authDir, `${p.key}.url`), sf('org', 'open', '-o', alias, '--url-only').url, { mode: 0o600 });
  log(`${p.key}: ready (${p.permissionSetGroups.join(', ')})`);
}
