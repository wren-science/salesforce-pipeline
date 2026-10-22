#!/usr/bin/env node
// Summarises a claude-code-action session for the run summary: turns, cost, outcome, and any tool calls the
// allowlist denied (so a stuck agent is diagnosable). Strips anything that looks like a credential.
//   node scripts/agent-report.mjs <role> <execution_file>
import { readFileSync, existsSync, appendFileSync } from 'node:fs';

const [role, file] = process.argv.slice(2);
const scrub = (s) => String(s)
  .replace(/force:\/\/\S+/g, '<auth-url>')
  .replace(/sk-ant-[A-Za-z0-9_-]+/g, '<token>')
  .replace(/Pw1![A-Za-z0-9_-]+/g, '<password>')
  .replace(/sid=[^&\s"]+/g, 'sid=<session>')
  .replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/g, '<key>');

const lines = [`### Agent: ${role}`];
if (!file || !existsSync(file)) {
  lines.push('No execution log was produced.');
} else {
  const messages = JSON.parse(readFileSync(file, 'utf8'));
  const result = [...messages].reverse().find((m) => m.type === 'result') ?? {};
  lines.push(`Outcome: ${result.subtype ?? 'unknown'} · turns: ${result.num_turns ?? '?'} · cost: US$${(result.total_cost_usd ?? 0).toFixed(2)}`);
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
