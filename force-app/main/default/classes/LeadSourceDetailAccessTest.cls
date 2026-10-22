/**
 * Issue #1 (pipeline smoke test): Lead.Lead_Source_Detail__c is usable by the Recruitment Officer
 * persona and refused to a persona without access (TST-03, TST-16, TST-17). DML runs in user mode.
 */
@IsTest
private class LeadSourceDetailAccessTest {
    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
    }

    @IsTest
    static void shouldLetRecruitmentOfficerCreateLeadWithSourceDetail() {
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Lead l = new Lead(LastName = 'Nguyen', Company = 'Prospective student', Lead_Source_Detail__c = 'Open day, October');
            Test.startTest();
            Database.insert(l, AccessLevel.USER_MODE);
            Test.stopTest();
            Lead saved = [SELECT Lead_Source_Detail__c FROM Lead WHERE Id = :l.Id WITH USER_MODE];
            Assert.areEqual('Open day, October', saved.Lead_Source_Detail__c, 'The persona reads back what it wrote');
        }
    }

    @IsTest
    static void shouldRefuseLeadCreationToMinimumAccessPersona() {
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            Lead l = new Lead(LastName = 'Nguyen', Company = 'Prospective student', Lead_Source_Detail__c = 'Open day');
            Boolean refused = false;
            try {
                Database.insert(l, AccessLevel.USER_MODE);
            } catch (System.SecurityException e) {
                refused = true;
            } catch (System.NoAccessException e) {
                refused = true;
            } catch (System.DmlException e) {
                refused = true;
            }
            Assert.isTrue(refused, 'A persona with no Lead access must not create Leads');
        }
    }
}
