/**
 * Shared core test data factory (TST-05, 06 §3). build* methods return unsaved records; create* methods
 * insert them. Required fields and valid defaults live here, so a new validation rule needs one change.
 */
@IsTest
public class TestDataFactory {
    /**
     * Unsaved Programs (#4) with a unique code per record, Undergraduate, Science and Engineering, active.
     * codePrefix keeps codes unique across calls in one test (Program_Code__c is unique, max 20 chars).
     */
    public static List<Program__c> buildPrograms(Integer count, String codePrefix) {
        List<Program__c> result = new List<Program__c>();
        for (Integer i = 0; i < count; i++) {
            result.add(
                new Program__c(
                    Name = 'Test Program ' + codePrefix + i,
                    Program_Code__c = codePrefix + '-' + i,
                    Study_Level__c = 'Undergraduate',
                    Faculty__c = 'Science_Engineering',
                    Active__c = true
                )
            );
        }
        return result;
    }

    public static List<Program__c> createPrograms(Integer count, String codePrefix) {
        List<Program__c> programs = buildPrograms(count, codePrefix);
        // System mode on purpose (APX-22): setup data is created by the test runner, not a persona, and
        // the runner holds no FLS on Program fields (access is only through persona permission sets).
        Database.insert(programs, AccessLevel.SYSTEM_MODE);
        return programs;
    }

    /**
     * Unsaved Leads (#5) with the required fields only: a unique Last Name per record and a Company.
     * Tests set the fields they are about (enquiry details, source) themselves.
     */
    public static List<Lead> buildLeads(Integer count, String lastNamePrefix) {
        List<Lead> result = new List<Lead>();
        for (Integer i = 0; i < count; i++) {
            result.add(new Lead(LastName = lastNamePrefix + '-' + i, Company = 'Prospective student'));
        }
        return result;
    }
}
