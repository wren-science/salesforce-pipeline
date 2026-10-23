import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Test data setup and metadata checks through the Salesforce CLI, as the org's CLI (admin) user. This is
// setup only (TST-16 allows setup outside the persona); the behaviour under test always runs in the
// browser as the persona. Data is synthetic and removed afterwards (PIPE-14, PIPE-15).
//
// The org is SF_DATA_ORG (alias or username) if set, otherwise the CLI's default target org.
// Output is never logged: errors carry the CLI message only, with any URL removed (QG-08, PIPE-14).
const root = join(__dirname, '..', '..', '..');
const scrub = (s: string) => s.replace(/https?:\/\/\S+/g, '<url removed>');

function sf<T = any>(...args: string[]): T {
  const org = process.env.SF_DATA_ORG ? ['--target-org', process.env.SF_DATA_ORG] : [];
  return sfAs<T>(org, ...args);
}

function sfAs<T = any>(org: string[], ...args: string[]): T {
  let out: string;
  try {
    out = execFileSync('sf', [...args, ...org, '--json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', SF_DISABLE_COLORS: 'true' },
    });
  } catch (e) {
    out = String((e as { stdout?: string }).stdout ?? '');
    if (!out.includes('{')) throw new Error(`sf ${args[0]} ${args[1]} failed`);
  }
  const j = JSON.parse(out.slice(out.indexOf('{')));
  if (j.status !== 0) throw new Error(`sf ${args[0]} ${args[1]} failed: ${scrub(String(j.message))}`);
  return j.result as T;
}

export function query<T = Record<string, any>>(soql: string): T[] {
  return sf<{ records: T[] }>('data', 'query', '--query', soql).records;
}

/** Runs anonymous Apex (system mode, setup only). Throws on compile or runtime failure. */
export function runApex(code: string) {
  const dir = mkdtempSync(join(tmpdir(), 'pw-apex-'));
  const file = join(dir, 'seed.apex');
  try {
    writeFileSync(file, code, { mode: 0o600 });
    const r = sf<{ compiled: boolean; success: boolean; compileProblem?: string; exceptionMessage?: string }>('apex', 'run', '--file', file);
    if (!r.compiled || !r.success) throw new Error(`Anonymous Apex failed: ${scrub(String(r.compileProblem || r.exceptionMessage))}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Creates one record through the REST API as the persona itself, with the persona's CRUD and FLS (TST-16).
 * Uses the CLI login that scripts/personas.mjs and sandbox-handover.mjs keep in .auth/<key>.alias. Use it when
 * the record holds fields only the persona permission set grants: the CLI admin has no FLS on them, and anonymous
 * Apex runs with the admin's FLS (and refuses SYSTEM_MODE). Values must not contain single quotes.
 */
export function createRecordAs(personaKey: string, sobject: string, values: Record<string, string | number | boolean>): string {
  const pairs = Object.entries(values).map(([k, v]) => {
    if (String(v).includes("'")) throw new Error(`Value for ${k} contains a single quote`);
    return `${k}='${v}'`;
  });
  return sfAs<{ id: string }>(personaOrg(personaKey), 'data', 'create', 'record', '--sobject', sobject, '--values', pairs.join(' ')).id;
}

/**
 * Runs a SOSL search as the persona, with the persona's sharing and FLS, and returns the Ids it found. Use it to
 * prove a record has reached the search index before asserting that a UI search leaves it out.
 */
export function searchIdsAs(personaKey: string, sosl: string): string[] {
  const r = sfAs<{ searchRecords?: { Id: string }[] }>(personaOrg(personaKey), 'data', 'search', '--query', sosl);
  return (r.searchRecords ?? []).map((rec) => rec.Id);
}

/**
 * Makes one REST API call as the persona and returns the HTTP status and parsed body, including error responses,
 * so a test can assert on a refusal (for example DUPLICATES_DETECTED) and send request headers such as
 * Sforce-Duplicate-Rule-Header. Uses Node fetch, outside the browser, so the session token is held in memory
 * only: never logged, never put in an error and never in a Playwright trace (QG-08, PIPE-14). `path` is relative
 * to /services/data/vNN.0/, for example 'sobjects/Lead'.
 */
export async function restAs(
  personaKey: string,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const org = sfAs<{ accessToken: string; instanceUrl: string; apiVersion: string }>(personaOrg(personaKey), 'org', 'display');
  const res = await fetch(`${org.instanceUrl}/services/data/v${org.apiVersion}/${path}`, {
    method,
    headers: { Authorization: `Bearer ${org.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

function personaOrg(personaKey: string): string[] {
  const aliasFile = join(__dirname, '..', '.auth', `${personaKey}.alias`);
  if (!existsSync(aliasFile)) throw new Error(`No CLI login for persona ${personaKey}: expected .auth/${personaKey}.alias`);
  return ['--target-org', readFileSync(aliasFile, 'utf8').trim()];
}

/** The persona's test user, created by scripts/personas.mjs as `<key>.<orgId>@pipeline...`. */
export function personaUserId(personaKey: string): string {
  const rows = query<{ Id: string }>(`SELECT Id FROM User WHERE Username LIKE '${personaKey}.%@pipeline.%' AND IsActive = true LIMIT 1`);
  if (!rows.length) throw new Error(`No active test user for persona ${personaKey}`);
  return rows[0].Id;
}

/** Retrieves one metadata component from the org and returns the text of the retrieved file(s). */
export function retrieveMetadata(member: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'pw-retrieve-'));
  try {
    sf('project', 'retrieve', 'start', '--metadata', member, '--target-metadata-dir', dir, '--unzip');
    const texts: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (!f.endsWith('package.xml') && !f.endsWith('.zip')) texts.push(readFileSync(p, 'utf8'));
      }
    };
    walk(dir);
    return texts.join('\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
