/**
 * Issue #20: the Lead list view "My open enquiries" is visible to the Recruitment Officer persona,
 * which gets it through its persona public group (AC1, AC3, SHR-03, SHR-04), and hidden from a persona
 * outside that group (TST-03, SHR-15). ListView is deployed metadata, referenced by API name (TST-06).
 * The list view adds no Apex, so there is no bulk path to test (TST-03 bulk applies to trigger and batch paths).
 * The denial test is in MyOpenEnquiriesListViewDenialTest: once a user without Lead access queries Lead
 * list views, the platform returns none to any user for the rest of that test class, so the two tests
 * must not share a class (TST-11).
 */
@IsTest
private class MyOpenEnquiriesListViewTest {
    private static final String LIST_VIEW_NAME = 'My_open_enquiries';

    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
    }

    private static List<ListView> visibleListViews() {
        return [SELECT Id, Name, DeveloperName FROM ListView WHERE SobjectType = 'Lead' AND DeveloperName = :LIST_VIEW_NAME WITH USER_MODE];
    }

    @IsTest
    static void shouldShowListViewToRecruitmentOfficer() {
        List<ListView> views;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            views = visibleListViews();
            Test.stopTest();
        }
        Assert.areEqual(1, views.size(), 'The Recruitment Officer sees the list view through its persona public group');
        Assert.areEqual('My open enquiries', views[0].Name, 'The list view carries the label agreed in the story');
    }
}
