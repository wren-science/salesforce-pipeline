/**
 * Issue #20: the Lead list view "My open enquiries" is hidden from a persona outside the Recruitment
 * Officer persona public group (AC3, TST-03, SHR-15). ListView is deployed metadata, referenced by API
 * name (TST-06).
 * Scope: Minimum Access has no Lead access, so this proves object-level denial only. The group-level share
 * (sharedTo is only Persona_Recruitment_Officer) is proven by Playwright #20 AC3. Add a group-level denial
 * here when config/personas.json gains a second persona that can read Leads (TST-18).
 * Observed workaround (TST-11): in a check-only deploy, a ListView query filtered on SobjectType = 'Lead'
 * by a user without Lead access makes that filter return no rows to any user for the rest of the run,
 * which would also let this denial pass vacuously. Filtering on DeveloperName alone is not affected, so
 * the query filters on DeveloperName and keeps only Lead rows in Apex.
 */
@IsTest
private class MyOpenEnquiriesListViewDenialTest {
    private static final String LIST_VIEW_NAME = 'My_open_enquiries';

    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
    }

    private static List<ListView> visibleListViews() {
        List<ListView> leadViews = new List<ListView>();
        for (ListView v : [SELECT Id, Name, DeveloperName, SobjectType FROM ListView WHERE DeveloperName = :LIST_VIEW_NAME WITH USER_MODE]) {
            if (v.SobjectType == 'Lead') {
                leadViews.add(v);
            }
        }
        return leadViews;
    }

    @IsTest
    static void shouldHideListViewFromPersonaOutsideGroup() {
        List<ListView> views = new List<ListView>();
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            Test.startTest();
            try {
                views = visibleListViews();
            } catch (System.QueryException e) {
                // A user-mode query refused for lack of Lead access is also a denial.
                views = new List<ListView>();
            }
            Test.stopTest();
        }
        Assert.isTrue(views.isEmpty(), 'A persona outside Persona_Recruitment_Officer must not see the list view');
    }
}
