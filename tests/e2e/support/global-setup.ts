import { chromium, FullConfig } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

// For each persona, CI writes a one-time frontdoor URL to .auth/<persona>.url (sf org open --url-only,
// run as that persona's user). We open it once, save the Lightning session as storage state, and delete
// the URL file. Neither file is ever uploaded as evidence; .auth/ is git-ignored.
// Errors are rethrown without URLs: a frontdoor URL carries a session id and CI logs are public.
const scrub = (s: string) => s.replace(/https?:\/\/\S+/g, '<url removed>');

// A persona user that has never signed in is sent to Salesforce's first-login password page.
// Complete it with a random password that is never stored or logged: CI only ever signs in by frontdoor.
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
  if (!/\/lightning\//.test(page.url())) await page.goto('/lightning/page/home');
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
      if (!existsSync(urlFile)) {
        if (existsSync(stateFile)) continue;
        throw new Error(`No login for persona "${project.name}": expected .auth/${project.name}.url`);
      }
      const context = await browser.newContext();
      const page = await context.newPage();
      try {
        await page.goto(readFileSync(urlFile, 'utf8').trim(), { waitUntil: 'domcontentloaded', timeout: 90_000 });
        unlinkSync(urlFile);
        await page.waitForURL(/\/lightning\/|ChangePassword/, { timeout: 90_000 });
        if (/ChangePassword/.test(page.url())) await completeFirstLogin(page, project.name);
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
