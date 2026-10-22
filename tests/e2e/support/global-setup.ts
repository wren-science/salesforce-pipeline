import { chromium, FullConfig } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { totp } from './totp';
import { execFileSync } from 'node:child_process';

// A fresh one-time sign-in link for the persona, made just before use (they expire within minutes).
function freshLoginUrl(dir: string, key: string): string | undefined {
  const aliasFile = join(dir, `${key}.alias`);
  if (!existsSync(aliasFile)) return undefined;
  try {
    const out = execFileSync('sf', ['org', 'open', '--target-org', readFileSync(aliasFile, 'utf8').trim(), '--url-only', '--json'], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    });
    const start = out.search(/^\{\s*$/m);
    return JSON.parse(out.slice(start >= 0 ? start : out.indexOf('{'))).result.url;
  } catch {
    return undefined;
  }
}

// For each persona, CI writes a one-time frontdoor URL to .auth/<persona>.url (sf org open --url-only,
// run as that persona's user). We open it once, save the Lightning session as storage state, and delete
// the URL file. Neither file is ever uploaded as evidence; .auth/ is git-ignored.
// Errors are rethrown without URLs: a frontdoor URL carries a session id and CI logs are public.
const scrub = (s: string) => s.replace(/https?:\/\/\S+/g, '<url removed>');

// A persona user that has never signed in is sent to Salesforce's first-login password page.
// Complete it with a random password that is never stored or logged: CI only ever signs in by frontdoor.
// Salesforce MFA for persona test users in orgs that enforce it (QA). Each persona has an authenticator-app
// (TOTP) secret in PERSONA_TOTP_<KEY>. If the org asks the persona to register MFA, we register an
// authenticator app, compute the code ourselves, and save the new secret to .auth/<key>.totp, which later
// sign-ins in the same job use. Pool sandboxes clear the registration on every lease (personas.mjs --reset-mfa),
// so registering there is expected; in QA the secret must persist, so a registration there warns loudly.
async function handleIdentity(page: import('@playwright/test').Page, key: string, dir: string) {
  const envKey = `PERSONA_TOTP_${key.toUpperCase().replace(/-/g, '_')}`;
  for (let i = 0; i < 8 && /\/_ui\/identity\//.test(page.url()); i++) {
    const path = new URL(page.url()).pathname;
    if (/AddPasskeyUi/.test(path)) {
      await page.getByText('Choose Another Verification Method').click();
    } else if (/RegistrationStartUi/.test(path)) {
      await page.getByText('One-Time Password App').click();
      const next = page.getByRole('button', { name: /Continue|Next/ });
      if (await next.count()) await next.first().click();
    } else if (/AddTwoFactorUi/.test(path)) {
      await page.getByText(/Can.t Scan the QR Code/i).click();
      const text = await page.locator('body').innerText();
      const secret = (text.match(/Key\s+([A-Z2-7 ]{16,})/) || [])[1]?.replace(/\s/g, '');
      if (!secret) throw new Error('Could not read the authenticator key on the MFA registration page');
      writeFileSync(join(dir, `${key}.totp`), secret, { mode: 0o600 });
      await page.locator('input[type="text"], input[type="tel"], input[name*="otp" i], input[id*="code" i]').last().fill(totp(secret));
      await page.locator('input[type="submit"], button[type="submit"], #save').first().click();
      if (process.env.CI && process.env.PERSONA_MFA_PERSISTENT) console.log(`::warning::Registered a new MFA authenticator for persona ${key}; store .auth/${key}.totp as ${envKey}`);
    } else {
      const saved = join(dir, `${key}.totp`);
      const secret = process.env[envKey] || (existsSync(saved) ? readFileSync(saved, 'utf8').trim() : '');
      if (!secret) throw new Error(`MFA challenge at ${path} but neither ${envKey} nor .auth/${key}.totp is set`);
      await page.locator('input[type="text"], input[type="tel"], input[name*="otp" i], input[id*="code" i]').last().fill(totp(secret));
      await page.locator('input[type="submit"], button[type="submit"], #save').first().click();
    }
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
  }
}

// The provisioning step sets a random password (PERSONA_PASSWORD_<KEY>) for exactly this purpose.
async function completeFirstLogin(page: import('@playwright/test').Page, key: string) {
  const current = process.env[`PERSONA_PASSWORD_${key.toUpperCase().replace(/-/g, '_')}`] ?? '';
  const secret = 'Pw1!' + randomBytes(18).toString('base64url');
  await page.locator('#newpassword').waitFor({ timeout: 30_000 });
  if (await page.locator('#currentpassword').count()) await page.locator('#currentpassword').fill(current);
  await page.locator('#newpassword').fill(secret);
  await page.locator('#confirmpassword').fill(secret);
  if (await page.locator('#answer').count()) await page.locator('#answer').fill(randomBytes(9).toString('base64url'));
  await page.locator('#password-button').click();
  await page.waitForURL((u) => !/ChangePassword/.test(u.toString()), { timeout: 60_000 });
  // Global setup's browser context has no baseURL: resolve against the org the sign-in landed on.
  if (!/\/lightning\//.test(page.url())) await page.goto(new URL('/lightning/page/home', page.url()).toString());
}

// Persona passwords written by scripts/personas.mjs (git-ignored, 0600). Used only if the environment lacks them.
function loadPersonaEnv() {
  const f = join(__dirname, '..', '.auth', 'persona.env');
  if (!existsSync(f)) return;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const i = line.indexOf('=');
    if (i > 0 && !process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
  }
}

export default async function globalSetup(config: FullConfig) {
  loadPersonaEnv();
  const browser = await chromium.launch();
  try {
    for (const project of config.projects) {
      const dir = join(__dirname, '..', '.auth');
      const urlFile = join(dir, `${project.name}.url`);
      const stateFile = join(dir, `${project.name}.json`);
      const fresh = freshLoginUrl(dir, project.name);
      if (fresh) writeFileSync(urlFile, fresh, { mode: 0o600 });
      if (!existsSync(urlFile)) {
        if (existsSync(stateFile)) continue;
        throw new Error(`No login for persona "${project.name}": expected .auth/${project.name}.url`);
      }
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(readFileSync(urlFile, 'utf8').trim(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
        unlinkSync(urlFile);
        await page.waitForURL(/\/lightning\/|ChangePassword|\/_ui\/identity\//, { timeout: 90_000 });
        if (/ChangePassword/.test(page.url())) await completeFirstLogin(page, project.name);
        await handleIdentity(page, project.name, dir);
        await page.waitForURL(/\/lightning\//, { timeout: 90_000 });
        await page.locator('.slds-global-header, header[role="banner"]').first().waitFor({ timeout: 90_000 });
      } catch (e) {
        const where = new URL(page.url()).pathname;
        await page.screenshot({ path: join(__dirname, '..', 'test-results', `login-failure-${project.name}.png`), fullPage: true }).catch(() => {});
        throw new Error(`Persona "${project.name}" did not reach Lightning (stopped at ${where}): ${scrub(String((e as Error).message).split('\n')[0])}`);
      }
      await context.storageState({ path: stateFile });
      await context.close();
      writeFileSync(join(dir, `${project.name}.ok`), new Date().toISOString());
    }
  } finally {
    await browser.close();
  }
}
