/**
 * Issue #20: the Lead list view "My open enquiries" is visible to the Recruitment Officer persona,
 * which gets it through its persona public group (AC1, AC3, SHR-03, SHR-04). The denial test for a persona
 * outside that group (TST-03, SHR-15) is in MyOpenEnquiriesListViewDenialTest. ListView is deployed
 * metadata, referenced by API name (TST-06).
 * The list view adds no Apex, so there is no bulk path to test (TST-03 bulk applies to trigger and batch paths).
 * Observed workaround (TST-11): in a check-only deploy, once a user without Lead access queries ListView
 * filtered on SobjectType = 'Lead', that filter returns no rows to any user for the rest of the run, across
 * test classes. Filtering on DeveloperName alone is not affected, so the query filters on DeveloperName and
 * keeps only Lead rows in Apex.
 */
@IsTest
private class MyOpenEnquiriesListViewTest {
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
    static void shouldShowListViewToRecruitmentOfficer() {
        List<ListView> views;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            views = visibleListViews();
            Test.stopTest();
        }
        Assert.areEqual(1, views.size(), 'The Recruitment Officer sees the list view through its persona public group');
        Assert.areEqual('Lead', views[0].SobjectType, 'The list view is on Lead');
        Assert.areEqual('My open enquiries', views[0].Name, 'The list view carries the label agreed in the story');
    }
}
