/**
 * Issue #20: the Lead list view "My open enquiries" is hidden from a persona outside the Recruitment
 * Officer persona public group (AC3, TST-03, SHR-15). ListView is deployed metadata, referenced by API
 * name (TST-06).
 * Kept apart from MyOpenEnquiriesListViewTest: once a user without Lead access queries Lead list views,
 * the platform returns none to any user for the rest of that test class, which would make the positive
 * test depend on run order (TST-11).
 */
@IsTest
private class MyOpenEnquiriesListViewDenialTest {
    private static final String LIST_VIEW_NAME = 'My_open_enquiries';

    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
    }

    private static List<ListView> visibleListViews() {
        return [SELECT Id, Name, DeveloperName FROM ListView WHERE SobjectType = 'Lead' AND DeveloperName = :LIST_VIEW_NAME WITH USER_MODE];
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
