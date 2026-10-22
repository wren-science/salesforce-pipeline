#!/usr/bin/env node
// Prints the Lightning base URL (https://<domain>.lightning.force.com) of an org the CLI is logged in to.
//   node scripts/lightning-url.mjs <alias>
import { execFileSync } from 'node:child_process';
const out = execFileSync('sf', ['org', 'display', '--target-org', process.argv[2], '--json'], {
  encoding: 'utf8', env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
});
const start = out.search(/^\{\s*$/m);
const url = JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{'))).result.instanceUrl;
console.log(url.replace('.my.salesforce.com', '.lightning.force.com'));
