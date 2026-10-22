#!/usr/bin/env node
// Merge gate: merges a story PR into integration once everything a person would check has passed, then
// starts the QA deploy. Stateless and idempotent: it looks at every open story PR each time it runs.
//
// A story PR (feature/* into integration) merges when, for its current head commit:
//   - Static checks, tests/scratch, validate/qa and review/agents have all succeeded;
//   - validate/qa ran after integration's latest commit (else the gate re-runs it against today's QA);
//   - it has no human:approval-required label (an agent or a person asked for a person);
//   - with human:review-wanted, a person (not a bot) has approved this commit.
// People step in where they want to (human:review-wanted) or where an agent asks (human:approval-required).
//
// Runs with the workflow's GITHUB_TOKEN. Pushes made with that token start no workflows, so the gate
// dispatches deploy-qa itself after a merge.
//   node scripts/merge-gate.mjs            (needs GH_TOKEN, GITHUB_REPOSITORY)
import { execFileSync } from 'node:child_process';

const repo = process.env.GITHUB_REPOSITORY;
const dryRun = process.argv.includes('--dry-run');
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] });
const api = (path, ...a) => JSON.parse(gh('api', path, ...a) || 'null');
const log = (m) => console.log(`[merge-gate] ${m}`);
const REQUIRED = ['Static checks', 'tests/scratch', 'validate/qa', 'review/agents'];

const integrationHead = api(`repos/${repo}/commits/integration`);
const integrationAt = new Date(integrationHead.commit.committer.date);
const prs = api(`repos/${repo}/pulls?state=open&base=integration&per_page=50`)
  .filter((p) => p.head.ref.startsWith('feature/') && p.head.repo?.full_name === repo);

let merged = 0;
for (const pr of prs) {
  const n = pr.number, sha = pr.head.sha;
  const labels = pr.labels.map((l) => l.name);
  const say = (m) => log(`#${n} ${m}`);
  if (labels.includes('human:approval-required')) { say('waiting for a person (human:approval-required)'); continue; }

  // Results for this exact commit: commit statuses (latest per context) and check runs.
  const statuses = {};
  for (const s of api(`repos/${repo}/commits/${sha}/statuses?per_page=100`)) statuses[s.context] ??= s;
  for (const c of api(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).check_runs) {
    statuses[c.name] ??= { state: c.status === 'completed' ? (c.conclusion === 'success' ? 'success' : 'failure') : 'pending', updated_at: c.completed_at };
  }
  const notGreen = REQUIRED.filter((r) => statuses[r]?.state !== 'success');
  if (notGreen.length) { say(`not ready: ${notGreen.map((r) => `${r}=${statuses[r]?.state ?? 'missing'}`).join(', ')}`); continue; }

  // The check-only deploy must have run against QA as it is now (other stories may have merged since).
  if (new Date(statuses['validate/qa'].updated_at) < integrationAt) {
    const runId = statuses['validate/qa'].target_url?.match(/actions\/runs\/(\d+)/)?.[1];
    say(`validate/qa predates integration's latest commit; re-validating${runId ? ` (run ${runId})` : ''}`);
    if (runId && !dryRun) {
      if (api(`repos/${repo}/actions/runs/${runId}`).status === 'completed') gh('api', '-X', 'POST', `repos/${repo}/actions/runs/${runId}/rerun`);
    }
    continue;
  }

  if (labels.includes('human:review-wanted')) {
    const approved = api(`repos/${repo}/pulls/${n}/reviews?per_page=100`)
      .some((r) => r.state === 'APPROVED' && r.commit_id === sha && r.user?.type === 'User');
    if (!approved) { say('waiting for a person to approve (human:review-wanted)'); continue; }
  }

  // Story PRs are mergeable one at a time: the next run re-checks the others against the new integration.
  if (merged) { say('ready; merging after the next QA validation'); continue; }
  if (dryRun) { say('would merge'); merged++; continue; }
  if (pr.draft) gh('pr', 'ready', String(n), '--repo', repo);
  const body = [
    'Merged by the merge gate: static checks, persona tests in a scratch org (tests/scratch), check-only deploy to QA ' +
      '(validate/qa) and the three reviewer agents (review/agents) all passed on this commit.',
    labels.includes('human:review-wanted') ? 'A person approved it (human:review-wanted).' : 'No person was asked for, and none asked to review.',
  ].join(' ');
  try {
    gh('pr', 'merge', String(n), '--repo', repo, '--squash', '--delete-branch', '--match-head-commit', sha);
  } catch (e) {
    say(`merge refused: ${String(e.message).split('\n')[0]}`);
    gh('pr', 'edit', String(n), '--repo', repo, '--add-label', 'human:approval-required');
    gh('pr', 'comment', String(n), '--repo', repo, '--body', 'The merge gate could not merge this PR (conflict or rule). A person needs to look.');
    continue;
  }
  gh('pr', 'comment', String(n), '--repo', repo, '--body', body);
  gh('workflow', 'run', 'deploy-qa.yml', '--repo', repo, '--ref', 'integration');
  say('merged; deploy to QA started');
  delivered(pr);
  merged++;
}
if (!prs.length) log('no open story PRs');

// On the story's issue: lead time from the first agent:plan label to this merge, and the agent cost so far.
function delivered(pr) {
  const issue = pr.head.ref.match(/^feature\/(\d+)-/)?.[1];
  if (!issue) return;
  const events = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/issues/${issue}/events?per_page=100`)).flat();
  const start = events.find((e) => e.event === 'labeled' && e.label?.name === 'agent:plan')?.created_at;
  const hours = start ? (Date.now() - new Date(start)) / 36e5 : null;
  const ledger = JSON.parse(gh('api', '--paginate', '--slurp', `repos/${repo}/issues/${issue}/comments?per_page=100`)).flat()
    .find((c) => c.body?.startsWith('<!-- agent:cost-ledger -->'));
  const cost = ledger?.body.match(/^## Agent cost for this story: (\S+)/m)?.[1];
  const lead = hours == null ? 'unknown' : hours < 48 ? `${hours.toFixed(1)} hours` : `${(hours / 24).toFixed(1)} days`;
  gh('issue', 'comment', issue, '--repo', repo, '--body',
    `<!-- agent:delivered -->\n**Delivered to integration by PR #${pr.number}; deploying to the QA sandbox.**\n\n` +
    `Lead time from \`agent:plan\` to merge: **${lead}**.` + (cost ? ` Agent cost so far: **${cost}** (see the cost ledger above).` : ''));
}
