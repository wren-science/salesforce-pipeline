#!/usr/bin/env node
// Keeps a running cost ledger for a story on its issue: one row per agent run (tokens, US$, local currency)
// and the cumulative total, in a single comment marked <!-- agent:cost-ledger -->. The rows live in the
// comment itself as base64 JSON, so the ledger needs no other storage. Rows are keyed by run, attempt and
// role, so a rerun of the same job does not count twice.
// It also totals the story's GitHub Actions runner minutes, recounted on every write: the agent runs in the
// ledger, plus every run tagged with the story's branch (PR checks, PR tests, QA validation, reviews, repair,
// and the gate's QA deploy). Minutes are per job, rounded up, reruns included, as GitHub bills them.
//   node scripts/cost-ledger.mjs --issue <n> --run-url <url> <entry.json> [...]
//   node scripts/cost-ledger.mjs --issue <n> --refresh          (recount runner minutes only)
// Needs GH_TOKEN and GITHUB_REPOSITORY. Entries come from scripts/agent-report.mjs --json.
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv.splice(i, 2)[1] : undefined; };
const issue = opt('issue');
const runUrl = opt('run-url') ?? '';
const refresh = argv.includes('--refresh');
if (refresh) argv.splice(argv.indexOf('--refresh'), 1);
if (!/^\d+$/.test(issue ?? '')) { console.log('cost-ledger: no issue number, skipping'); process.exit(0); }
const repo = process.env.GITHUB_REPOSITORY;
const attempt = process.env.GITHUB_RUN_ATTEMPT ?? '1';
const runId = process.env.GITHUB_RUN_ID ?? 'local';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = join(root, 'config/cost.json');
const cfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, 'utf8')) : { currency: 'AUD', symbol: 'A$', usdRate: 1 };

const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
const fresh = argv.filter(existsSync).map((f) => JSON.parse(readFileSync(f, 'utf8')))
  .map((e) => ({ key: `${runId}/${attempt}/${e.role}`, at: now, run: runUrl, ...e }));
if (!fresh.length && !refresh) { console.log('cost-ledger: no entries'); process.exit(0); }

const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024 });
const api = (path) => JSON.parse(gh('api', path));
const MARK = '<!-- agent:cost-ledger -->';

function load() {
  const comments = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/issues/${issue}/comments`)).flat();
  const c = comments.find((x) => x.body?.startsWith(MARK));
  const m = c?.body.match(/<!-- ledger:([A-Za-z0-9+/=]+) -->/);
  return { id: c?.id, rows: m ? JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) : [] };
}

// Billable minutes for the story so far (completed jobs only; a run still going counts what has finished).
function runnerMinutes(rows) {
  const ids = new Set(rows.map((r) => r.run?.match(/runs\/(\d+)/)?.[1]).filter(Boolean));
  const since = api(`repos/${repo}/issues/${issue}`).created_at.slice(0, 10);
  const runs = [];
  for (let page = 1; page <= 10; page++) {
    const batch = JSON.parse(gh('api', `repos/${repo}/actions/runs?per_page=100&page=${page}&created=%3E%3D${since}`,
      '--jq', '[.workflow_runs[] | {id, workflow_id, display_title, event, head_branch}]'));
    runs.push(...batch);
    if (batch.length < 100) break;
  }
  const names = Object.fromEntries(JSON.parse(gh('api', `repos/${repo}/actions/workflows?per_page=100`,
    '--jq', '[.workflows[] | [(.id | tostring), .name]]')));
  const tag = ` · feature/${issue}-`;
  const mine = runs.filter((r) => ids.has(String(r.id)) || r.display_title?.includes(tag) ||
    (r.event === 'pull_request' && r.head_branch?.startsWith(`feature/${issue}-`)));
  const byWorkflow = {};
  for (const r of mine) {
    const jobs = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/actions/runs/${r.id}/jobs?filter=all&per_page=100`))
      .flatMap((p) => p.jobs.map(({ started_at, completed_at, conclusion }) => ({ started_at, completed_at, conclusion })));
    const minutes = jobs.filter((j) => j.started_at && j.completed_at && j.conclusion !== 'skipped')
      .reduce((a, j) => a + Math.max(1, Math.ceil((new Date(j.completed_at) - new Date(j.started_at)) / 60000)), 0);
    if (!minutes) continue;
    const w = (byWorkflow[names[r.workflow_id] ?? r.workflow_id] ??= { runs: 0, minutes: 0 });
    w.runs += 1;
    w.minutes += minutes;
  }
  return byWorkflow;
}

