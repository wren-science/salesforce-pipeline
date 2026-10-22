/**
 * Issue #5: enquiry details on Lead (Study Level, Citizenship Status, Preferred Intake, Program of Interest).
 * The build is declarative (DES-02), so this class tests the fields, their constraints and the Recruitment
 * Officer's access as that persona (TST-16, TST-17, 06 §7). DML and SOQL under test run in user mode so
 * CRUD/FLS is exercised (APX-21); a user-mode insert takes the same CRUD/FLS path as an API insert (AC4).
 * Covers positive, negative, bulk and denial paths (TST-03, SHR-15). Picklist codes used here are guarded
 * by the describe tests below (APX-58).
 */
@IsTest
private class LeadEnquiryDetailsTest {
    private static final List<String> ENQUIRY_FIELDS = new List<String>{
        'Study_Level__c',
        'Citizenship_Status__c',
        'Preferred_Intake__c',
        'Program_of_Interest__c'
    };

    @TestSetup
    static void setup() {
        TestPersonaFactory.createAll(TestPersonas.all());
        TestDataFactory.createPrograms(1, 'ACTIVE');
    }

    // AC1: Lead has Study Level, Citizenship Status, Preferred Intake and Program of Interest.

    @IsTest
    static void shouldLetRecruitmentOfficerCreateLeadWithEnquiryDetails() {
        Id programId = programId('ACTIVE-0');
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'Nguyen')[0], programId);
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            Database.insert(l, AccessLevel.USER_MODE);
            Test.stopTest();
            Lead saved = [
                SELECT Study_Level__c, Citizenship_Status__c, Preferred_Intake__c, Program_of_Interest__c
                FROM Lead
                WHERE Id = :l.Id
                WITH USER_MODE
            ];
            Assert.areEqual('Postgraduate_Coursework', saved.Study_Level__c, 'Study Level is saved');
            Assert.areEqual('International', saved.Citizenship_Status__c, 'Citizenship Status is saved');
            Assert.areEqual('2027_T1', saved.Preferred_Intake__c, 'Preferred Intake is saved');
            Assert.areEqual(programId, saved.Program_of_Interest__c, 'Program of Interest is saved');
        }
    }

    @IsTest
    static void shouldOfferExactlyTheStudyLevelsOfferedOnPrograms() {
        Schema.DescribeFieldResult leadField;
        Schema.DescribeFieldResult programField;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            leadField = Lead.Study_Level__c.getDescribe();
            programField = Program__c.Study_Level__c.getDescribe();
        }
        Assert.isTrue(leadField.isRestrictedPicklist(), 'Study Level is a restricted picklist (DM-08)');
        // DM-08 SHOULD deviation (plan): a local value set kept equal to Program's by this test.
        Assert.areEqual(
            activeValues(programField),
            activeValues(leadField),
            'Lead Study Level offers exactly the codes and labels of Program Study Level'
        );
        Assert.areEqual(
            new Map<String, String>{
                'Undergraduate' => 'Undergraduate',
                'Postgraduate_Coursework' => 'Postgraduate coursework',
                'Research' => 'Research'
            },
            activeValues(leadField),
            'Study Level offers Undergraduate, Postgraduate coursework and Research'
        );
    }

    @IsTest
    static void shouldOfferDomesticAndInternationalCitizenshipOnly() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Lead.Citizenship_Status__c.getDescribe();
        }
        Assert.isTrue(field.isRestrictedPicklist(), 'Citizenship Status is a restricted picklist (DM-08)');
        Assert.areEqual(
            new Map<String, String>{ 'Domestic' => 'Domestic', 'International' => 'International' },
            activeValues(field),
            'Citizenship Status offers Domestic and International only'
        );
    }

    @IsTest
    static void shouldOfferTheAgreedPreferredIntakes() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Lead.Preferred_Intake__c.getDescribe();
        }
        Assert.isTrue(field.isRestrictedPicklist(), 'Preferred Intake is a restricted picklist (DM-08)');
        Assert.areEqual(
            new Map<String, String>{
                '2027_T1' => '2027 Trimester 1',
                '2027_T2' => '2027 Trimester 2',
                '2027_T3' => '2027 Trimester 3',
                '2028_T1' => '2028 Trimester 1',
                '2028_T2' => '2028 Trimester 2',
                '2028_T3' => '2028 Trimester 3'
            },
            activeValues(field),
            'Preferred Intake offers the six intakes agreed in plan decision 2'
        );
    }

    @IsTest
    static void shouldMakeProgramOfInterestAnOptionalLookupToProgram() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Lead.Program_of_Interest__c.getDescribe();
        }
        Assert.areEqual(Schema.DisplayType.REFERENCE, field.getType(), 'Program of Interest is a lookup');
        Assert.areEqual(new List<Schema.SObjectType>{ Program__c.SObjectType }, field.getReferenceTo(), 'It looks up to Program');
        Assert.isTrue(field.isNillable(), 'Program of Interest is not required');
        Assert.isFalse(field.isCascadeDelete(), 'Deleting a Program does not delete its Leads');
        Assert.isFalse(field.isRestrictedDelete(), 'Deleting a Program clears the lookup (SetNull)');
    }

    @IsTest
    static void shouldRejectUnknownCitizenshipStatus() {
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'BadCitizenship')[0], programId('ACTIVE-0'));
        l.Citizenship_Status__c = 'Unknown';
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            try {
                Database.insert(l, AccessLevel.USER_MODE);
                Assert.fail('A Citizenship Status outside the list must not save');
            } catch (System.DmlException e) {
                Assert.areEqual(StatusCode.INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST, e.getDmlType(0), 'Refused as a restricted picklist value: ' + e.getDmlMessage(0));
            }
            Test.stopTest();
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE LastName = 'BadCitizenship-0'], 'No Lead was saved');
    }

    @IsTest
    static void shouldRejectAnIntakeOutsideTheAgreedList() {
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'BadIntake')[0], programId('ACTIVE-0'));
        l.Preferred_Intake__c = '2026_T1';
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            try {
                Database.insert(l, AccessLevel.USER_MODE);
                Assert.fail('A Preferred Intake outside the list must not save');
            } catch (System.DmlException e) {
                Assert.areEqual(StatusCode.INVALID_OR_NULL_FOR_RESTRICTED_PICKLIST, e.getDmlType(0), 'Refused as a restricted picklist value: ' + e.getDmlMessage(0));
            }
            Test.stopTest();
        }
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE LastName = 'BadIntake-0'], 'No Lead was saved');
    }

    // AC2: Program of Interest only offers active programs. The filter is optional (plan decision 6): the
    // lookup offers active programs only, which the Playwright AC2 test proves, but saving is not blocked.

    @IsTest
    static void shouldFilterProgramOfInterestWithAnOptionalLookupFilter() {
        Schema.DescribeFieldResult field;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            field = Lead.Program_of_Interest__c.getDescribe();
        }
        Schema.FilteredLookupInfo filter = field.getFilteredLookupInfo();
        Assert.isNotNull(filter, 'Program of Interest has a lookup filter (active programs only)');
        Assert.isTrue(filter.isOptionalFilter(), 'The filter is optional, so a deactivated program does not block saves');
        Assert.isFalse(filter.isDependent(), 'The filter depends on the Program only, not on other Lead fields');
    }

    @IsTest
    static void shouldAcceptActiveProgramOfInterest() {
        Id programId = programId('ACTIVE-0');
        Lead l = TestDataFactory.buildLeads(1, 'ActiveProgram')[0];
        l.Program_of_Interest__c = programId;
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            Database.insert(l, AccessLevel.USER_MODE);
            Test.stopTest();
            Assert.areEqual(
                programId,
                [SELECT Program_of_Interest__c FROM Lead WHERE Id = :l.Id WITH USER_MODE].Program_of_Interest__c,
                'The active Program is saved as the Program of Interest'
            );
        }
    }

    @IsTest
    static void shouldKeepLeadEditableAfterItsProgramIsDeactivated() {
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'Deactivated')[0], programId('ACTIVE-0'));
        User officer = TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER);
        System.runAs(officer) {
            Database.insert(l, AccessLevel.USER_MODE);
        }
        Program__c program = new Program__c(Id = l.Program_of_Interest__c, Active__c = false);
        // System mode on purpose (APX-22): setup step, the program is deactivated by its maintainer.
        Database.update(program, AccessLevel.SYSTEM_MODE);
        System.runAs(officer) {
            Lead edit = new Lead(Id = l.Id, Citizenship_Status__c = 'Domestic');
            Test.startTest();
            Database.update(edit, AccessLevel.USER_MODE);
            Test.stopTest();
            Lead saved = [SELECT Citizenship_Status__c, Program_of_Interest__c FROM Lead WHERE Id = :l.Id WITH USER_MODE];
            Assert.areEqual('Domestic', saved.Citizenship_Status__c, 'The edit is saved (plan decision 6)');
            Assert.areEqual(program.Id, saved.Program_of_Interest__c, 'The deactivated Program stays on the Lead');
        }
    }

    // AC3: the fields appear on the Lead page for recruitment users. Access comes from the persona permission
    // set; the page itself is proved by the Playwright AC3 test.

    @IsTest
    static void shouldGrantEnquiryFieldsThroughPermissionSetNotProfile() {
        Map<String, Boolean> accessibleByField = new Map<String, Boolean>();
        Map<String, Boolean> updateableByField = new Map<String, Boolean>();
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            // Field describes are evaluated for the current user, so read them inside runAs.
            Map<String, Schema.SObjectField> fields = Lead.SObjectType.getDescribe(SObjectDescribeOptions.DEFERRED).fields.getMap();
            for (String f : ENQUIRY_FIELDS) {
                Schema.DescribeFieldResult d = fields.get(f).getDescribe();
                accessibleByField.put(f, d.isAccessible());
                updateableByField.put(f, d.isUpdateable());
            }
        }
        for (String f : ENQUIRY_FIELDS) {
            Assert.isTrue(accessibleByField.get(f), 'Persona can read ' + f);
            Assert.isTrue(updateableByField.get(f), 'Persona can edit ' + f);
        }

        List<String> qualified = new List<String>();
        for (String f : ENQUIRY_FIELDS) {
            qualified.add('Lead.' + f);
        }
        List<FieldPermissions> fromPermissionSet = [
            SELECT Field, PermissionsRead, PermissionsEdit
            FROM FieldPermissions
            WHERE SobjectType = 'Lead' AND Field IN :qualified AND Parent.Name = 'Persona_Recruitment_Officer'
        ];
        Assert.areEqual(4, fromPermissionSet.size(), 'Persona_Recruitment_Officer grants all four enquiry fields');
        for (FieldPermissions fp : fromPermissionSet) {
            Assert.isTrue(fp.PermissionsRead && fp.PermissionsEdit, 'Permission set grants Read and Edit on ' + fp.Field);
        }
        Assert.areEqual(
            0,
            [SELECT COUNT() FROM FieldPermissions WHERE Field IN :qualified AND Parent.IsOwnedByProfile = TRUE AND Parent.Profile.Name = 'Persona Base'],
            'The Persona Base profile grants no enquiry field (06 §6.1)'
        );
    }

    // AC4: Leads created through the API can set all four fields. The caller is a Recruitment Officer using an
    // API client (plan decision 1); a user-mode insert enforces the same CRUD and FLS as the API.

    @IsTest
    static void shouldCreate200LeadsWithEnquiryDetailsInOneTransaction() {
        Id programId = programId('ACTIVE-0');
        List<Lead> leads = TestDataFactory.buildLeads(200, 'BULK');
        for (Lead l : leads) {
            withEnquiryDetails(l, programId);
        }
        System.runAs(TestPersonaFactory.get(TestPersonas.RECRUITMENT_OFFICER)) {
            Test.startTest();
            List<Database.SaveResult> results = Database.insert(leads, true, AccessLevel.USER_MODE);
            Test.stopTest();
            Assert.areEqual(200, results.size(), 'All 200 Leads are inserted');
            List<Lead> saved = [
                SELECT Study_Level__c, Citizenship_Status__c, Preferred_Intake__c, Program_of_Interest__c
                FROM Lead
                WHERE LastName LIKE 'BULK-%'
                WITH USER_MODE
            ];
            Assert.areEqual(200, saved.size(), 'All 200 Leads are saved and visible to the persona');
            for (Lead l : saved) {
                Assert.areEqual('Postgraduate_Coursework', l.Study_Level__c, 'Study Level is saved on every Lead');
                Assert.areEqual('International', l.Citizenship_Status__c, 'Citizenship Status is saved on every Lead');
                Assert.areEqual('2027_T1', l.Preferred_Intake__c, 'Preferred Intake is saved on every Lead');
                Assert.areEqual(programId, l.Program_of_Interest__c, 'Program of Interest is saved on every Lead');
            }
        }
    }

    // Denial (TST-03, SHR-15): a persona without Lead access can neither write nor read enquiry details.

    @IsTest
    static void shouldRefuseEnquiryDetailsToMinimumAccessPersona() {
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'DENY')[0], programId('ACTIVE-0'));
        Boolean refused = false;
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            try {
                Database.insert(l, AccessLevel.USER_MODE);
                Assert.fail('A persona with no Lead access created a Lead with enquiry details');
            } catch (System.SecurityException e) {
                // User mode reports a missing object permission as "Access to entity 'Lead' denied".
                Assert.isTrue(e.getMessage().contains('Access to entity \'Lead\' denied'), 'Refused for missing Lead access: ' + e.getMessage());
                refused = true;
            }
        }
        Assert.isTrue(refused, 'A persona with no Lead access must not create Leads');
        Assert.areEqual(0, [SELECT COUNT() FROM Lead WHERE LastName = 'DENY-0'], 'No Lead was saved');
    }

    @IsTest
    static void shouldRefuseEnquiryDetailsReadToMinimumAccessPersona() {
        Lead l = withEnquiryDetails(TestDataFactory.buildLeads(1, 'HIDDEN')[0], programId('ACTIVE-0'));
        // System mode on purpose (APX-22): setup data the denied persona then tries to read.
        Database.insert(l, AccessLevel.SYSTEM_MODE);
        Boolean refused = false;
        System.runAs(TestPersonaFactory.get(TestPersonas.MINIMUM_ACCESS)) {
            try {
                List<Lead> visible = [SELECT Study_Level__c, Citizenship_Status__c FROM Lead WHERE Id = :l.Id WITH USER_MODE];
                Assert.fail('The persona read ' + visible.size() + ' Leads with enquiry details');
            } catch (System.QueryException e) {
                // User mode refuses a query on a standard object the user cannot read as "not supported"
                // (observed in the sandbox, .agent/5/diagnostics/developer-1-lead-denial-exceptions.txt).
                Assert.isTrue(e.getMessage().contains('sObject type \'Lead\' is not supported'), 'Refused for missing Lead access: ' + e.getMessage());
                refused = true;
            }
        }
        Assert.isTrue(refused, 'A persona with no Lead access must not read enquiry details');
    }

    private static Lead withEnquiryDetails(Lead l, Id programId) {
        l.Study_Level__c = 'Postgraduate_Coursework';
        l.Citizenship_Status__c = 'International';
        l.Preferred_Intake__c = '2027_T1';
        l.Program_of_Interest__c = programId;
        return l;
    }

    private static Id programId(String programCode) {
        // System mode on purpose (APX-22): looks up setup data; the test runner holds no FLS on Program fields.
        return [SELECT Id FROM Program__c WHERE Program_Code__c = :programCode WITH SYSTEM_MODE].Id;
    }

    private static Map<String, String> activeValues(Schema.DescribeFieldResult field) {
        Map<String, String> labelsByValue = new Map<String, String>();
        for (Schema.PicklistEntry e : field.getPicklistValues()) {
            if (e.isActive()) {
                labelsByValue.put(e.getValue(), e.getLabel());
            }
        }
        return labelsByValue;
    }
}
