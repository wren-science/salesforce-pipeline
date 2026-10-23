import { test, expect, AppNav } from '../support/evidence';
import type { Locator, Page } from '@playwright/test';
import { createRecordAs, restAs, runApex } from '../support/org';

// Issue #6: prevent duplicate prospective students. Runs as the Recruitment Officer, who creates enquiries (Leads)
// and holds Lead Email and Mobile through its Recruitment_Officer permission set group (DES-01, TST-17).
// The standard Lead duplicate rule Prospective_Student_Lead_Duplicate alerts on create (Allow + Alert) when a new
// Lead has an existing Lead's or Contact's email, or an existing Lead's first name, last name and mobile.
// Data is synthetic and unique per run (PIPE-14): Leads and Contacts are E2E-<runId>-…, emails are
// e2e-<runId>-…@example.invalid and mobiles are from the range reserved for fiction. The pipeline removes Leads,
// Contacts and NPSP's "E2E-… Household" Accounts after every run (config/test-data.json, PIPE-15).
// Existing Leads are seeded through the REST API as the persona (createRecordAs); the existing Contact by the
// data identity (SF_DATA_ORG), because the officer cannot create Contacts.
const runId = Date.now().toString(36).toUpperCase();
const company = `E2E-${runId}`;
const lastName = (ac: string) => `E2E-${runId}-${ac}`;
const email = (ac: string) => `e2e-${runId.toLowerCase()}-${ac.toLowerCase()}@example.invalid`;
const EXISTING_MOBILE = '0491 570 156';
const NEW_MOBILE = '0491 570 158';
const DUPLICATE_RULE = 'Prospective_Student_Lead_Duplicate';
// The plan's alert text, which tells this rule's alert apart from any other active Lead rule in the org.
const ALERT_TEXT = 'This person may already be in the system. Check the matching records before you contact them.';

// The New Lead form takes its fields from the Recruitment app's Lead pages, so open it from that app.
async function openNewLeadInRecruitmentApp(app: AppNav, page: Page) {
  await page.goto('/lightning/app/c__Recruitment');
  await app.openObjectHome('Lead');
  await app.newButton().click();
  return page.getByRole('dialog');
}

async function fillNewLead(dialog: Locator, v: { first?: string; last: string; email?: string; mobile?: string }) {
  if (v.first) await dialog.getByRole('textbox', { name: 'First Name' }).fill(v.first);
  await dialog.getByRole('textbox', { name: 'Last Name' }).fill(v.last);
  await dialog.getByRole('textbox', { name: 'Company' }).fill(company);
  if (v.email) await dialog.getByRole('textbox', { name: 'Email' }).fill(v.email);
  if (v.mobile) await dialog.getByRole('textbox', { name: 'Mobile' }).fill(v.mobile);
}

// Saves the New Lead form and expects the duplicate alert in the form, then opens "View Duplicates" and expects
// the matching record to be listed by name. Lightning Experience shows the platform's own "Similar Records Exist"
// alert, not a duplicate rule's alert text; the rule's text (ALERT_TEXT) reaches API and Apex callers, and is
// asserted there (AC4 below, LeadDuplicateRuleTest).
async function expectDuplicateAlertListing(page: Page, dialog: Locator, matchName: string) {
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Similar Records Exist' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Similar Records Exist' })).toContainText('looks like an existing record');
  const viewDuplicates = dialog.getByRole('link', { name: /View Duplicates/i }).or(dialog.getByRole('button', { name: /View Duplicates/i }));
  await viewDuplicates.first().click();
  const listed = page.getByRole('dialog').getByRole('link', { name: matchName, exact: true }).or(page.getByRole('dialog').getByText(matchName, { exact: true }));
  await expect(listed.first()).toBeVisible();
}

