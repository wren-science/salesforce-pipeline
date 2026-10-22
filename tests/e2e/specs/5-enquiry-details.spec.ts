import { test, expect } from '../support/evidence';
import type { Locator, Page } from '@playwright/test';
import { personaUserId, query, runApex } from '../support/org';

// Issue #5: enquiry details on Lead. Runs as the Recruitment Officer, the persona that captures enquiries and
// holds the four fields through its Recruitment_Officer permission set group (DES-01, TST-17).
// Data is synthetic and unique per run (PIPE-14): Leads are E2E-<runId>-…, Programs carry E2E-<runId>-… codes.
// The pipeline removes both after every run (config/test-data.json, PIPE-15).
// Setup (Programs, the AC3/AC4 Leads) runs as the pipeline's identity through anonymous Apex in SYSTEM_MODE:
// that identity holds no FLS on the new fields, which only the persona permission set grants.
const runId = Date.now().toString(36).toUpperCase();
const company = `E2E-${runId}`;
const leadName = (ac: string) => `E2E-${runId}-${ac}`;
const programPrefix = `E2E Program ${runId}`;
const activeProgram = `${programPrefix} Active`;
const inactiveProgram = `${programPrefix} Inactive`;

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

// Types into the Program of Interest lookup until the search returns the expected Program. New Programs reach
// the search index a few seconds after they are created, so retype until they are found.
async function searchPrograms(scope: Locator, text: string, expected: string) {
  const box = scope.getByRole('combobox', { name: 'Program of Interest' });
  const option = scope.getByRole('option', { name: new RegExp(expected) });
  await expect(async () => {
    await box.fill('');
    await box.fill(text);
    await expect(option.first()).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  return option.first();
}

// A field in view mode: the list item that holds the field's inline-edit button.
function field(page: Page, label: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Edit ${label}`, exact: true }) }).first();
}

async function expectEnquiryDetails(page: Page) {
  await expect(field(page, 'Study Level')).toContainText('Postgraduate coursework');
  await expect(field(page, 'Citizenship Status')).toContainText('International');
  await expect(field(page, 'Preferred Intake')).toContainText('2027 Trimester 1');
  await expect(field(page, 'Program of Interest')).toContainText(activeProgram);
}

// Seeds a Lead owned by the persona with all four enquiry details, through the API, and returns its Id.
function seedLead(ac: string, personaId: string): string {
  runApex(`
    Program__c program = [SELECT Id FROM Program__c WHERE Program_Code__c = 'E2E-${runId}-A'];
    Lead l = new Lead(
      LastName = '${leadName(ac)}', Company = '${company}', OwnerId = '${personaId}',
      Study_Level__c = 'Postgraduate_Coursework', Citizenship_Status__c = 'International',
      Preferred_Intake__c = '2027_T1', Program_of_Interest__c = program.Id
    );
    Database.insert(l, AccessLevel.SYSTEM_MODE);
  `);
  return query<{ Id: string }>(`SELECT Id FROM Lead WHERE LastName = '${leadName(ac)}'`)[0].Id;
}

async function openLeadInRecruitmentApp(page: Page, id: string) {
  // The Lead record page is the Recruitment app's default (plan decision 4), so open it from that app.
  await page.goto('/lightning/app/c__Recruitment');
  await page.goto(`/lightning/r/Lead/${id}/view`);
  await expect(page.getByRole('button', { name: 'Edit Study Level', exact: true }).first()).toBeVisible();
}

test.describe('#5 Enquiry details on Lead: Recruitment Officer', () => {
  let personaId: string;

  test.beforeAll(async ({}, testInfo) => {
    test.skip(testInfo.project.name !== 'recruitment-officer', 'Enquiries are captured by the Recruitment Officer');
    personaId = personaUserId(testInfo.project.name);
    runApex(`
      Database.insert(new List<Program__c>{
        new Program__c(Name = '${activeProgram}', Program_Code__c = 'E2E-${runId}-A', Study_Level__c = 'Postgraduate_Coursework',
          Faculty__c = 'Health', Active__c = true),
        new Program__c(Name = '${inactiveProgram}', Program_Code__c = 'E2E-${runId}-I', Study_Level__c = 'Postgraduate_Coursework',
          Faculty__c = 'Health', Active__c = false)
      }, AccessLevel.SYSTEM_MODE);
    `);
  });

  test('#5 AC1: Recruitment Officer records study level, citizenship, preferred intake and program on a new Lead', async ({ app, page }) => {
    await app.openObjectHome('Lead');
    await app.newButton().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Last Name' }).fill(leadName('AC1'));
    await dialog.getByRole('textbox', { name: 'Company' }).fill(company);
    await pick(dialog, 'Study Level', 'Postgraduate coursework');
    await pick(dialog, 'Citizenship Status', 'International');
    await pick(dialog, 'Preferred Intake', '2027 Trimester 1');
    await (await searchPrograms(dialog, activeProgram, activeProgram)).click();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();

    await page.waitForURL(/\/lightning\/r\/(Lead\/)?\w{15,18}\/view/);
    await expect(page.getByRole('heading', { name: new RegExp(leadName('AC1')) }).first()).toBeVisible();
    await expectEnquiryDetails(page);
  });

  test('#5 AC2: Program of Interest offers active programs and not inactive ones', async ({ app, page }) => {
    await app.openObjectHome('Lead');
    await app.newButton().click();
    const dialog = page.getByRole('dialog');
    // Search for what both seeded Programs share: only the active one may be offered.
    await searchPrograms(dialog, programPrefix, activeProgram);
    await expect(dialog.getByRole('option', { name: new RegExp(inactiveProgram) })).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  });

  test('#5 AC3: Lead page shows the enquiry details section to the Recruitment Officer', async ({ page }) => {
    await openLeadInRecruitmentApp(page, seedLead('AC3', personaId));
    const section = page.getByRole('button', { name: 'Enquiry details' }).or(page.getByRole('heading', { name: 'Enquiry details' }));
    await expect(section.first()).toBeVisible();
    for (const label of ['Study Level', 'Citizenship Status', 'Preferred Intake', 'Program of Interest']) {
      await expect(page.getByRole('button', { name: `Edit ${label}`, exact: true }).first()).toBeVisible();
    }
  });

  test('#5 AC4: a Lead created through the API with all four fields shows them on the Lead page', async ({ page }) => {
    // The API call is made by the pipeline's identity, not the persona: the harness has no persona API session.
    // The persona-level proof of AC4 is LeadEnquiryDetailsTest.shouldCreate200LeadsWithEnquiryDetailsInOneTransaction.
    await openLeadInRecruitmentApp(page, seedLead('AC4', personaId));
    await expectEnquiryDetails(page);
  });
});
