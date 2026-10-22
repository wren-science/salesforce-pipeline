import { defineConfig } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// One Playwright project per persona in the catalogue: every test runs as a persona user,
// never as an administrator (docs/standards/personas.md).
const catalogue = JSON.parse(readFileSync(join(__dirname, '../../config/personas.json'), 'utf8'));
const personas: { key: string; name: string }[] = catalogue.personas;

// EVIDENCE=full  — scratch orgs (synthetic, deleted after the PR): video and trace for every test.
// EVIDENCE=lean  — shared orgs (QA): screenshots, trace and video only when a test fails.
const full = (process.env.EVIDENCE ?? 'full') === 'full';

export default defineConfig({
  testDir: './specs',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  globalSetup: './support/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['junit', { outputFile: 'results/junit.xml' }],
    ['json', { outputFile: 'results/results.json' }],
    ...(process.env.GITHUB_ACTIONS ? [['github'] as ['github']] : []),
  ],
  use: {
    baseURL: process.env.SF_BASE_URL,
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    video: full ? 'on' : 'retain-on-failure',
    trace: full ? 'on' : 'retain-on-failure',
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
  },
  projects: personas.map((p) => ({
    name: p.key,
    metadata: { persona: p.name },
    use: { storageState: join(__dirname, '.auth', `${p.key}.json`) },
  })),
});
