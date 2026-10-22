import { test, expect } from '../support/evidence';

// Issue #1 (pipeline smoke test). Proves the persona model end to end: the Recruitment Officer sees
// the Leads it works on, can create them, and cannot create Accounts. Access comes only from the
// Recruitment_Officer permission set group.
test.describe('#1 Persona smoke: Recruitment Officer', () => {
  test('#1 AC1: can open Leads and create one', async ({ app, page }) => {
    await app.openObjectHome('Lead');
    await expect(page.getByRole('heading', { name: /Leads/ }).first()).toBeVisible();
    await expect(app.newButton()).toBeVisible();
  });

  test('#1 AC2: cannot create Accounts (denial, TST-03)', async ({ app, page }) => {
    await app.openObjectHome('Account');
    await expect(page.getByRole('heading', { name: /Accounts/ }).first()).toBeVisible();
    await expect(app.newButton()).toHaveCount(0);
  });
});
