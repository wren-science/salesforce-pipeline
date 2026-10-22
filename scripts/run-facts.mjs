#!/usr/bin/env node
// Run facts: what an agent actually did, extracted mechanically from its execution log by trusted code (no
// tokens spent, nothing to misremember), plus the agent's own short self-assessment (run-report.json). Both
// have fixed shapes (docs/pipeline/agent-records.md) and feed the pipeline-health check.
//
//   node scripts/run-facts.mjs extract <role> <execution_file> [--self run-report.json] --out <facts.json>
//   node scripts/run-facts.mjs publish --issue <n> --run-url <url> <facts.json>...   (one comment per story)
//
// Raw execution logs are never published (they can hold tool output); only these facts are.
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const scrub = (s) => String(s ?? '')
  .replace(/force:\/\/\S+/g, '<auth-url>').replace(/sk-ant-[A-Za-z0-9_-]+/g, '<token>').replace(/Pw1![A-Za-z0-9_-]+/g, '<password>')
  .replace(/00D[A-Za-z0-9]{12,15}![A-Za-z0-9._]+/g, '<session>').replace(/sid=[^&\s"]+/g, 'sid=<session>')
  .replace(/https?:\/\/\S+/g, '<url>').replace(/\s+/g, ' ').trim();

// --- classification -----------------------------------------------------------------------------------
const kindOf = (name, cmd = '') => {
  if (['Read', 'Grep', 'Glob'].includes(name)) return 'read';
  if (['Edit', 'Write', 'MultiEdit'].includes(name)) return 'edit';
  if (name !== 'Bash') return 'other';
  if (/\bsf project deploy\b/.test(cmd)) return 'deploy';
  if (/\bsf apex run test\b/.test(cmd)) return 'apex-test';
  if (/playwright test/.test(cmd)) return 'playwright';
  if (/^\s*(cat|head|tail|grep|find|ls|wc|jq)\b/.test(cmd)) return 'read';
  if (/^\s*git\b/.test(cmd)) return 'git';
  if (/^\s*gh\b/.test(cmd)) return 'github';
  if (/agent-records\.mjs/.test(cmd)) return 'records';
  if (/^\s*sf\b/.test(cmd)) return 'sf-other';
  return 'shell';
};
// Deploy problems, by the kind of mistake they point to.
const DEPLOY_ERRORS = [
  ['malformed-xml', /(XML|xml).*(parse|malformed|not well-formed|unexpected element|Element \{)|cvc-|Error parsing file/],
  ['unknown-field-or-object', /(No such column|Invalid field|does not exist|Field .* not found|INVALID_FIELD|Entity type .* not found|is not a valid)/],
  ['apex-compile', /(Unexpected token|Variable does not exist|Method does not exist|Invalid type|expecting|Illegal assignment|Compilation)/],
  ['missing-dependency', /(depends on|Dependent class is invalid|referenced .* not found|Cannot find|is required|MISSING)/],
  ['duplicate', /(duplicate|already exists|DUPLICATE)/i],
  ['permission-or-access', /(insufficient access|INSUFFICIENT_ACCESS|not permitted|No permission)/i],
  ['tracking-conflict', /(conflict with the local changes|source tracking)/i],
];
const COMPONENT = /\b(ApexClass|ApexTrigger|CustomObject|CustomField|PermissionSet|PermissionSetGroup|Profile|Layout|ListView|FlexiPage|Flow|CustomTab|CustomApplication|ValidationRule|LightningComponentBundle|Group|CompactLayout|RecordType|CustomMetadata)\b/g;
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((x) => x?.text ?? '').join('\n') : JSON.stringify(c ?? ''));

function extract(role, file) {
  const msgs = JSON.parse(readFileSync(file, 'utf8'));
  const seen = {}; const calls = new Map(); const order = [];
  for (const m of msgs) {
    seen[m.type] = (seen[m.type] ?? 0) + 1;
    for (const b of m.message?.content ?? []) {
      if (b?.type === 'tool_use') { calls.set(b.id, { name: b.name, input: b.input ?? {} }); order.push(b.id); }
      if (b?.type === 'tool_result' && calls.has(b.tool_use_id)) Object.assign(calls.get(b.tool_use_id), { error: !!b.is_error, out: textOf(b.content) });
    }
  }
  console.log(`[run-facts] ${role}: messages ${JSON.stringify(seen)}, tool calls ${order.length}`);
  const result = [...msgs].reverse().find((m) => m.type === 'result') ?? {};
  const f = { role, outcome: result.subtype ?? 'unknown', turns: result.num_turns ?? 0, durationMs: result.duration_ms ?? null,
    toolCalls: order.length, byKind: {}, failedByKind: {},
    deploys: { attempts: 0, failed: 0, firstAttemptFailed: null, errors: {}, components: {} },
    tests: { apexRuns: 0, apexRunsFailed: 0, playwrightRuns: 0, playwrightRunsFailed: 0, failingTests: {} },
    denials: { total: (result.permission_denials ?? []).length, byPattern: {} }, repeats: [] };
  const cmdCount = {};
  for (const id of order) {
    const c = calls.get(id); const cmd = c.input.command ?? ''; const k = kindOf(c.name, cmd);
    f.byKind[k] = (f.byKind[k] ?? 0) + 1;
    const failed = c.error || /\b(Status: Failed|Error \(\d+\)|exit code [1-9]|\d+ failed\b)/i.test(c.out ?? '');
    if (failed) f.failedByKind[k] = (f.failedByKind[k] ?? 0) + 1;
    if (c.name === 'Bash') { const key = scrub(cmd).slice(0, 160); cmdCount[key] = (cmdCount[key] ?? 0) + 1; }
    if (k === 'deploy') {
      f.deploys.attempts++;
      if (f.deploys.firstAttemptFailed === null) f.deploys.firstAttemptFailed = failed;
      if (failed) {
        f.deploys.failed++;
        const out = c.out ?? ''; let matched = false;
        for (const [cat, re] of DEPLOY_ERRORS) if (re.test(out)) { f.deploys.errors[cat] = (f.deploys.errors[cat] ?? 0) + 1; matched = true; }
        if (!matched) f.deploys.errors.other = (f.deploys.errors.other ?? 0) + 1;
        for (const t of new Set(out.match(COMPONENT) ?? [])) f.deploys.components[t] = (f.deploys.components[t] ?? 0) + 1;
      }
    }
    if (k === 'apex-test') {
      f.tests.apexRuns++; if (failed) f.tests.apexRunsFailed++;
      for (const m of (c.out ?? '').matchAll(/([A-Za-z0-9_]+Test[A-Za-z0-9_]*\.[A-Za-z0-9_]+)\s+(?:│\s*)?(?:Fail|FAIL)/g)) f.tests.failingTests[m[1]] = (f.tests.failingTests[m[1]] ?? 0) + 1;
    }
    if (k === 'playwright') {
      f.tests.playwrightRuns++; if (failed) f.tests.playwrightRunsFailed++;
      for (const m of (c.out ?? '').matchAll(/✘\s+\d+\s+\[[^\]]+\]\s+›\s+[^›]+›[^›]*›\s+(#\d+ AC\d+[^\n(]*)/g)) {
        const t = m[1].trim().slice(0, 100); f.tests.failingTests[t] = (f.tests.failingTests[t] ?? 0) + 1;
      }
    }
  }
  for (const d of result.permission_denials ?? []) {
    const cmd = d.tool_input?.command ?? d.tool_input?.file_path ?? '';
    const pattern = /[;&|]/.test(cmd) ? 'compound command' : `${d.tool_name} ${scrub(cmd).split(' ').slice(0, 2).join(' ')}`;
    f.denials.byPattern[pattern] = (f.denials.byPattern[pattern] ?? 0) + 1;
  }
  f.repeats = Object.entries(cmdCount).filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([command, count]) => ({ command, count }));
  return f;
}

// --- self-assessment (run-report.json, written by the agent) ---------------------------------------------
const LIST_FIELDS = ['unclearInstructions', 'ambiguousStandards', 'orgSurprises', 'wouldDoDifferently'];
function readSelf(file, role) {
  if (!file || !existsSync(file)) return { missing: true };
  try {
    const r = JSON.parse(readFileSync(file, 'utf8'));
    const out = { confidence: ['high', 'medium', 'low'].includes(r.confidence) ? r.confidence : 'unstated' };
    for (const k of LIST_FIELDS) out[k] = (Array.isArray(r[k]) ? r[k] : []).slice(0, 3).map((x) => scrub(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300));
    if (r.role && r.role !== role) out.note = `report claimed role ${scrub(r.role)}`;
    return out;
  } catch (e) { return { invalid: scrub(e.message).slice(0, 120) }; }
}

// --- publish: one comment per story -------------------------------------------------------------------
const MARK = '<!-- agent:run-facts -->';
function render(rows) {
  const n = (x) => (x == null ? '—' : x);
  const lines = [MARK, `## Run facts for this story (${rows.length} agent runs)`, '',
    'Extracted from each agent\'s execution log by the pipeline; the self-assessment is the agent\'s own. Updated by the pipeline; do not edit.', '',
    '| When (UTC) | Agent | Turns | Deploys failed / tried | Deploy errors | Test runs failed | Denials | Repeats |',
    '|---|---|--:|--:|---|--:|--:|--:|'];
  for (const r of rows) {
    const errs = Object.entries(r.deploys.errors).map(([k, v]) => `${k} ×${v}`).join(', ') || '—';
    const tests = r.tests.apexRunsFailed + r.tests.playwrightRunsFailed;
    lines.push(`| ${r.run ? `[${r.at}](${r.run})` : r.at} | ${r.role} | ${n(r.turns)} | ${r.deploys.failed} / ${r.deploys.attempts} | ${errs} | ${tests} | ${r.denials.total} | ${r.repeats.length} |`);
  }
  const notes = rows.filter((r) => r.self && !r.self.missing && !r.self.invalid && LIST_FIELDS.some((k) => r.self[k]?.length));
  if (notes.length) {
    lines.push('', '### What the agents said about their runs', '');
    for (const r of notes) {
      lines.push(`**${r.role}** (${r.at}, confidence ${r.self.confidence})`);
      for (const k of LIST_FIELDS) for (const x of r.self[k]) lines.push(`- ${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${x}`);
      lines.push('');
    }
  }
  lines.push(`<!-- facts:${Buffer.from(JSON.stringify(rows)).toString('base64')} -->`);
  return lines.join('\n');
}

const [cmd] = argv.splice(0, 1);
if (cmd === 'extract') {
  const out = opt('out'); const self = opt('self'); const [role, file] = argv;
  if (!role || !out) throw new Error('usage: extract <role> <execution_file> [--self run-report.json] --out <facts.json>');
  const facts = file && existsSync(file) ? extract(role, file) : { role, outcome: 'no log', turns: 0, toolCalls: 0, byKind: {}, failedByKind: {},
    deploys: { attempts: 0, failed: 0, firstAttemptFailed: null, errors: {}, components: {} },
    tests: { apexRuns: 0, apexRunsFailed: 0, playwrightRuns: 0, playwrightRunsFailed: 0, failingTests: {} }, denials: { total: 0, byPattern: {} }, repeats: [] };
  facts.self = readSelf(self, role);
  if (self && existsSync(self)) rmSync(self); // the next agent in this job writes its own
  writeFileSync(out, JSON.stringify(facts));
  console.log(`[run-facts] ${role}: deploys ${facts.deploys.failed}/${facts.deploys.attempts} failed, denials ${facts.denials.total}, self-assessment ${facts.self.missing ? 'missing' : facts.self.invalid ? 'invalid' : 'present'}`);
} else if (cmd === 'publish') {
  const issue = opt('issue'); const runUrl = opt('run-url') ?? '';
  if (!/^\d+$/.test(issue ?? '')) { console.log('run-facts: no issue, skipping'); process.exit(0); }
  const repo = process.env.GITHUB_REPOSITORY; const run = `${process.env.GITHUB_RUN_ID ?? 'local'}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}`;
  const at = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const fresh = argv.filter(existsSync).map((p) => JSON.parse(readFileSync(p, 'utf8'))).map((f) => ({ ...f, key: `${run}/${f.role}`, at, run: runUrl }));
  if (!fresh.length) process.exit(0);
  if (argv.includes('--dry-run') || process.argv.includes('--dry-run')) { console.log(render(fresh)); process.exit(0); }
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['pipe', 'pipe', 'inherit'] });
  const ghWith = (input, ...a) => execFileSync('gh', a, { input, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['pipe', 'pipe', 'inherit'] });
  for (let i = 0; i < 4; i++) {
    const comments = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/issues/${issue}/comments?per_page=100`)).flat();
    const c = comments.find((x) => x.body?.startsWith(MARK));
    const m = c?.body.match(/<!-- facts:([A-Za-z0-9+/=]+) -->/);
    const rows = m ? JSON.parse(Buffer.from(m[1], 'base64').toString()) : [];
    const have = new Set(rows.map((r) => r.key));
    if (i > 0 && fresh.every((r) => have.has(r.key))) break;
    const body = render([...rows, ...fresh.filter((r) => !have.has(r.key))]);
    if (c) ghWith(body, 'api', '-X', 'PATCH', `repos/${repo}/issues/comments/${c.id}`, '-F', 'body=@-');
    else ghWith(body, 'api', `repos/${repo}/issues/${issue}/comments`, '-F', 'body=@-');
    console.log(`run-facts: #${issue} now ${rows.length + fresh.length} runs`);
    execFileSync('sleep', [String(3 + i * 4)]);
  }
} else {
  console.error('usage: run-facts.mjs extract|publish …'); process.exit(2);
}
