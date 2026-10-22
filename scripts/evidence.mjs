#!/usr/bin/env node
// Builds the evidence table for a PR (or a QA run) from Playwright's JSON report and Apex JUnit results.
// Each row: acceptance criterion, test, persona, result, duration. Prints Markdown to stdout.
//   node scripts/evidence.mjs --playwright <results.json> --apex <junit dir or file> --title <heading> --run-url <url>
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const rows = [];
const icon = (ok) => (ok ? 'Pass' : 'FAIL');
const ac = (title) => (title.match(/#(\d+)\s+AC(\d+)/) || []).slice(1);
// A suite that was asked for but produced no results is a failure, not a pass with fewer rows.
const missing = [];

if (args.playwright && existsSync(args.playwright)) {
  const report = JSON.parse(readFileSync(args.playwright, 'utf8'));
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results.at(-1) ?? {};
        const persona = t.annotations?.find((a) => a.type === 'persona')?.description ?? t.projectName;
        const [issue, n] = ac(spec.title);
        rows.push({ kind: 'Playwright', ac: issue ? `#${issue} AC${n}` : '', test: spec.title.replace(/^#\d+\s+AC\d+:\s*/, ''), persona, ok: t.status === 'expected', ms: last.duration ?? 0 });
      }
    }
    for (const s of suite.suites ?? []) walk(s);
  };
  for (const s of report.suites ?? []) walk(s);
  const err = report.errors?.[0]?.message?.split('\n')[0];
  if (!rows.length) missing.push(`Playwright ran no tests${err ? `: ${err.replace(/https?:\/\/\S+/g, '<url>').slice(0, 200)}` : ''}`);
} else if (args.playwright) {
  missing.push('Playwright produced no results file (the acceptance tests did not run)');
}

const junitFiles = (p) => !p || !existsSync(p) ? [] : statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith('junit.xml')).map((f) => join(p, f)) : [p];
for (const f of junitFiles(args.apex)) {
  const xml = readFileSync(f, 'utf8');
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attr = (k) => (m[1].match(new RegExp(`(?:^|\\s)${k}="([^"]*)"`)) || [])[1] ?? '';
    const failed = /<failure|<error/.test(m[3] ?? '');
    rows.push({ kind: 'Apex', ac: '', test: `${attr('classname')}.${attr('name')}`, persona: 'TestPersonaFactory (runAs)', ok: !failed, ms: Math.round(parseFloat(attr('time') || '0') * 1000) });
  }
}

if (args.apex && !rows.some((r) => r.kind === 'Apex')) missing.push('Apex produced no results');
const passed = rows.filter((r) => r.ok).length;
const out = [
  `### ${args.title ?? 'Test evidence'}`,
  '',
  rows.length ? `**${passed} of ${rows.length} tests passed.** Every test ran as a persona (TST-16). Screenshots, video and traces: [run artefacts](${args['run-url'] ?? '#'}).` : '**No test results were found.**',
  ...missing.map((m) => `**Not run: ${m}.** This counts as a failure.`),
  '',
  '| Criterion | Kind | Test | Persona | Result | Time |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map((r) => `| ${r.ac || '—'} | ${r.kind} | ${r.test.replace(/\|/g, '\\|')} | ${r.persona} | ${icon(r.ok)} | ${(r.ms / 1000).toFixed(1)} s |`),
];
console.log(out.join('\n'));
process.exitCode = rows.length && passed === rows.length && !missing.length ? 0 : 1;