const num = (n) => (n == null ? '—' : n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n));
const money = (usd) => `${cfg.symbol}${(usd * cfg.usdRate).toFixed(2)}`;

function render(rows, minutes) {
  const sum = (f) => rows.reduce((a, r) => a + f(r), 0);
  const usd = sum((r) => r.usd);
  const counted = rows.filter((r) => r.tokens);
  const tok = (k) => counted.reduce((a, r) => a + (r.tokens[k] ?? 0), 0);
  const totalMin = Object.values(minutes).reduce((a, w) => a + w.minutes, 0);
  const totalRuns = Object.values(minutes).reduce((a, w) => a + w.runs, 0);
  const out = [
    MARK,
    `## Agent cost for this story: ${money(usd)} · ${totalMin} runner minutes`,
    '',
    `**${money(usd)}** (US$${usd.toFixed(2)}) across **${rows.length}** agent runs and **${sum((r) => r.turns)}** turns. ` +
      (counted.length ? `Tokens${counted.length < rows.length ? ` (the ${counted.length} runs with counts)` : ''}: ` +
        `${num(tok('input'))} in · ${num(tok('output'))} out · ${num(tok('cacheRead'))} cache read · ${num(tok('cacheWrite'))} cache write.` : ''),
    '',
    `| When (UTC) | Agent | Outcome | Turns | Input | Output | Cache read | Cache write | US$ | ${cfg.currency} |`,
    '|---|---|---|--:|--:|--:|--:|--:|--:|--:|',
    ...rows.map((r) => `| ${r.run ? `[${r.at}](${r.run})` : r.at} | ${r.role} | ${r.outcome} | ${r.turns} | ${num(r.tokens?.input)} | ` +
      `${num(r.tokens?.output)} | ${num(r.tokens?.cacheRead)} | ${num(r.tokens?.cacheWrite)} | ${r.usd.toFixed(2)} | ${money(r.usd)} |`),
    '',
    `### Runner minutes: ${totalMin}`,
    '',
    `**${totalMin}** billable GitHub Actions minutes across **${totalRuns}** workflow runs (GitHub-hosted Linux; ` +
      'each job rounded up to the minute, reruns included, as GitHub bills them).',
    '',
    '| Workflow | Runs | Minutes |',
    '|---|--:|--:|',
    ...Object.entries(minutes).sort((a, b) => b[1].minutes - a[1].minutes).map(([w, v]) => `| ${w} | ${v.runs} | ${v.minutes} |`),
    '',
    `<sub>Cost is what Claude Code reports per session (\`total_cost_usd\`): the API list-price equivalent of the tokens used, ` +
      `whatever plan the pipeline is billed on. ${cfg.currency} at ${cfg.usdRate} per US$ (${cfg.rateNote ?? 'config/cost.json'}). ` +
      'Token counts show — for runs recorded before the ledger existed. Runner minutes are recounted on every update ' +
      '(runs from before 22 Oct 2026, 16:40 UTC carry no story tag and are not counted); ' +
      'a public repository is not billed for them. Updated by the pipeline; do not edit.</sub>',
    `<!-- ledger:${Buffer.from(JSON.stringify(rows)).toString('base64')} -->`,
  ];
  return out.join('\n');
}

// Read, merge, write, then check: two workflows can update the same story at once, so retry until
// every row we wrote is present. A refresh with no new rows writes once.
for (let i = 0; i < 4; i++) {
  const { id, rows } = load();
  const have = new Set(rows.map((r) => r.key));
  if (fresh.length && fresh.every((e) => have.has(e.key)) && (i > 0 || !refresh)) break;
  const merged = [...rows, ...fresh.filter((e) => !have.has(e.key))];
  const minutes = runnerMinutes(merged);
  const body = render(merged, minutes);
  if (id) gh('api', '-X', 'PATCH', `repos/${repo}/issues/comments/${id}`, '-f', `body=${body}`);
  else gh('api', `repos/${repo}/issues/${issue}/comments`, '-f', `body=${body}`);
  console.log(`cost-ledger: #${issue} now ${merged.length} agent runs, ${money(merged.reduce((a, r) => a + r.usd, 0))}, ` +
    `${Object.values(minutes).reduce((a, w) => a + w.minutes, 0)} runner minutes`);
  if (!fresh.length) break;
  execFileSync('sleep', [String(3 + i * 4)]);
}
