#!/usr/bin/env node
// Summarises a claude-code-action session for the run summary: turns, tokens, cost, outcome, and any tool
// calls the allowlist denied (so a stuck agent is diagnosable). Strips anything that looks like a credential.
// With --json it also writes the usage as one cost-ledger entry (scripts/cost-ledger.mjs).
//   node scripts/agent-report.mjs <role> <execution_file> [--json <entry.json>]
import { readFileSync, existsSync, appendFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const jsonAt = argv.indexOf('--json');
const jsonOut = jsonAt >= 0 ? argv.splice(jsonAt, 2)[1] : null;
const [role, file] = argv;
const scrub = (s) => String(s)
  .replace(/force:\/\/\S+/g, '<auth-url>')
  .replace(/sk-ant-[A-Za-z0-9_-]+/g, '<token>')
  .replace(/Pw1![A-Za-z0-9_-]+/g, '<password>')
  .replace(/sid=[^&\s"]+/g, 'sid=<session>')
  .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '<key>');

// Token counts: prefer the per-model breakdown, fall back to the session totals.
function tokens(result) {
  const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const models = Object.entries(result.modelUsage ?? {});
  if (models.length) {
    for (const [, m] of models) {
      t.input += m.inputTokens ?? 0;
      t.output += m.outputTokens ?? 0;
      t.cacheRead += m.cacheReadInputTokens ?? 0;
      t.cacheWrite += m.cacheCreationInputTokens ?? 0;
    }
  } else {
    const u = result.usage ?? {};
    t.input = u.input_tokens ?? 0;
    t.output = u.output_tokens ?? 0;
    t.cacheRead = u.cache_read_input_tokens ?? 0;
    t.cacheWrite = u.cache_creation_input_tokens ?? 0;
  }
  return { ...t, models: models.map(([name]) => name) };
}

const lines = [`### Agent: ${role}`];
let entry = { role, outcome: 'no log', turns: 0, usd: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, models: [] } };
if (!file || !existsSync(file)) {
  lines.push('No execution log was produced.');
} else {
  const messages = JSON.parse(readFileSync(file, 'utf8'));
  const result = [...messages].reverse().find((m) => m.type === 'result') ?? {};
  entry = { role, outcome: result.subtype ?? 'unknown', turns: result.num_turns ?? 0, usd: result.total_cost_usd ?? 0, tokens: tokens(result) };
  const k = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
  const t = entry.tokens;
  lines.push(`Outcome: ${entry.outcome} · turns: ${entry.turns} · cost: US$${entry.usd.toFixed(2)}`);
  lines.push(`Tokens: ${k(t.input)} in · ${k(t.output)} out · ${k(t.cacheRead)} cache read · ${k(t.cacheWrite)} cache write`);
  const denials = result.permission_denials ?? [];
  if (denials.length) {
    lines.push('', `Denied by the tool allowlist (${denials.length}):`, '');
    for (const d of denials) {
      const input = d.tool_input?.command ?? d.tool_input?.file_path ?? JSON.stringify(d.tool_input ?? {});
      lines.push(`- \`${d.tool_name}\`: \`${scrub(input).slice(0, 160).replace(/`/g, "'")}\``);
    }
  }
  if (result.result) lines.push('', 'Final message:', '', scrub(result.result).slice(0, 1500));
}
const out = lines.join('\n') + '\n';
console.log(out);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, out + '\n');
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(entry));
