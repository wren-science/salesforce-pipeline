#!/usr/bin/env node
// The one way agents write and read their working records (docs/pipeline/agent-records.md). Fixed shapes, so
// every story's records look the same and the pipeline-health agent can compare runs. Everything is validated.
//
//   node scripts/agent-records.mjs log --issue <n> --role <role> --hypothesis "…" --action "…" --result "…"
//        --conclusion confirmed|ruled-out|inconclusive [--evidence <url or path>]...
//        Appends one investigation step to .agent/<n>/investigation.jsonl.
//   node scripts/agent-records.mjs tried --issue <n>          Prints the investigation so far (read it first).
//   node scripts/agent-records.mjs validate <file>...         Validates handover.json / investigation.jsonl / review.json.
//   node scripts/agent-records.mjs render-review <review.json> Prints the PR comment for a review (pipeline use).
//   node scripts/agent-records.mjs findings --pr <n>          Open findings from the latest review of each reviewer.
import { readFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, ...rest] = process.argv.slice(2);
const opts = {}; const files = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) { const k = rest[i].slice(2); (opts[k] ??= []).push(rest[++i]); } else files.push(rest[i]);
}
const one = (k) => opts[k]?.[0];

export const ROLES = ['planner', 'test-writer', 'developer', 'repair', 'reviewer-architecture', 'reviewer-security', 'reviewer-tests', 'pipeline-health'];
const CONCLUSIONS = ['confirmed', 'ruled-out', 'inconclusive'];
const STAGES = ['tests-written', 'review-required', 'rework', 'blocked'];
const VERDICTS = ['approve-able', 'changes-needed'];
const MAX = 600; // one record field: a sentence or two, not a report

// --- validation -------------------------------------------------------------------------------------
const errs = [];
const need = (cond, where, msg) => { if (!cond) errs.push(`${where}: ${msg}`); };
const str = (v, where, k, { optional = false, max = MAX } = {}) => {
  if (optional && v === undefined) return;
  need(typeof v === 'string' && v.trim().length > 0, where, `${k} must be a non-empty string`);
  if (typeof v === 'string') need(v.length <= max, where, `${k} is longer than ${max} characters: keep records short`);
};
const ruleId = /^[A-Z]{2,4}-\d{2}$/;

function checkStep(s, where) {
  need(s && typeof s === 'object', where, 'must be an object');
  need(ROLES.includes(s.role), where, `role must be one of ${ROLES.join(', ')}`);
  for (const k of ['hypothesis', 'action', 'result']) str(s[k], where, k);
  need(CONCLUSIONS.includes(s.conclusion), where, `conclusion must be one of ${CONCLUSIONS.join(', ')}`);
  need(!s.evidence || (Array.isArray(s.evidence) && s.evidence.every((e) => typeof e === 'string')), where, 'evidence must be a list of links or paths');
}
function checkHandover(h, where) {
  if (h.version !== 2) { console.warn(`warning: ${where} is a legacy handover (no "version": 2); not validated`); return; }
  need(Number.isInteger(h.issue), where, 'issue must be a number');
  need(STAGES.includes(h.stage), where, `stage must be one of ${STAGES.join(', ')}`);
  need(ROLES.includes(h.role), where, 'role must be an agent role');
  str(h.summary, where, 'summary', { max: 1200 });
  need(Array.isArray(h.standards) && h.standards.every((r) => ruleId.test(r)), where, 'standards must be rule IDs like DES-01');
  need(Array.isArray(h.acceptanceCriteria) && h.acceptanceCriteria.length > 0, where, 'acceptanceCriteria must list every criterion');
  for (const [i, ac] of (h.acceptanceCriteria ?? []).entries()) {
    const w = `${where} acceptanceCriteria[${i}]`;
    need(/^AC\d+$/.test(ac.id ?? ''), w, 'id must be AC<n>');
    need(['passed', 'failing', 'not-built'].includes(ac.status), w, 'status must be passed, failing or not-built');
    str(ac.evidence, w, 'evidence');
  }
  need(Array.isArray(h.testChanges ?? []), where, 'testChanges must be a list');
  for (const [i, t] of (h.testChanges ?? []).entries()) {
    const w = `${where} testChanges[${i}]`;
    str(t.test, w, 'test'); str(t.change, w, 'change'); str(t.whyNotWeaker, w, 'whyNotWeaker');
  }
  need(Array.isArray(h.openQuestions ?? []), where, 'openQuestions must be a list');
  for (const [i, q] of (h.openQuestions ?? []).entries()) {
    const w = `${where} openQuestions[${i}]`;
    str(q.question, w, 'question'); need(['person', 'pipeline'].includes(q.owner), w, 'owner must be person or pipeline');
  }
  for (const k of ['attempts', 'scratchOrg', 'sandbox']) need(h[k] === undefined, where, `${k} is the pipeline's to record, not the handover's`);
  for (const [i, f] of (h.findings ?? []).entries()) {
    const w = `${where} findings[${i}]`;
    str(f.id, w, 'id', { max: 40 }); need(['fixed', 'disputed'].includes(f.status), w, 'status must be fixed or disputed'); str(f.note, w, 'note');
  }
}
function checkReview(r, where) {
  need(ROLES.includes(r.role) && r.role.startsWith('reviewer-'), where, 'role must be a reviewer role');
  need(VERDICTS.includes(r.verdict), where, `verdict must be one of ${VERDICTS.join(', ')}`);
  str(r.scope, where, 'scope');
  need(Array.isArray(r.findings), where, 'findings must be a list (empty if none)');
  for (const [i, f] of (r.findings ?? []).entries()) {
    const w = `${where} findings[${i}]`;
    need(/^[a-z]+-\d+$/.test(f.id ?? ''), w, 'id must look like sec-1, arch-2, tests-3');
    need(ruleId.test(f.rule ?? ''), w, 'rule must be a rule ID like SHR-04');
    need(typeof f.blocking === 'boolean', w, 'blocking must be true (MUST broken) or false (SHOULD)');
    str(f.file, w, 'file', { max: 200 }); str(f.problem, w, 'problem'); str(f.fix, w, 'fix');
    need(f.line === undefined || Number.isInteger(f.line), w, 'line must be a number');
  }
  need(r.verdict !== 'approve-able' || !(r.findings ?? []).some((f) => f.blocking), where, 'an approve-able review cannot have blocking findings');
}
function validateFile(f) {
  const name = basename(f);
  if (f.includes('/diagnostics/')) return;
  const text = readFileSync(f, 'utf8');
  if (name.endsWith('.jsonl')) {
    text.split('\n').filter(Boolean).forEach((l, i) => { try { checkStep(JSON.parse(l), `${f}:${i + 1}`); } catch (e) { errs.push(`${f}:${i + 1}: not JSON (${e.message})`); } });
    return;
  }
  let j; try { j = JSON.parse(text); } catch (e) { errs.push(`${f}: not JSON (${e.message})`); return; }
  if (name === 'handover.json') checkHandover(j, f);
  else if (name === 'review.json') checkReview(j, f);
  else if (f.includes('/diagnostics/')) return; // free-form evidence, referenced from investigation steps
  else errs.push(`${f}: unknown record type (expected handover.json, investigation.jsonl or review.json)`);
}
const finish = () => { if (errs.length) { console.error(errs.map((e) => `invalid: ${e}`).join('\n')); process.exit(1); } };

