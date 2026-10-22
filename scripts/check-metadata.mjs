#!/usr/bin/env node
// QG-07 / DM-03: every new or changed custom object and field needs a description and a data
// classification; user-facing fields also need help text. Also enforces PIPE-04 (no NPSP references)
// and, on agent branches, PIPE-08 (no changes under .github/).
//   node scripts/check-metadata.mjs <base-ref> [<head-branch>]
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const [base, headBranch = ''] = process.argv.slice(2);
const changed = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', `${base}...HEAD`], { encoding: 'utf8' })
  .split('\n').filter(Boolean);
const problems = [];

for (const f of changed) {
  if (!existsSync(f)) continue;
  const xml = readFileSync(f, 'utf8');
  if (/\.field-meta\.xml$/.test(f)) {
    if (!/<description>[^<]+<\/description>/.test(xml)) problems.push(`${f}: missing description (DM-03, QG-07)`);
    if (!/<securityClassification>[^<]+<\/securityClassification>/.test(xml)) problems.push(`${f}: missing data classification <securityClassification> (DM-03, QG-07)`);
    if (!/<inlineHelpText>[^<]+<\/inlineHelpText>/.test(xml)) problems.push(`${f}: missing help text <inlineHelpText> (QG-07)`);
  }
  if (/\.object-meta\.xml$/.test(f) && /<customSettingsType>|<deploymentStatus>/.test(xml)) {
    if (!/<description>[^<]+<\/description>/.test(xml)) problems.push(`${f}: missing description (DM-03, QG-07)`);
  }
  if (f.startsWith('force-app/') && /\b(npsp|npe01|npe03|npo02|npe4|npe5)__/i.test(xml)) {
    problems.push(`${f}: references NPSP metadata; scratch orgs don't have NPSP (PIPE-04)`);
  }
  if (headBranch.startsWith('feature/') && f.startsWith('.github/')) {
    problems.push(`${f}: story branches must not change .github/ (PIPE-08)`);
  }
}

if (problems.length) {
  for (const p of problems) console.log(`::error::${p}`);
  process.exit(1);
}
console.log(`Metadata checks passed for ${changed.length} changed file(s)`);
