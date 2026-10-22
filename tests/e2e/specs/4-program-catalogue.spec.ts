import { test, expect } from '../support/evidence';
import type { Locator, Page } from '@playwright/test';

// Issue #4: Program catalogue. Runs as the Recruitment Officer, the persona that maintains Programs
// through its Recruitment_Officer permission set group (DES-01, TST-17).
// Data is synthetic and unique per run (PIPE-14): codes are E2E-<runId>-<n>, within Program Code's 20 chars.
// The persona has no Delete (AC3), so the pipeline removes these Programs after every run by their E2E- codes,
// as its own identity (config/test-data.json, scripts/cleanup-test-data.mjs, PIPE-15).
const runId = Date.now().toString(36).toUpperCase();
const code = (n: number) => `E2E-${runId}-${n}`;
const name = (n: number) => `E2E Program ${runId} ${n}`;

type Program = { n: number; studyLevel: string; faculty: string; active: boolean };

async function pick(scope: Locator, label: string, option: string) {
  const box = scope.getByRole('combobox', { name: label });
  const choice = scope.getByRole('option', { name: option, exact: true });
  // The modal's listbox can close while Playwright scrolls an option into view; reopen until the value is chosen.
  await expect(async () => {
    if ((await box.getAttribute('aria-expanded')) !== 'true') await box.click();
    await choice.click({ timeout: 3_000 });
    await expect(box).toHaveText(option, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

// In view mode Lightning shows a checkbox field as the text True or False, not as a checkbox.
function activeField(page: Page) {
  return page
    .getByRole('tabpanel', { name: 'Details' })
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: 'Edit Active' }) });
}

async function setActive(scope: Locator, active: boolean) {
  const box = scope.getByRole('checkbox', { name: 'Active' });
  if (active) await box.check();
  else await box.uncheck();
}

// The list grid renders rows lazily as it scrolls; scroll until every row the list reports is in the DOM,
// so presence and absence checks see the whole list, not only its first screen.
async function loadAllRows(page: Page, list: string) {
  const status = page.getByRole('status', { name: list });
  const rows = page.getByRole('grid', { name: list }).getByRole('rowheader');
  await expect(status).toContainText(/\d+\+? items?/);
  await expect(async () => {
    if ((await rows.count()) > 0) await rows.last().scrollIntoViewIfNeeded();
    const [, total, more] = (await status.textContent())?.match(/(\d+)(\+?) items?/) ?? [];
    expect(more).toBe('');
    await expect(rows).toHaveCount(Number(total), { timeout: 2_000 });
  }).toPass({ timeout: 60_000 });
}

async function fillNewProgram(page: Page, p: Program, programCode = code(p.n)) {
  await page.goto('/lightning/o/Program__c/new');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Program Name').fill(name(p.n));
  await dialog.getByLabel('Program Code').fill(programCode);
  await pick(dialog, 'Study Level', p.studyLevel);
  await pick(dialog, 'Faculty', p.faculty);
  await setActive(dialog, p.active);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  return dialog;
}

async function createProgram(page: Page, p: Program) {
  await fillNewProgram(page, p);
  // After Save, Lightning opens the record as /lightning/r/<id>/view or /lightning/r/Program__c/<id>/view.
  await page.waitForURL(/\/lightning\/r\/(Program__c\/)?\w{15,18}\/view/);
  await expect(page.getByRole('heading', { name: new RegExp(name(p.n)) }).first()).toBeVisible();
}

test.describe('#4 Program catalogue: Recruitment Officer', () => {
  test.beforeEach(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'recruitment-officer', 'Programs are maintained by the Recruitment Officer');
  });

  test('#4 AC1: Recruitment Officer creates a Program with code, study level, faculty and active', async ({ app, page }) => {
    await app.openObjectHome('Program__c');
    await expect(app.newButton()).toBeVisible();
    await createProgram(page, { n: 1, studyLevel: 'Postgraduate coursework', faculty: 'Health', active: true });
    await expect(page.getByText(code(1), { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Postgraduate coursework', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Health', { exact: true }).first()).toBeVisible();
    await expect(activeField(page)).toContainText('True');
  });

  test('#4 AC2: saving a duplicate Program Code shows a duplicate-value error', async ({ page }) => {
    await createProgram(page, { n: 2, studyLevel: 'Undergraduate', faculty: 'Business', active: true });
    const dialog = await fillNewProgram(page, { n: 3, studyLevel: 'Research', faculty: 'Education', active: true }, code(2));
    // The platform message (accepted in plan decision 4) names the field by API name: "Program_Code__c duplicates value".
    // One locator for the whole message, so the field name cannot match the form's own "Program Code" label.
    await expect(dialog.getByText(/duplicate value found: Program[ _]Code(__c)? duplicates value/i).first()).toBeVisible();
    await expect(page).not.toHaveURL(/\/lightning\/r\//);
  });

  test("#4 AC3: Recruitment Officer edits a Program's study level and active flag", async ({ page }) => {
    await createProgram(page, { n: 4, studyLevel: 'Undergraduate', faculty: 'Arts and Humanities', active: true });
    await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
    const dialog = page.getByRole('dialog');
    await pick(dialog, 'Study Level', 'Research');
    await setActive(dialog, false);
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText('Research', { exact: true }).first()).toBeVisible();
    await expect(activeField(page)).toContainText('False');
  });

  test('#4 AC3: Recruitment Officer cannot delete a Program (denial, TST-03)', async ({ page }) => {
    await createProgram(page, { n: 5, studyLevel: 'Undergraduate', faculty: 'Science and Engineering', active: true });
    await expect(page.getByRole('button', { name: 'Edit', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete', exact: true })).toHaveCount(0);
    const more = page.getByRole('button', { name: 'Show more actions' }).first();
    if (await more.isVisible()) {
      await more.click();
      await expect(page.getByRole('menuitem', { name: 'Delete' })).toHaveCount(0);
    }
  });

  test('#4 AC4: Programs tab opens from the Recruitment app and the Active Programs list shows only active programs', async ({ page }) => {
    await createProgram(page, { n: 6, studyLevel: 'Undergraduate', faculty: 'Business', active: true });
    await createProgram(page, { n: 7, studyLevel: 'Undergraduate', faculty: 'Business', active: false });

    await page.goto('/lightning/app/c__Recruitment');
    await page.getByRole('link', { name: 'Programs', exact: true }).first().click();
    await page.waitForURL(/\/lightning\/o\/Program__c\//);

    await page.goto('/lightning/o/Program__c/list?filterName=Active_Programs');
    await expect(page.getByText('Active Programs').first()).toBeVisible();
    await loadAllRows(page, 'Active Programs');
    await expect(page.getByRole('link', { name: name(6), exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: name(7), exact: true })).toHaveCount(0);
  });
});