test.describe('#6 Duplicate enquiries: Recruitment Officer', () => {
  let persona: string;

  test.beforeAll(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'recruitment-officer', 'Enquiries are created by the Recruitment Officer');
    persona = testInfo.project.name;
  });

  test("#6 AC1: a new Lead with an existing Lead's email shows the duplicate alert listing that Lead", async ({ app, page }) => {
    const existing = lastName('AC1-Existing');
    createRecordAs(persona, 'Lead', { FirstName: 'Mai', LastName: existing, Company: company, Email: email('AC1-lead') });

    const dialog = await openNewLeadInRecruitmentApp(app, page);
    await fillNewLead(dialog, { first: 'Hoa', last: lastName('AC1-New'), email: email('AC1-lead') });
    await expectDuplicateAlertListing(page, dialog, `Mai ${existing}`);
  });

  test("#6 AC1: a new Lead with an existing Contact's email shows the duplicate alert listing that Contact", async ({ app, page }) => {
    const existing = lastName('AC1-Contact');
    // Setup as the data identity: the officer has read but not create on Contact. Values are run-generated.
    runApex(`insert new Contact(FirstName = 'Tuan', LastName = '${existing}', Email = '${email('AC1-contact')}');`);

    const dialog = await openNewLeadInRecruitmentApp(app, page);
    await fillNewLead(dialog, { first: 'Hoa', last: lastName('AC1-FromContact'), email: email('AC1-contact') });
    // The Contact is not the officer's; Bypass sharing rules (plan decision 2) still lists the match.
    await expectDuplicateAlertListing(page, dialog, `Tuan ${existing}`);
  });

  test('#6 AC2: a new Lead with the same first name, last name and mobile as an existing Lead shows the alert', async ({ app, page }) => {
    const existing = lastName('AC2');
    createRecordAs(persona, 'Lead', { FirstName: 'Mai', LastName: existing, Company: company, Email: email('AC2-existing'), MobilePhone: EXISTING_MOBILE });

    const dialog = await openNewLeadInRecruitmentApp(app, page);
    // Same name and mobile, different email: only the name-and-mobile match applies.
    await fillNewLead(dialog, { first: 'Mai', last: existing, email: email('AC2-new'), mobile: EXISTING_MOBILE });
    await expectDuplicateAlertListing(page, dialog, `Mai ${existing}`);
  });

  test('#6 AC3: a new Lead with a different email and mobile saves with no duplicate alert', async ({ app, page }) => {
    const name = lastName('AC3');
    const dialog = await openNewLeadInRecruitmentApp(app, page);
    await fillNewLead(dialog, { first: 'Linh', last: name, email: email('AC3'), mobile: NEW_MOBILE });
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    // An alert would keep the form open; reaching the saved record page proves the save went straight through.
    await page.waitForURL(/\/lightning\/r\/(Lead\/)?\w{15,18}\/view/);
    await expect(page.getByRole('heading', { name: new RegExp(name) }).first()).toBeVisible();
    await expect(page.getByText(ALERT_TEXT)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Similar Records Exist' })).toHaveCount(0);
  });

  test('#6 AC4: a Lead created through the REST API with an existing email is reported as a duplicate', async ({ page }) => {
    const existingId = createRecordAs(persona, 'Lead', { FirstName: 'Mai', LastName: lastName('AC4-Existing'), Company: company, Email: email('AC4') });
    const lead = { FirstName: 'Hoa', LastName: lastName('AC4-Api'), Company: company, Email: email('AC4') };

    // Without the duplicate rule header the API refuses the duplicate and lists the existing Lead.
    const refused = await restAs(persona, 'POST', 'sobjects/Lead', lead);
    expect(refused.status).toBe(400);
    const error = refused.body[0];
    expect(error.errorCode).toBe('DUPLICATES_DETECTED');
    expect(error.duplicateResult.duplicateRule).toBe(DUPLICATE_RULE);
    // API callers get the rule's own alert text (Lightning shows the platform's standard one instead).
    expect(error.message).toBe(ALERT_TEXT);
    const matched = error.duplicateResult.matchResults.flatMap((m: any) => m.matchRecords.map((r: any) => r.record.Id));
    expect(matched).toContain(existingId);

    // With allowSave the caller saves it on purpose (plan decision 1: integrations send the header).
    const allowed = await restAs(persona, 'POST', 'sobjects/Lead', lead, { 'Sforce-Duplicate-Rule-Header': 'allowSave=true' });
    expect(allowed.status).toBe(201);
    await page.goto('/lightning/app/c__Recruitment');
    await page.goto(`/lightning/r/Lead/${allowed.body.id}/view`);
    await expect(page.getByRole('heading', { name: new RegExp(lead.LastName) }).first()).toBeVisible();
  });
});
