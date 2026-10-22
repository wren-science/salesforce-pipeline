import { test, expect } from '../support/evidence';
import { personaUserId, query, retrieveMetadata, runApex } from './support/org';

// Issue #20: Recruitment Officers get a "My open enquiries" Lead list view, showing only the
// unconverted Leads they own, shared only with the persona public group (DES-02, SHR-03, SHR-04).
// Runs in the recruitment-officer project. Leads are synthetic, seeded through sf as setup and
// removed afterwards (PIPE-15).
const LIST_VIEW = 'My open enquiries';
const LIST_VIEW_API = 'My_open_enquiries';
const PERSONA_GROUP = 'Persona_Recruitment_Officer';
// AC2 wording says "Status"; Lightning renders the LEAD.STATUS column as "Lead Status".
const COLUMNS = ['Name', 'Company', 'Lead Source', 'Lead Source Detail', 'Lead Status', 'Created Date'];

const marker = `PW20-${Date.now().toString(36)}`;
const mine = `Mine ${marker}`;
const otherOwner = `Other ${marker}`;
const converted = `Converted ${marker}`;

test.describe('#20 My open enquiries list view', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({}, testInfo) => {
    const personaId = personaUserId(testInfo.project.name);
    // Lead_Source_Detail__c is left blank: the CLI user has no FLS on it (only persona permission sets grant
    // it), and anonymous Apex enforces FLS. AC2 asserts the column, not a value in it.
    // The conversion gives its new Account and Contact to the CLI user: NPSP adds Account record types, and the
    // persona has none (it cannot create Accounts), so converting with the persona as owner fails with
    // UNAVAILABLE_RECORDTYPE_EXCEPTION. The converted Lead itself stays the persona's, which the seed asserts.
    runApex(`
      Id personaId = '${personaId}';
      List<Lead> leads = new List<Lead>{
        new Lead(LastName = '${mine}', Company = '${marker}', LeadSource = 'Web', OwnerId = personaId),
        new Lead(LastName = '${otherOwner}', Company = '${marker}', LeadSource = 'Web', OwnerId = UserInfo.getUserId()),
        new Lead(LastName = '${converted}', Company = '${marker}', LeadSource = 'Web', OwnerId = personaId)
      };
      insert leads;
      Database.LeadConvert lc = new Database.LeadConvert();
      lc.setLeadId(leads[2].Id);
      lc.setConvertedStatus([SELECT ApiName FROM LeadStatus WHERE IsConverted = true LIMIT 1].ApiName);
      lc.setDoNotCreateOpportunity(true);
      lc.setOwnerId(UserInfo.getUserId());
      Database.convertLead(lc);
      Lead convertedLead = [SELECT OwnerId, IsConverted FROM Lead WHERE Id = :leads[2].Id];
      System.assert(convertedLead.IsConverted && convertedLead.OwnerId == personaId, 'Converted Lead must stay the persona\\'s');
    `);
  });

  test.afterAll(async () => {
    // Remove what the conversion actually created (in QA, NPSP may name the Account differently), and
    // fail loudly if anything is left behind in a shared org (PIPE-15).
    runApex(`
      List<Lead> leads = [SELECT Id, ConvertedContactId, ConvertedAccountId FROM Lead WHERE Company = '${marker}'];
      Set<Id> contactIds = new Set<Id>();
      Set<Id> accountIds = new Set<Id>();
      for (Lead l : leads) {
        if (l.ConvertedContactId != null) contactIds.add(l.ConvertedContactId);
        if (l.ConvertedAccountId != null) accountIds.add(l.ConvertedAccountId);
      }
      delete [SELECT Id FROM Contact WHERE Id IN :contactIds OR AccountId IN :accountIds];
      delete [SELECT Id FROM Account WHERE Id IN :accountIds];
      delete [SELECT Id FROM Lead WHERE Id IN :leads];
    `);
  });

  test('#20 AC1: Leads tab offers the "My open enquiries" list view', async ({ app, page }) => {
    await app.openObjectHome('Lead');
    await page.getByRole('button', { name: /Select a List View/ }).click();
    const option = page.getByRole('option', { name: LIST_VIEW });
    await expect(option).toBeVisible();
    await option.click();
    await expect(page.getByRole('heading', { name: new RegExp(LIST_VIEW) })).toBeVisible();
    await expect(page.getByRole('link', { name: mine, exact: true })).toBeVisible();
  });

  test('#20 AC2: shows only my unconverted Leads with the agreed columns', async ({ page }) => {
    await page.goto(`/lightning/o/Lead/list?filterName=${LIST_VIEW_API}`);
    await expect(page.getByRole('heading', { name: new RegExp(LIST_VIEW) })).toBeVisible();

    // My own open Lead is listed; wait for it before checking what is absent.
    await expect(page.getByRole('link', { name: mine, exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: otherOwner, exact: true })).toHaveCount(0);
    await expect(page.getByRole('link', { name: converted, exact: true })).toHaveCount(0);

    // Data columns, in order. Row-number, selection and row-action headers are not data columns.
    const headers = await page
      .getByRole('columnheader')
      .evaluateAll((ths) => ths.map((th) => (th.getAttribute('aria-label') || th.getAttribute('title') || (th.textContent ?? '')).trim()));
    const dataColumns = headers.filter((h) => h && !/item number|row number|select|action/i.test(h)).map((h) => (h === 'Status' ? 'Lead Status' : h));
    expect(dataColumns).toEqual(COLUMNS);
  });

  test('#20 AC3: list view is shared only with the persona public group', async ({ page }, testInfo) => {
    // The deployed list view's sharing: exactly one group, the persona's; not all users, roles or users.
    const xml = retrieveMetadata(`ListView:Lead.${LIST_VIEW_API}`);
    const view = xml.match(new RegExp(`<listViews>(?:(?!</listViews>)[\\s\\S])*<fullName>${LIST_VIEW_API}</fullName>[\\s\\S]*?</listViews>`))?.[0] ?? '';
    expect(view, 'list view retrieved from the org').not.toEqual('');
    const sharedTo = view.match(/<sharedTo>([\s\S]*?)<\/sharedTo>/)?.[1] ?? '';
    const grants = [...sharedTo.matchAll(/<(\w+)>([^<]*)<\/\1>/g)].map((m) => `${m[1]}:${m[2]}`);
    expect(grants).toEqual([`group:${PERSONA_GROUP}`]);
    expect(sharedTo).not.toMatch(/allInternalUsers|allPartnerUsers|role|roleAndSubordinates|<user>/i);

    // The persona sees the view because it is a member of that group (PIPE-13).
    const personaId = personaUserId(testInfo.project.name);
    const membership = query(
      `SELECT Id FROM GroupMember WHERE Group.DeveloperName = '${PERSONA_GROUP}' AND Group.Type = 'Regular' AND UserOrGroupId = '${personaId}'`,
    );
    expect(membership).toHaveLength(1);
    await page.goto(`/lightning/o/Lead/list?filterName=${LIST_VIEW_API}`);
    await expect(page.getByRole('heading', { name: new RegExp(LIST_VIEW) })).toBeVisible();
  });
});