// --- commands ---------------------------------------------------------------------------------------
const issueDir = (n) => join(root, '.agent', String(n));

if (cmd === 'log') {
  const n = one('issue');
  const step = { at: new Date().toISOString(), role: one('role'), run: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}/${process.env.GITHUB_RUN_ATTEMPT ?? 1}` : 'local',
    hypothesis: one('hypothesis'), action: one('action'), result: one('result'), conclusion: one('conclusion'), evidence: opts.evidence ?? [] };
  need(/^\d+$/.test(n ?? ''), 'log', '--issue is required');
  checkStep(step, 'log'); finish();
  mkdirSync(issueDir(n), { recursive: true });
  appendFileSync(join(issueDir(n), 'investigation.jsonl'), JSON.stringify(step) + '\n');
  console.log(`logged: ${step.role} ${step.conclusion}: ${step.hypothesis}`);
} else if (cmd === 'tried') {
  const f = join(issueDir(one('issue')), 'investigation.jsonl');
  if (!existsSync(f)) { console.log('No investigation recorded yet.'); process.exit(0); }
  for (const l of readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
    const s = JSON.parse(l);
    console.log(`- [${s.conclusion}] (${s.role}, run ${s.run}) ${s.hypothesis}\n    did: ${s.action}\n    saw: ${s.result}`);
  }
} else if (cmd === 'validate') {
  for (const f of files) validateFile(f);
  finish(); console.log(`valid: ${files.join(', ')}`);
} else if (cmd === 'render-review') {
  const f = files[0]; validateFile(f); finish();
  const r = JSON.parse(readFileSync(f, 'utf8'));
  const block = r.findings.filter((x) => x.blocking), adv = r.findings.filter((x) => !x.blocking);
  const row = (x) => `| ${x.id} | ${x.rule} | \`${x.file}${x.line ? `:${x.line}` : ''}\` | ${x.problem.replace(/\|/g, '\\|')} | ${x.fix.replace(/\|/g, '\\|')} |`;
  const table = (xs) => xs.length ? ['| ID | Rule | Where | Problem | Fix |', '|---|---|---|---|---|', ...xs.map(row)].join('\n') : 'None.';
  console.log([`<!-- review:${r.role} -->`, `## ${r.role}: ${r.verdict === 'approve-able' ? 'Approve-able' : 'Changes needed'}`, '',
    `Scope: ${r.scope}`, '', '### Blocking (MUST)', '', table(block), '', '### Advisory (SHOULD)', '', table(adv), '',
    `<!-- findings:${Buffer.from(JSON.stringify(r)).toString('base64')} -->`].join('\n'));
} else if (cmd === 'findings') {
  const pr = one('pr'); const repo = process.env.GITHUB_REPOSITORY ?? 'wren-science/salesforce-pipeline';
  const comments = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', `repos/${repo}/issues/${pr}/comments?per_page=100`], { encoding: 'utf8', maxBuffer: 64 << 20 })).flat();
  const latest = {};
  for (const c of comments) {
    const m = c.body?.match(/<!-- findings:([A-Za-z0-9+/=]+) -->/);
    if (m) { const r = JSON.parse(Buffer.from(m[1], 'base64').toString()); latest[r.role] = { ...r, at: c.created_at }; }
  }
  const open = Object.values(latest).flatMap((r) => r.findings.map((f) => ({ ...f, reviewer: r.role, at: r.at })));
  if (!open.length) { console.log('No open findings.'); process.exit(0); }
  for (const f of open) console.log(`${f.blocking ? 'BLOCKING' : 'advisory'} ${f.id} ${f.rule} ${f.file}${f.line ? `:${f.line}` : ''} (${f.reviewer})\n  problem: ${f.problem}\n  fix: ${f.fix}`);
} else {
  console.error('usage: agent-records.mjs log|tried|validate|render-review|findings …'); process.exit(2);
}
