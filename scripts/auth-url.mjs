#!/usr/bin/env node
// Writes the SFDX auth URL of an org the CLI is logged in to, to a file (never stdout). Used only to hand a
// scratch org's admin login from the trusted provisioning job to the job that runs PR code (PIPE-09):
// the file is encrypted before it leaves the job. Newer CLIs redact `org display --verbose`, so read it
// through @salesforce/core inside the installed CLI.
//   node scripts/auth-url.mjs <username> <out-file>
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [username, out] = process.argv.slice(2);
const globalRoot = execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim();
const core = await import(pathToFileURL(join(globalRoot, '@salesforce/cli/node_modules/@salesforce/core/lib/index.js')).href);
const info = await core.AuthInfo.create({ username });
writeFileSync(out, info.getSfdxAuthUrl(), { mode: 0o600 });
